import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { db } from "@/db";
import { inviteTokens, users } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { requireOwner } from "@/lib/tenant";

const CreateInviteSchema = z.object({
  email: z.string().email().optional(),
  creatorId: z.string().uuid().optional(),
});

/** GET /api/invites — list team members + pending invites. Owner only. */
export async function GET(req: NextRequest) {
  const auth = await requireOwner(req);
  if (!auth.ok) return auth.response;
  const { tenantId, userId } = auth.ctx;

  const members = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, createdAt: users.createdAt })
    .from(users)
    .where(and(eq(users.tenantId, tenantId)));

  const pendingInvites = await db
    .select({ token: inviteTokens.token, email: inviteTokens.email, expiresAt: inviteTokens.expiresAt, createdAt: inviteTokens.createdAt })
    .from(inviteTokens)
    .where(and(eq(inviteTokens.tenantId, tenantId), isNull(inviteTokens.usedAt)));

  // Filter out expired pending invites on the fly (no need for extra DB query)
  const now = new Date();
  const activePendingInvites = pendingInvites.filter((i) => i.expiresAt > now);

  return NextResponse.json({
    members: members.filter((m) => m.id !== userId),
    pendingInvites: activePendingInvites,
    me: members.find((m) => m.id === userId) ?? null,
  });
}

/** POST /api/invites — create invite link (+ optional email). Owner only. */
export async function POST(req: NextRequest) {
  const auth = await requireOwner(req);
  if (!auth.ok) return auth.response;
  const { tenantId, userId } = auth.ctx;

  let email: string | undefined;
  let creatorId: string | undefined;
  try {
    const body = await req.json();
    const parsed = CreateInviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    email = parsed.data.email;
    creatorId = parsed.data.creatorId;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await db.insert(inviteTokens).values({ token, tenantId, invitedByUserId: userId, email: email ?? null, creatorId: creatorId ?? null, expiresAt });

  // Derive origin from request header — same fix as TRU-226 (NEXTAUTH_URL mismatch).
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const baseUrl = host
    ? `${proto}://${host}`
    : (process.env.NEXTAUTH_URL ?? "https://app.contentradar.app");
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
            ${inviter?.name ?? "Владелец аккаунта"} приглашает вас присоединиться как креатор. Ссылка действительна 7 дней.
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
