import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, passwordResetTokens } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import crypto from "crypto";

const schema = z.object({
  email: z.string().email(),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: true }); // always 200 to prevent enumeration
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: true }); // always 200
  }

  const { email } = parsed.data;

  try {
    const [user] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    // Always return 200 regardless of whether user exists (prevent enumeration)
    if (!user) {
      return NextResponse.json({ ok: true });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.insert(passwordResetTokens).values({
      token,
      email: user.email,
      expiresAt,
    });

    // Derive origin from the request so the link works even if NEXTAUTH_URL
    // still points to the old domain (e.g. contentradar.app vs app.contentradar.app).
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
    const appOrigin = host
      ? `${proto}://${host}`
      : (process.env.NEXTAUTH_URL ?? "http://localhost:3000");
    const resetUrl = `${appOrigin}/reset-password?token=${token}`;

    if (process.env.RESEND_API_KEY) {
      try {
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: "ContentRadar <noreply@content-radar.ru>",
          to: user.email,
          subject: "Сброс пароля ContentRadar",
          html: `
            <p>Вы запросили сброс пароля для вашего аккаунта ContentRadar.</p>
            <p>Перейдите по ссылке, чтобы установить новый пароль:</p>
            <p><a href="${resetUrl}">${resetUrl}</a></p>
            <p>Ссылка действительна 1 час. Если вы не запрашивали сброс пароля — просто проигнорируйте это письмо.</p>
          `,
        });
      } catch (emailError) {
        console.error("[forgot-password] Resend error:", emailError);
      }
    } else {
      console.warn("[forgot-password] RESEND_API_KEY not set. Reset URL:", resetUrl);
    }
  } catch (error) {
    console.error("[forgot-password] error:", error);
  }

  return NextResponse.json({ ok: true });
}
