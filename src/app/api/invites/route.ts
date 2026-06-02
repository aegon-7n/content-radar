import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { db } from "@/db";
import { creators, inviteTokens, users } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { requireOwner } from "@/lib/tenant";

const CreateInviteSchema = z.object({
  creatorId: z.string().uuid("creatorId must be a valid UUID."),
});

/** GET /api/invites — list team members + pending invites. Owner only. */
export async function GET(req: NextRequest) {
  const auth = await requireOwner(req);
  if (!auth.ok) return auth.response;
  const { tenantId, userId } = auth.ctx;

  const members = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      creatorId: users.creatorId,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(eq(users.tenantId, tenantId)));

  const pendingRows = await db
    .select({
      token: inviteTokens.token,
      email: inviteTokens.email,
      creatorId: inviteTokens.creatorId,
      expiresAt: inviteTokens.expiresAt,
      createdAt: inviteTokens.createdAt,
    })
    .from(inviteTokens)
    .where(and(eq(inviteTokens.tenantId, tenantId), isNull(inviteTokens.usedAt)));

  // Join creator names for pending invites.
  const creatorIds = [...new Set(pendingRows.map((r) => r.creatorId))];
  let creatorNameMap: Record<string, string> = {};
  if (creatorIds.length > 0) {
    const creatorRows = await db
      .select({ id: creators.id, name: creators.name })
      .from(creators)
      .where(eq(creators.tenantId, tenantId));
    for (const c of creatorRows) {
      creatorNameMap[c.id] = c.name;
    }
  }

  const now = new Date();
  const pendingInvites = pendingRows
    .filter((i) => i.expiresAt > now)
    .map((i) => ({
      token: i.token,
      email: i.email,
      creatorId: i.creatorId,
      creatorName: creatorNameMap[i.creatorId] ?? null,
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
    }));

  return NextResponse.json({
    members: members.filter((m) => m.id !== userId),
    pendingInvites,
    me: members.find((m) => m.id === userId) ?? null,
  });
}

/** POST /api/invites — create invite link for a specific creator. Owner only. */
export async function POST(req: NextRequest) {
  const auth = await requireOwner(req);
  if (!auth.ok) return auth.response;
  const { tenantId, userId } = auth.ctx;

  let creatorId: string;
  try {
    const body = await req.json();
    const parsed = CreateInviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request." },
        { status: 400 },
      );
    }
    creatorId = parsed.data.creatorId;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  // Validate the creator belongs to this tenant.
  const [creator] = await db
    .select({ id: creators.id, name: creators.name })
    .from(creators)
    .where(and(eq(creators.id, creatorId), eq(creators.tenantId, tenantId)))
    .limit(1);

  if (!creator) {
    return NextResponse.json(
      { error: "Креатор не найден. Сначала добавьте его в Настройки → Креаторы." },
      { status: 404 },
    );
  }

  // Block if this creator already has a user account in the team.
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.creatorId, creatorId)))
    .limit(1);

  if (existingUser) {
    return NextResponse.json(
      { error: "Этот креатор уже принял приглашение и имеет аккаунт." },
      { status: 409 },
    );
  }

  // Idempotency: return existing active invite for this creator if one exists.
  const now = new Date();
  const [existingInvite] = await db
    .select({ token: inviteTokens.token })
    .from(inviteTokens)
    .where(
      and(
        eq(inviteTokens.tenantId, tenantId),
        eq(inviteTokens.creatorId, creatorId),
        isNull(inviteTokens.usedAt),
      ),
    )
    .limit(1);

  if (existingInvite) {
    const [row] = await db
      .select({ expiresAt: inviteTokens.expiresAt })
      .from(inviteTokens)
      .where(eq(inviteTokens.token, existingInvite.token))
      .limit(1);
    if (row && row.expiresAt > now) {
      const baseUrl = process.env.NEXTAUTH_URL ?? "https://contentradar.app";
      return NextResponse.json({ token: existingInvite.token, inviteUrl: `${baseUrl}/invite/${existingInvite.token}` });
    }
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db.insert(inviteTokens).values({
    token,
    tenantId,
    invitedByUserId: userId,
    email: null,
    creatorId,
    expiresAt,
  });

  const baseUrl = process.env.NEXTAUTH_URL ?? "https://contentradar.app";
  const inviteUrl = `${baseUrl}/invite/${token}`;

  // Send email if Resend is configured and we have an email to send to.
  // (No email field on creators yet — skip silently.)

  return NextResponse.json({ token, inviteUrl });
}
