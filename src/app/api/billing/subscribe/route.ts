import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthWithTenant } from "@/lib/tenant";
import { db } from "@/db";
import { payments } from "@/db/schema";
import {
  createPayment,
  TIER_CONFIG,
  type BillingTier,
} from "@/lib/yookassa";

const SubscribeSchema = z.object({
  tier: z.enum(["solo", "pro", "studio"]),
});

export async function POST(request: NextRequest) {
  const auth = await requireAuthWithTenant(request);
  if (!auth.ok) return auth.response;
  const { tenantId, userId } = auth.ctx;

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
      tenantId,
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
