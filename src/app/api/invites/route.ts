import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { db } from "@/db";
import { creators, inviteTokens, users } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { requireOwner } from "@/lib/tenant";

const CreateInviteSchema = z.object({
  creatorId: z.string().uuid("Некорректный creatorId."),
  email: z.string().email().optional(),
});

/** GET /api/invites — list team members + pending invites. Owner only. */
export async function GET(req: NextRequest) {
  const auth = await requireOwner(req);
  if (!auth.ok) return auth.response;
  const { tenantId, userId } = auth.ctx;

  const members = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, createdAt: users.createdAt, creatorId: users.creatorId })
    .from(users)
    .where(and(eq(users.tenantId, tenantId)));

  // Join pending invites with creator name so the UI can show who was invited.
  const pendingInvites = await db
    .select({
      token: inviteTokens.token,
      email: inviteTokens.email,
      creatorId: inviteTokens.creatorId,
      creatorName: creators.name,
      expiresAt: inviteTokens.expiresAt,
      createdAt: inviteTokens.createdAt,
    })
    .from(inviteTokens)
    .leftJoin(creators, eq(creators.id, inviteTokens.creatorId))
    .where(and(eq(inviteTokens.tenantId, tenantId), isNull(inviteTokens.usedAt)));

  const now = new Date();
  const activePendingInvites = pendingInvites.filter((i) => i.expiresAt > now);

  return NextResponse.json({
    members: members.filter((m) => m.id !== userId),
    pendingInvites: activePendingInvites,
    me: members.find((m) => m.id === userId) ?? null,
  });
}

/** POST /api/invites — create invite link for a specific creator. Owner only. */
export async function POST(req: NextRequest) {
  const auth = await requireOwner(req);
  if (!auth.ok) return auth.response;
  const { tenantId, userId } = auth.ctx;

  let creatorId: string;
  let email: string | undefined;
  try {
    const body = await req.json();
    const parsed = CreateInviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    creatorId = parsed.data.creatorId;
    email = parsed.data.email;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  // Validate creator belongs to this tenant and is not archived.
  const [creator] = await db
    .select({ id: creators.id, name: creators.name })
    .from(creators)
    .where(and(eq(creators.id, creatorId), eq(creators.tenantId, tenantId), isNull(creators.archivedAt)))
    .limit(1);

  if (!creator) {
    return NextResponse.json({ error: "Креатор не найден. Сначала добавьте креатора в настройках." }, { status: 400 });
  }

  // Prevent duplicate: creator already has an active user account.
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.creatorId, creatorId)))
    .limit(1);

  if (existingUser) {
    return NextResponse.json({ error: `У этого креатора уже есть аккаунт в команде.` }, { status: 409 });
  }

  // Idempotency: if there's already an active pending invite for this creator, return it.
  const now = new Date();
  const [existingInvite] = await db
    .select({ token: inviteTokens.token, expiresAt: inviteTokens.expiresAt })
    .from(inviteTokens)
    .where(and(eq(inviteTokens.tenantId, tenantId), eq(inviteTokens.creatorId, creatorId), isNull(inviteTokens.usedAt)))
    .limit(1);

  if (existingInvite && existingInvite.expiresAt > now) {
    const baseUrl = process.env.NEXTAUTH_URL ?? "https://contentradar.app";
    return NextResponse.json({ token: existingInvite.token, inviteUrl: `${baseUrl}/invite/${existingInvite.token}` });
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await db.insert(inviteTokens).values({
    token,
    tenantId,
    invitedByUserId: userId,
    email: email ?? null,
    creatorId,
    expiresAt,
  });

  const baseUrl = process.env.NEXTAUTH_URL ?? "https://contentradar.app";
  const inviteUrl = `${baseUrl}/invite/${token}`;

  // Send invite email if email was provided and Resend is configured.
  if (email) {
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const [inviter] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
      const html = `<!DOCTYPE html>
<html lang="ru"><head><meta charset="UTF-8"><title>Приглашение в ContentRadar</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
        <tr><td style="background:#5b5bd6;padding:28px 36px;">
          <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-.3px;">ContentRadar</span>
        </td></tr>
        <tr><td style="padding:32px 36px 24px;">
          <p style="margin:0 0 16px;font-size:16px;color:#0f172a;font-weight:600;">Вас пригласили в ContentRadar</p>
          <p style="margin:0 0 20px;font-size:14px;color:#334155;line-height:1.6;">
            ${inviter?.name ?? "Владелец аккаунта"} приглашает вас присоединиться как креатор${creator.name ? ` (${creator.name})` : ""}. Ссылка действительна 7 дней.
          </p>
          <a href="${inviteUrl}" style="display:inline-block;background:#5b5bd6;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">Принять приглашение</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
      try {
        const { Resend } = await import("resend");
        const resend = new Resend(resendKey);
        const { error } = await resend.emails.send({
          from: "ContentRadar <noreply@contentradar.app>",
          to: email,
          subject: "Приглашение в ContentRadar",
          html,
        });
        if (error) console.error("[invites] Resend error:", error);
      } catch (err) {
        console.error("[invites] Email send failed:", err);
      }
    }
  }

  return NextResponse.json({ token, inviteUrl });
}
