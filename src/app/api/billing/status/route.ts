import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { requireAuthWithTenant } from "@/lib/tenant";
import { db } from "@/db";
import { subscriptions, payments } from "@/db/schema";

export async function GET(request: NextRequest) {
  const auth = await requireAuthWithTenant(request);
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.ctx;

  try {
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, tenantId))
      .limit(1);

    const recentPayments = await db
      .select({
        id: payments.id,
        type: payments.type,
        tier: payments.tier,
        amountKopecks: payments.amountKopecks,
        status: payments.status,
        paidAt: payments.paidAt,
        createdAt: payments.createdAt,
      })
      .from(payments)
      .where(eq(payments.tenantId, tenantId))
      .orderBy(desc(payments.createdAt))
      .limit(10);

    return NextResponse.json({
      subscription: subscription ?? null,
      payments: recentPayments,
    });
  } catch (error) {
    console.error("[billing/status] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
