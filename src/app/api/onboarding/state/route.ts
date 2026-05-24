import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuthWithTenant } from "@/lib/tenant";

const postSchema = z.object({
  state: z.enum(["skipped", "completed"]),
});

export async function GET(request: NextRequest) {
  const auth = await requireAuthWithTenant(request);
  if (!auth.ok) return auth.response;
  const { userId } = auth.ctx;

  try {
    const [user] = await db
      .select({ onboardingState: users.onboardingState })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return NextResponse.json({ state: user?.onboardingState ?? null });
  } catch (error) {
    console.error("[onboarding/state] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthWithTenant(request);
  if (!auth.ok) return auth.response;
  const { userId } = auth.ctx;

  try {
    const body = await request.json();
    const parsed = postSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid state value", details: parsed.error.issues },
        { status: 400 }
      );
    }

    await db
      .update(users)
      .set({
        onboardingState: parsed.data.state,
        onboardingUpdatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[onboarding/state] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
