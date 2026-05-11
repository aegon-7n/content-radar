import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/db";
import { waitlistSignups } from "@/db/schema";

// ─── Rate limiting (in-memory, per IP) ───────────────────────────────────────
// 5 requests per minute per IP. Resets rolling per-minute window.
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();

  // Stochastic cleanup of stale entries — каждый ~50-й запрос подметает Map.
  // Без этого долгоживущий процесс PM2 копит IP бесконечно.
  if (Math.random() < 0.02) {
    for (const [key, entry] of rateLimitMap) {
      if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
        rateLimitMap.delete(key);
      }
    }
  }

  const entry = rateLimitMap.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return true; // allowed
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false; // blocked
  }

  entry.count += 1;
  return true; // allowed
}

// timing-safe сравнение двух токенов одинаковой длины
function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

// ─── Input schema ─────────────────────────────────────────────────────────────
const SubmitSchema = z.object({
  email: z.string().email().max(254),
  phone: z.string().max(32).optional().nullable(),
  brand: z.string().min(1).max(200),
  creatorsRange: z.enum(["1-5", "6-20", "20+"]),
  source: z.string().max(64).optional().nullable(),
  utmSource: z.string().max(64).optional().nullable(),
  utmMedium: z.string().max(64).optional().nullable(),
  utmCampaign: z.string().max(128).optional().nullable(),
  utmContent: z.string().max(128).optional().nullable(),
  utmTerm: z.string().max(128).optional().nullable(),
  referrer: z.string().max(2048).optional().nullable(),
  consent: z.literal(true),
  consentAcceptedAt: z.string().datetime().optional(),
});

// ─── Notifications ────────────────────────────────────────────────────────────
async function sendConfirmationEmail(
  email: string,
  brand: string
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[waitlist] RESEND_API_KEY not set, skipping email");
    return;
  }

  const fromEmail =
    process.env.RESEND_FROM_EMAIL ?? "ContentRadar <noreply@contentradar.app>";

  // TODO: verify that noreply@contentradar.app domain is confirmed in Resend
  //       dashboard before going live. If domain is not verified the email
  //       will silently fail or bounce.
  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  const html = `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><title>Заявка получена</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
        <!-- Header -->
        <tr>
          <td style="background:#5b5bd6;padding:28px 36px;">
            <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-.3px;">ContentRadar</span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px 36px 24px;">
            <p style="margin:0 0 16px;font-size:16px;color:#0f172a;font-weight:600;">Привет!</p>
            <p style="margin:0 0 12px;font-size:14px;color:#334155;line-height:1.6;">
              Мы получили вашу заявку на ранний доступ к <strong>ContentRadar</strong> от бренда <strong>${brand}</strong>.
            </p>
            <p style="margin:0 0 12px;font-size:14px;color:#334155;line-height:1.6;">
              Свяжемся с вами в течение рабочего дня — ответим на вопросы и расскажем, как всё устроено.
            </p>
            <p style="margin:0 0 24px;font-size:14px;color:#334155;line-height:1.6;">
              Если есть срочные вопросы — пишите нам в Telegram.
              <!-- TODO: заменить на реальный @username поддержки -->
            </p>
            <p style="margin:0;font-size:13px;color:#64748b;">— Команда ContentRadar</p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 36px 28px;border-top:1px solid #f0f1f4;">
            <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.6;">
              Вы получили это письмо, потому что оставили заявку на contentradar.app.<br>
              Если это были не вы — просто проигнорируйте письмо.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const { error } = await resend.emails.send({
    from: fromEmail,
    to: email,
    subject: "Спасибо за заявку в ContentRadar",
    html,
  });

  if (error) {
    console.error("[waitlist] Resend error:", error);
  }
}

async function sendTelegramNotification(
  email: string,
  phone: string | null | undefined,
  brand: string,
  creatorsRange: string,
  source: string | null | undefined,
  utmCampaign: string | null | undefined,
  insertedId: number
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn(
      "[waitlist] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set, skipping notification"
    );
    return;
  }

  const text =
    `🎯 <b>Новая заявка на waitlist</b>\n` +
    `Email: <code>${email}</code>\n` +
    `Телефон: <code>${phone ?? "—"}</code>\n` +
    `Бренд: <code>${brand}</code>\n` +
    `Креаторов: <code>${creatorsRange}</code>\n` +
    `Источник: <code>${source ?? "—"}</code>\n` +
    `Кампания: <code>${utmCampaign ?? "—"}</code>\n` +
    `ID: #${insertedId}`;

  const res = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[waitlist] Telegram error:", res.status, body);
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  // 1. Bearer-token auth
  const ingestSecret = process.env.WAITLIST_INGEST_SECRET;
  if (!ingestSecret) {
    return NextResponse.json(
      { ok: false, error: "server not configured" },
      { status: 503 }
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${ingestSecret}`;
  if (!safeEqual(auth, expected)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // 2. Rate limit by IP
  // x-real-ip ставит trusted nginx-прокси перед app — ему доверяем больше.
  // x-forwarded-for[0] (самый левый) — оригинальный клиент, но клиент мог
  // подделать заголовок до nginx; для MVP-уровня rate-limit достаточно.
  const ip =
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { ok: false, error: "rate limit exceeded" },
      { status: 429 }
    );
  }

  // 3. Parse + validate
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON" },
      { status: 400 }
    );
  }

  const parsed = SubmitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }

  const {
    email, phone, brand, creatorsRange, source,
    utmSource, utmMedium, utmCampaign, utmContent, utmTerm, referrer,
    consentAcceptedAt,
  } = parsed.data;

  // 4. INSERT into waitlist_signups
  const consentAt = consentAcceptedAt
    ? new Date(consentAcceptedAt)
    : new Date();

  const [inserted] = await db
    .insert(waitlistSignups)
    .values({
      email,
      phone: phone ?? null,
      brand,
      creatorsRange,
      source: source ?? null,
      utmSource: utmSource ?? null,
      utmMedium: utmMedium ?? null,
      utmCampaign: utmCampaign ?? null,
      utmContent: utmContent ?? null,
      utmTerm: utmTerm ?? null,
      referrer: referrer ?? null,
      consentAcceptedAt: consentAt,
      status: "new",
    })
    .returning({ id: waitlistSignups.id });

  const insertedId = inserted.id;

  // 5 & 6. Notify — both in parallel, wait for both (lids are rare, latency ok)
  await Promise.allSettled([
    sendConfirmationEmail(email, brand),
    sendTelegramNotification(email, phone, brand, creatorsRange, source, utmCampaign, insertedId),
  ]);

  return NextResponse.json({ ok: true });
}
