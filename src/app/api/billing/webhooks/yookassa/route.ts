import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { payments, subscriptions } from "@/db/schema";
import { getPayment, TIER_CONFIG, type BillingTier } from "@/lib/yookassa";

// ЮKassa doesn't use HMAC signatures. We verify by re-fetching the payment
// via the API to confirm its real status. This is the recommended approach
// per ЮKassa docs when IP whitelisting isn't feasible behind a reverse proxy.

interface WebhookBody {
  type: string;
  event: string;
  object: {
    id: string;
    status: string;
    metadata?: Record<string, string>;
  };
}

export async function POST(request: NextRequest) {
  let body: WebhookBody;
  try {
    body = (await request.json()) as WebhookBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const event = body.event;
  const paymentId = body.object?.id;

  if (!paymentId) {
    return NextResponse.json({ error: "missing payment id" }, { status: 400 });
  }

  // Re-fetch from ЮKassa API to verify authenticity
  let verified;
  try {
    verified = await getPayment(paymentId);
  } catch (error) {
    console.error("[billing/webhook] verification failed:", error);
    return NextResponse.json(
      { error: "verification failed" },
      { status: 502 },
    );
  }

  if (event === "payment.succeeded" && verified.status === "succeeded") {
    await handlePaymentSucceeded(paymentId, verified.metadata);
  } else if (event === "payment.canceled" && verified.status === "canceled") {
    await handlePaymentCanceled(paymentId);
  }

  return NextResponse.json({ ok: true });
}

async function handlePaymentSucceeded(
  yookassaPaymentId: string,
  metadata: Record<string, string>,
) {
  const [payment] = await db
    .update(payments)
    .set({ status: "succeeded", paidAt: new Date() })
    .where(eq(payments.yookassaPaymentId, yookassaPaymentId))
    .returning();

  if (!payment) {
    console.error(
      "[billing/webhook] payment not found:",
      yookassaPaymentId,
    );
    return;
  }

  if (payment.type === "subscription" && payment.tier) {
    const tier = payment.tier as BillingTier;
    const config = TIER_CONFIG[tier];
    if (!config) {
      console.error("[billing/webhook] unknown tier:", tier);
      return;
    }

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const existingSub = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, payment.userId))
      .limit(1);

    if (existingSub.length > 0) {
      await db
        .update(subscriptions)
        .set({
          tier,
          status: "active",
          creatorLimit: config.creatorLimit,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          updatedAt: now,
        })
        .where(eq(subscriptions.id, existingSub[0].id));

      await db
        .update(payments)
        .set({ subscriptionId: existingSub[0].id })
        .where(eq(payments.id, payment.id));
    } else {
      const [sub] = await db
        .insert(subscriptions)
        .values({
          userId: payment.userId,
          tier,
          status: "active",
          creatorLimit: config.creatorLimit,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        })
        .returning();

      await db
        .update(payments)
        .set({ subscriptionId: sub.id })
        .where(eq(payments.id, payment.id));
    }

    await sendTelegramNotification(
      `💰 Оплата подписки ${config.label}: ${(payment.amountKopecks / 100).toLocaleString("ru-RU")} ₽`,
    );
  }
}

async function handlePaymentCanceled(yookassaPaymentId: string) {
  await db
    .update(payments)
    .set({ status: "cancelled" })
    .where(eq(payments.yookassaPaymentId, yookassaPaymentId));
}

async function sendTelegramNotification(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const res = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[billing/webhook] Telegram error:", res.status, body);
  }
}
