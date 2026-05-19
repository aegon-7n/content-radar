import { NextResponse } from "next/server";
import { db } from "@/db";
import { inviteTokens, tenants, users } from "@/db/schema";
import { eq } from "drizzle-orm";

/** GET /api/auth/invite/[token] — validate token, return tenant metadata. Public. */
export async function GET(
  _req: Request,
  { params }: { params: { token: string } },
) {
  const [row] = await db
    .select({
      token: inviteTokens.token,
      email: inviteTokens.email,
      expiresAt: inviteTokens.expiresAt,
      usedAt: inviteTokens.usedAt,
      tenantId: inviteTokens.tenantId,
      invitedByUserId: inviteTokens.invitedByUserId,
    })
    .from(inviteTokens)
    .where(eq(inviteTokens.token, params.token))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Ссылка недействительна." }, { status: 404 });
  }
  if (row.usedAt) {
    return NextResponse.json({ error: "Это приглашение уже было использовано." }, { status: 400 });
  }
  if (new Date() > row.expiresAt) {
    return NextResponse.json({ error: "Срок приглашения истёк." }, { status: 400 });
  }

  const [tenant] = await db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, row.tenantId))
    .limit(1);

  const [inviter] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, row.invitedByUserId))
    .limit(1);

  return NextResponse.json({
    tenantName: tenant?.name ?? "",
    inviterName: inviter?.name ?? "",
    email: row.email ?? null,
  });
}
