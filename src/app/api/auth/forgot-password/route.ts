import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { db } from "@/db";
import { passwordResetTokens } from "@/db/schema";
import { eq } from "drizzle-orm";

const bodySchema = z.object({ email: z.string().email() });

export async function POST(request: Request) {
  let email: string;
  try {
    const body = await request.json();
    ({ email } = bodySchema.parse(body));
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Always return the same response to prevent email enumeration.
  const OK = NextResponse.json({ ok: true });

  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@content-radar.ru";
  if (email.toLowerCase() !== adminEmail.toLowerCase()) return OK;

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  try {
    // Remove any previous unused tokens for this email before inserting.
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.email, email));
    await db.insert(passwordResetTokens).values({ token, email, expiresAt });
  } catch (err) {
    console.error("[forgot-password] DB error:", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.warn("[forgot-password] RESEND_API_KEY not set — skipping email.");
    return OK;
  }

  const resetUrl = `${process.env.NEXTAUTH_URL ?? "https://contentradar.app"}/reset-password?token=${token}`;
  const html = `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><title>Сброс пароля</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
        <tr><td style="background:#5b5bd6;padding:28px 36px;">
          <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-.3px;">ContentRadar</span>
        </td></tr>
        <tr><td style="padding:32px 36px 24px;">
          <p style="margin:0 0 16px;font-size:16px;color:#0f172a;font-weight:600;">Сброс пароля</p>
          <p style="margin:0 0 20px;font-size:14px;color:#334155;line-height:1.6;">
            Нажмите кнопку ниже, чтобы задать новый пароль. Ссылка действительна 1 час.
          </p>
          <a href="${resetUrl}" style="display:inline-block;background:#5b5bd6;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">Задать новый пароль</a>
          <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;">
            Если вы не запрашивали сброс пароля — проигнорируйте это письмо.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(resendKey);
    const { error } = await resend.emails.send({
      from: "ContentRadar <noreply@contentradar.app>",
      to: email,
      subject: "Сброс пароля ContentRadar",
      html,
    });
    if (error) console.error("[forgot-password] Resend error:", error);
  } catch (err) {
    console.error("[forgot-password] Email send failed:", err);
  }

  return OK;
}
