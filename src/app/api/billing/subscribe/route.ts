import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db";
import { users, payments, subscriptions } from "@/db/schema";
import {
  createPayment,
  TIER_CONFIG,
  type BillingTier,
} from "@/lib/yookassa";

let defaultUserId: string | null = null;

async function getDefaultUserId(): Promise<string> {
  if (defaultUserId) return defaultUserId;
  const result = await db.select({ id: users.id }).from(users).limit(1);
  if (!result.length) throw new Error("No users found in database");
  defaultUserId = result[0].id;
  return defaultUserId;
}

const SubscribeSchema = z.object({
  tier: z.enum(["starter", "growth", "brand"]),
});

export async function POST(request: NextRequest) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = SubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }

  const { tier } = parsed.data;
  const config = TIER_CONFIG[tier as BillingTier];
  const userId = await getDefaultUserId();

  const returnUrl = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/settings?tab=billing&status=success`;

  try {
    const yookassaPayment = await createPayment({
      amountKopecks: config.priceKopecks,
      description: `ContentRadar ${config.label} — ежемесячная подписка`,
      returnUrl,
      metadata: { userId, tier, type: "subscription" },
    });

    await db.insert(payments).values({
      userId,
      yookassaPaymentId: yookassaPayment.id,
      type: "subscription",
      tier,
      amountKopecks: config.priceKopecks,
      currency: "RUB",
      status: "pending",
    });

    return NextResponse.json({
      paymentUrl: yookassaPayment.confirmation?.confirmation_url,
      paymentId: yookassaPayment.id,
    });
  } catch (error) {
    console.error("[billing/subscribe] error:", error);
    return NextResponse.json(
      { error: "payment creation failed" },
      { status: 502 },
    );
  }
}
