import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { referralCodes } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuthWithTenant } from "@/lib/tenant";

const createSchema = z.object({
  code: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[A-Z0-9_-]+$/, "Code must be uppercase letters, digits, _ or -"),
  partnerName: z.string().min(1).max(200),
});

export async function GET(request: NextRequest) {
  const auth = await requireAuthWithTenant(request);
  if (!auth.ok) return auth.response;

  const codes = await db
    .select()
    .from(referralCodes)
    .orderBy(desc(referralCodes.createdAt));

  return NextResponse.json({ codes });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthWithTenant(request);
  if (!auth.ok) return auth.response;
  if (auth.ctx.role !== "owner") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }

  const { code, partnerName } = parsed.data;

  try {
    const [created] = await db
      .insert(referralCodes)
      .values({ code: code.toUpperCase(), partnerName })
      .returning();
    return NextResponse.json({ code: created }, { status: 201 });
  } catch (err: unknown) {
    const pg = err as { code?: string };
    if (pg.code === "23505") {
      return NextResponse.json({ error: "Code already exists" }, { status: 409 });
    }
    console.error("[admin/referral-codes] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuthWithTenant(request);
  if (!auth.ok) return auth.response;
  if (auth.ctx.role !== "owner") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "code param required" }, { status: 400 });
  }

  await db.delete(referralCodes).where(eq(referralCodes.code, code));
  return NextResponse.json({ ok: true });
}
