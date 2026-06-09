import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/db";
import { waitlistSignups } from "@/db/schema";

// ─── Rate limiting (in-memory, per IP) ───────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();

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
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count += 1;
  return true;
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

// ─── Input schema ─────────────────────────────────────────────────────────────
// Accepts both rev1 (email + brand) and rev2 (contact + storeUrl) payloads.
const SubmitSchema = z.object({
  name: z.string().min(1).max(200).optional().nullable(),
  // rev1 fields (legacy)
  email: z.string().email().max(254).optional().nullable(),
  phone: z.string().max(32).optional().nullable(),
  telegramHandle: z.string().max(100).optional().nullable(),
  brand: z.string().max(300).optional().nullable(),
  // rev2 fields
  contact: z.string().max(200).optional().nullable(),   // TG-handle or email
  storeUrl: z.string().max(500).optional().nullable(),  // WB store URL
  // common
  creatorsRange: z.string().max(16),
  videoVolume: z.string().max(200).optional().nullable(),
  marketplace: z.string().max(50).optional().nullable(),
  excelHours: z.string().max(200).optional().nullable(),
  feedbackCommitment: z.enum(["yes", "no"]).optional().nullable(),
  goal: z.string().max(2000).optional().nullable(),
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

// Extract email address from contact field if it looks like an email.
function extractEmailFromContact(contact: string | null | undefined): string | null {
  if (!contact) return null;
  if (contact.startsWith("@")) return null;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) return contact;
  return null;
}

// ─── Notifications ────────────────────────────────────────────────────────────
async function sendConfirmationEmail(email: string, name: string | null | undefined): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[waitlist] RESEND_API_KEY not set, skipping email");
    return;
  }

  const fromEmail =
    process.env.RESEND_FROM_EMAIL ?? "ContentRadar <noreply@contentradar.app>";

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  const greeting = name ? `Привет, ${name}!` : "Привет!";

  const html = `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><title>Заявка получена</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
        <tr>
          <td style="background:#5b5bd6;padding:28px 36px;">
            <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-.3px;">ContentRadar</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 36px 24px;">
            <p style="margin:0 0 16px;font-size:16px;color:#0f172a;font-weight:600;">${greeting}</p>
            <p style="margin:0 0 12px;font-size:14px;color:#334155;line-height:1.6;">
              Мы получили вашу заявку в бета-программу <strong>ContentRadar</strong>.
            </p>
            <p style="margin:0 0 12px;font-size:14px;color:#334155;line-height:1.6;">
              Рассмотрим её и напишем в Telegram в течение 1–2 рабочих дней.
            </p>
            <p style="margin:0;font-size:13px;color:#64748b;">— Команда ContentRadar</p>
          </td>
        </tr>
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
    subject: "Заявка в бета-программу ContentRadar получена",
    html,
  });

  if (error) {
    console.error("[waitlist] Resend error:", error);
  }
}

async function sendTelegramNotification(data: {
  name: string | null | undefined;
  contact: string | null | undefined;       // rev2
  storeUrl: string | null | undefined;      // rev2
  email: string | null | undefined;         // rev1 legacy
  telegramHandle: string | null | undefined; // rev1 legacy
  brand: string | null | undefined;         // rev1 legacy
  creatorsRange: string;
  feedbackCommitment: string | null | undefined;
  utmCampaign: string | null | undefined;
  insertedId: number;
}): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn("[waitlist] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set");
    return;
  }

  const commitment = data.feedbackCommitment === "no" ? "❌ НЕТ (rejected)" : "✅ Да";

  // Build contact display — prefer rev2 contact field
  const contactDisplay = data.contact ?? data.email ?? "—";
  const storeDisplay = data.storeUrl ?? data.brand ?? "—";

  const text =
    `🎯 <b>Новая заявка в бета-программу</b>\n` +
    `Имя: <code>${data.name ?? "—"}</code>\n` +
    `Контакт: <code>${contactDisplay}</code>\n` +
    `Магазин/бренд: <code>${storeDisplay}</code>\n` +
    `Размер команды: <code>${data.creatorsRange}</code>\n` +
    `Созвоны: ${commitment}\n` +
    `Кампания: <code>${data.utmCampaign ?? "—"}</code>\n` +
    `ID: #${data.insertedId}`;

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
    name, email, phone, telegramHandle, brand,
    contact, storeUrl,
    creatorsRange, videoVolume, marketplace, excelHours,
    feedbackCommitment, goal, source,
    utmSource, utmMedium, utmCampaign, utmContent, utmTerm,
    referrer, consentAcceptedAt,
  } = parsed.data;

  // 4. Determine status — hard-filter rejections get status="rejected"
  const status = feedbackCommitment === "no" ? "rejected" : "new";

  // 5. INSERT into waitlist_signups
  const consentAt = consentAcceptedAt ? new Date(consentAcceptedAt) : new Date();

  const [inserted] = await db
    .insert(waitlistSignups)
    .values({
      name: name ?? null,
      email: email ?? null,
      phone: phone ?? null,
      telegramHandle: telegramHandle ?? null,
      brand: brand ?? null,
      contact: contact ?? null,
      storeUrl: storeUrl ?? null,
      creatorsRange,
      videoVolume: videoVolume ?? null,
      marketplace: marketplace ?? null,
      excelHours: excelHours ?? null,
      feedbackCommitment: feedbackCommitment ?? null,
      goal: goal ?? null,
      source: source ?? null,
      utmSource: utmSource ?? null,
      utmMedium: utmMedium ?? null,
      utmCampaign: utmCampaign ?? null,
      utmContent: utmContent ?? null,
      utmTerm: utmTerm ?? null,
      referrer: referrer ?? null,
      consentAcceptedAt: consentAt,
      status,
    })
    .returning({ id: waitlistSignups.id });

  const insertedId = inserted.id;

  // 6. Notify
  // For confirmation email: prefer email from rev1, else extract from contact if it's an email address
  const confirmationEmail = email ?? extractEmailFromContact(contact);

  await Promise.allSettled([
    status !== "rejected" && confirmationEmail
      ? sendConfirmationEmail(confirmationEmail, name)
      : Promise.resolve(),
    sendTelegramNotification({
      name, contact, storeUrl, email, telegramHandle, brand,
      creatorsRange, feedbackCommitment, utmCampaign, insertedId,
    }),
  ]);

  return NextResponse.json({ ok: true });
}
