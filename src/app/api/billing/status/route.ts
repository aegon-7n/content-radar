import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db";
import { users, subscriptions, payments } from "@/db/schema";

let defaultUserId: string | null = null;

async function getDefaultUserId(): Promise<string> {
  if (defaultUserId) return defaultUserId;
  const result = await db.select({ id: users.id }).from(users).limit(1);
  if (!result.length) throw new Error("No users found in database");
  defaultUserId = result[0].id;
  return defaultUserId;
}

export async function GET(request: NextRequest) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  try {
    const userId = await getDefaultUserId();

    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
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
      .where(eq(payments.userId, userId))
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
