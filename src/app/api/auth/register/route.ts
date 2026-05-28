import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { tenants, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sendWelcomeEmail } from "@/lib/email/welcome";

// ─── Rate limiting for registration (OWASP A07:2021) ─────────────────────────
// 5 attempts per 15 minutes per IP. Registration is rarer than login, so
// threshold is lower to prevent account-spam without CAPTCHA.
const registerRateLimitMap = new Map<string, { count: number; windowStart: number }>();
const REGISTER_RATE_LIMIT_MAX = 5;
const REGISTER_RATE_LIMIT_WINDOW_MS = 15 * 60_000;

function checkRegisterRateLimit(ip: string): { allowed: boolean; retryAfterSecs?: number } {
  const now = Date.now();

  if (Math.random() < 0.02) {
    for (const [key, entry] of registerRateLimitMap) {
      if (now - entry.windowStart > REGISTER_RATE_LIMIT_WINDOW_MS * 2) {
        registerRateLimitMap.delete(key);
      }
    }
  }

  const entry = registerRateLimitMap.get(ip);

  if (!entry || now - entry.windowStart > REGISTER_RATE_LIMIT_WINDOW_MS) {
    registerRateLimitMap.set(ip, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (entry.count >= REGISTER_RATE_LIMIT_MAX) {
    const retryAfterSecs = Math.ceil((entry.windowStart + REGISTER_RATE_LIMIT_WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfterSecs };
  }

  entry.count += 1;
  return { allowed: true };
}

const RegisterSchema = z.object({
  email: z.string().email("Некорректный email"),
  name: z.string().min(1, "Имя обязательно"),
  companyName: z.string().min(1, "Название компании обязательно"),
  password: z.string().min(8, "Пароль минимум 8 символов"),
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s-]/gi, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 63);
}

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const { allowed, retryAfterSecs } = checkRegisterRateLimit(ip);
  if (!allowed) {
    return NextResponse.json(
      { error: "too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfterSecs ?? REGISTER_RATE_LIMIT_WINDOW_MS / 1000) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }

  const { email, name, companyName, password } = parsed.data;

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json(
      { error: "Пользователь с таким email уже существует" },
      { status: 409 },
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const slug = slugify(companyName) || `tenant-${Date.now()}`;

  let result: { tenant: (typeof tenants)["$inferSelect"]; user: (typeof users)["$inferSelect"] };
  try {
    result = await db.transaction(async (tx) => {
      const [tenant] = await tx
        .insert(tenants)
        .values({ name: companyName, slug })
        .returning();

      const [user] = await tx
        .insert(users)
        .values({
          tenantId: tenant.id,
          email,
          name,
          role: "owner",
          passwordHash,
        })
        .returning();

      return { tenant, user };
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json(
        { error: "Компания с таким названием уже зарегистрирована" },
        { status: 409 },
      );
    }
    throw err;
  }

  // Fire-and-forget: TG notification + welcome email. Skips internal smoke/QA traffic.
  void notifySignup({ email, name, companyName });
  if (!/^(krab[-+]|e2e\+|test@|\S+@contentradar\.local$)/i.test(email)) {
    void sendWelcomeEmail({ email, firstName: name });
  }

  return NextResponse.json(
    {
      tenant: { id: result.tenant.id, name: result.tenant.name, slug: result.tenant.slug },
      user: { id: result.user.id, email: result.user.email, name: result.user.name, role: result.user.role },
    },
    { status: 201 },
  );
}

async function notifySignup(s: { email: string; name: string; companyName: string }): Promise<void> {
  // Internal smoke emails — keep TG quiet
  if (/^(krab[-+]|e2e\+|test@|\S+@contentradar\.local$)/i.test(s.email)) return;

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn("[register] TELEGRAM_BOT_TOKEN/_CHAT_ID not set, skip signup notification");
    return;
  }

  const text =
    `🟢 <b>Новая регистрация</b>\n` +
    `Имя: <code>${escapeHtml(s.name)}</code>\n` +
    `Email: <code>${escapeHtml(s.email)}</code>\n` +
    `Бренд: <code>${escapeHtml(s.companyName)}</code>`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    if (!res.ok) console.error("[register] Telegram error", res.status, await res.text().catch(() => ""));
  } catch (err) {
    console.error("[register] Telegram fetch failed", err);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "23505"
  );
}
