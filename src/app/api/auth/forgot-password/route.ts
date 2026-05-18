import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const Schema = z.object({
  email: z.string().email().max(254),
});

async function notifyTelegram(email: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const text =
    `🔑 <b>Запрос на сброс пароля</b>\n` +
    `Email: <code>${email}</code>\n\n` +
    `Чтобы сбросить пароль, обновите переменную <code>ADMIN_PASSWORD</code> на сервере и перезапустите приложение:\n` +
    `<pre>pm2 restart content-radar</pre>`;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  }).catch(() => {});
}

async function notifyEmail(email: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const from = process.env.RESEND_FROM_EMAIL ?? "ContentRadar <noreply@contentradar.app>";

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  await resend.emails.send({
    from,
    to: email,
    subject: "Запрос на восстановление пароля — ContentRadar",
    html: `
      <p>Вы запросили восстановление доступа к ContentRadar.</p>
      <p>Для смены пароля обратитесь к администратору системы или свяжитесь с поддержкой.</p>
      <p style="color:#888;font-size:12px">Если вы не запрашивали сброс пароля — просто проигнорируйте это письмо.</p>
    `,
  }).catch(() => {});
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { email } = parsed.data;
  const adminEmail = process.env.ADMIN_EMAIL ?? "";

  // Only notify if the email matches the registered admin; always return 200 to avoid enum
  if (adminEmail && email.toLowerCase() === adminEmail.toLowerCase()) {
    await Promise.allSettled([
      notifyTelegram(email),
      notifyEmail(email),
    ]);
  }

  return NextResponse.json({ ok: true });
}
