import { NextRequest, NextResponse } from "next/server";
import { eq, desc, count, and, gte } from "drizzle-orm";
import { requireAuthWithTenant } from "@/lib/tenant";
import { db } from "@/db";
import { subscriptions, payments, creators, videos } from "@/db/schema";
import { getTuPool, getCurrentPeriodStart } from "@/lib/yookassa";

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

    // TU pool: monthly allowance for this tenant (from subscription tier).
    const tuPool = getTuPool(subscription?.tier);
    const periodStart = getCurrentPeriodStart();

    // Per-creator usage = videos added in the current calendar month.
    const creatorRows = await db
      .select({
        id: creators.id,
        name: creators.name,
        videoLimit: creators.videoLimit,
      })
      .from(creators)
      .where(eq(creators.tenantId, tenantId));

    const byCreator = await Promise.all(
      creatorRows.map(async (c) => {
        const [row] = await db
          .select({ count: count() })
          .from(videos)
          .where(
            and(
              eq(videos.creatorId, c.id),
              eq(videos.tenantId, tenantId),
              gte(videos.createdAt, periodStart),
            )
          );
        const used = Number(row?.count ?? 0);
        return {
          id: c.id,
          name: c.name,
          videoLimit: c.videoLimit ?? null,
          videosUsed: used,
          atLimit: c.videoLimit !== null && used >= c.videoLimit,
        };
      })
    );

    const totalUsed = byCreator.reduce((s, c) => s + c.videosUsed, 0);
    const poolUsedPct = tuPool > 0 ? Math.round((totalUsed / tuPool) * 100) : 0;

    return NextResponse.json({
      subscription: subscription ?? null,
      payments: recentPayments,
      tu: {
        pool: tuPool,
        used: totalUsed,
        usedPct: poolUsedPct,
        byCreator,
      },
    });
  } catch (error) {
    console.error("[billing/status] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
