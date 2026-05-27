// Welcome email — fires once after successful registration (cohort A drip, Touch 1).
// Resend is imported lazily so the module loads even when RESEND_API_KEY is absent.

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!
  ));
}

function escapeAttr(s: string): string {
  return s.replace(/["<>]/g, (c) => ({ '"': "&quot;", "<": "&lt;", ">": "&gt;" }[c]!));
}

const SUBJECT = "ContentRadar — добавь первых креаторов за 5 минут";

function buildText(firstName: string, loomLink: string, dashboardLink: string): string {
  return `Привет, ${firstName}.

Это Джек из ContentRadar.

Ты только что зарегистрировался — у тебя 14 дней, чтобы подключить своих
креаторов и посмотреть, кто реально работает на твой бренд.

Самое быстрое включение:

1. Короткое видео — как добавить первого креатора: ${loomLink}
2. Открыть дашборд → добавить 2–3 своих креатора: ${dashboardLink}

Через 24 часа увидишь первые данные: просмотры, лайки, тренды по неделям.
Без скринов от креаторов и Excel.

Если что-то не понятно — ответь прямо на это письмо, я сам читаю.

— Джек
ContentRadar · jack@contentradar.app`;
}

function buildHtml(firstName: string, loomLink: string, dashboardLink: string): string {
  const fn = escapeHtml(firstName);
  const loom = escapeAttr(loomLink);
  const dash = escapeAttr(dashboardLink);

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${SUBJECT}</title>
</head>
<body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;line-height:1.55;">
<span style="display:none!important;visibility:hidden;mso-hide:all;font-size:1px;color:#f6f7f9;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">Дашборд с TikTok, Shorts и Reels уже ждёт. Без скринов и Excel.</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f7f9;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:8px;padding:32px;">
        <tr><td style="font-size:16px;">
          <p style="margin:0 0 16px;">Привет, ${fn}.</p>
          <p style="margin:0 0 16px;">Это Джек из ContentRadar.</p>
          <p style="margin:0 0 16px;">Ты только что зарегистрировался — у тебя 14 дней, чтобы подключить своих креаторов и посмотреть, кто реально работает на твой бренд.</p>
          <p style="margin:0 0 8px;font-weight:600;">Самое быстрое включение:</p>
          <ol style="margin:0 0 16px;padding-left:20px;">
            <li style="margin-bottom:8px;">Короткое видео — как добавить первого креатора: <a href="${loom}" style="color:#1a73e8;text-decoration:underline;">${loom}</a></li>
            <li>Открыть дашборд → добавить 2–3 своих креатора: <a href="${dash}" style="color:#1a73e8;text-decoration:underline;">contentradar.app/dashboard</a></li>
          </ol>
          <p style="margin:0 0 16px;">Через 24 часа увидишь первые данные: просмотры, лайки, тренды по неделям. Без скринов от креаторов и Excel.</p>
          <p style="margin:0 0 16px;">Если что-то не понятно — ответь прямо на это письмо, я сам читаю.</p>
          <p style="margin:0;">— Джек</p>
        </td></tr>
      </table>
      <p style="font-size:12px;color:#888;margin:16px 0 0;">ContentRadar · <a href="mailto:jack@contentradar.app" style="color:#888;">jack@contentradar.app</a></p>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export async function sendWelcomeEmail(params: {
  email: string;
  firstName: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[welcome-email] RESEND_API_KEY not set, skipping");
    return;
  }

  const loomLink = process.env.WELCOME_LOOM_URL ?? "https://contentradar.app/welcome";
  const dashboardLink = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://contentradar.app"}/dashboard?ref=welcome`;
  const firstName = params.firstName.trim() || "коллега";

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  const { error } = await resend.emails.send({
    from: "Джек / ContentRadar <jack@contentradar.app>",
    replyTo: "jack@contentradar.app",
    to: params.email,
    subject: SUBJECT,
    html: buildHtml(firstName, loomLink, dashboardLink),
    text: buildText(firstName, loomLink, dashboardLink),
    tags: [
      { name: "cohort", value: "A" },
      { name: "touch", value: "welcome" },
      { name: "drip_version", value: "v0.1" },
    ],
  });

  if (error) {
    console.error("[welcome-email] Resend error:", error);
  }
}
