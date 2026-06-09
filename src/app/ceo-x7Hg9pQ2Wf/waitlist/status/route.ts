import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { waitlistSignups } from "@/db/schema";
import { eq } from "drizzle-orm";

// Middleware already verifies Basic Auth for all /ceo-* paths.

const Schema = z.object({
  waitlistId: z.number().int().positive(),
  status: z.enum(["new", "awaiting_call", "rejected"]),
});

export async function PATCH(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
  }

  const { waitlistId, status } = parsed.data;

  const rows = await db
    .update(waitlistSignups)
    .set({ status })
    .where(eq(waitlistSignups.id, waitlistId))
    .returning({ id: waitlistSignups.id });

  if (rows.length === 0) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
