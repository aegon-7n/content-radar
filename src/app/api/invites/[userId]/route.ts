import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireOwner } from "@/lib/tenant";

/** DELETE /api/invites/[userId] — revoke a creator's access. Owner only. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { userId: string } },
) {
  const auth = await requireOwner(req);
  if (!auth.ok) return auth.response;
  const { tenantId, userId: callerId } = auth.ctx;

  const targetId = params.userId;
  if (targetId === callerId) {
    return NextResponse.json({ error: "Cannot revoke yourself." }, { status: 400 });
  }

  const [target] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(and(eq(users.id, targetId), eq(users.tenantId, tenantId)))
    .limit(1);

  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  if (target.role !== "creator") {
    return NextResponse.json({ error: "Can only revoke creators." }, { status: 400 });
  }

  await db.delete(users).where(and(eq(users.id, targetId), eq(users.tenantId, tenantId)));

  return NextResponse.json({ ok: true });
}
