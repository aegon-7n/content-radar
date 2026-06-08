import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { db } from "@/db";
import { adminSettings, users } from "@/db/schema";
import { eq } from "drizzle-orm";

// ─── Auth rate limiting (OWASP A07:2021) ─────────────────────────────────────
// Counts only FAILED credential attempts per IP. Successful login clears the
// counter. 50/15-min covers NAT/shared-Wi-Fi multi-user scenarios (Тимофей +
// Дина + others behind one IP = safe). GET requests (/session, /csrf, etc.)
// are never counted — only POSTs to /callback/credentials that fail.
const authRateLimitMap = new Map<string, { count: number; windowStart: number }>();
const AUTH_RATE_LIMIT_MAX = 50;
const AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60_000;

function extractIp(headers: Headers | Record<string, string | string[] | undefined>): string {
  if (headers instanceof Headers) {
    return headers.get("x-real-ip") ??
           headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
           "unknown";
  }
  const realIp = headers["x-real-ip"];
  const forwarded = headers["x-forwarded-for"];
  return (Array.isArray(realIp) ? realIp[0] : realIp) ??
         (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() ??
         "unknown";
}

function isAuthBlocked(ip: string): { blocked: boolean; retryAfterSecs?: number } {
  const now = Date.now();
  if (Math.random() < 0.02) {
    for (const [key, entry] of authRateLimitMap) {
      if (now - entry.windowStart > AUTH_RATE_LIMIT_WINDOW_MS * 2) authRateLimitMap.delete(key);
    }
  }
  const entry = authRateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > AUTH_RATE_LIMIT_WINDOW_MS) return { blocked: false };
  if (entry.count >= AUTH_RATE_LIMIT_MAX) {
    const retryAfterSecs = Math.ceil((entry.windowStart + AUTH_RATE_LIMIT_WINDOW_MS - now) / 1000);
    return { blocked: true, retryAfterSecs };
  }
  return { blocked: false };
}

function recordAuthFailure(ip: string): void {
  const now = Date.now();
  const entry = authRateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > AUTH_RATE_LIMIT_WINDOW_MS) {
    authRateLimitMap.set(ip, { count: 1, windowStart: now });
  } else {
    entry.count += 1;
  }
}

function clearAuthRateLimit(ip: string): void {
  authRateLimitMap.delete(ip);
}

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email:    { label: "Email",    type: "email" },
        password: { label: "Пароль",  type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;

        const ip = extractIp(req?.headers ?? {});
        const adminEmail = process.env.ADMIN_EMAIL ?? "admin@content-radar.ru";

        if (credentials.email === adminEmail) {
          let passwordOk = false;
          try {
            const [row] = await db
              .select()
              .from(adminSettings)
              .where(eq(adminSettings.key, "password_hash"))
              .limit(1);
            if (row) {
              passwordOk = await compare(credentials.password, row.value);
            } else {
              passwordOk = credentials.password === (process.env.ADMIN_PASSWORD ?? "admin123");
            }
          } catch {
            passwordOk = credentials.password === (process.env.ADMIN_PASSWORD ?? "admin123");
          }

          if (!passwordOk) {
            recordAuthFailure(ip);
            return null;
          }

          const [user] = await db
            .select({ id: users.id, tenantId: users.tenantId, email: users.email, name: users.name, role: users.role, creatorId: users.creatorId })
            .from(users)
            .where(eq(users.email, adminEmail))
            .limit(1);

          if (!user) {
            recordAuthFailure(ip);
            return null;
          }

          clearAuthRateLimit(ip);
          return { id: user.id, email: user.email, name: user.name, tenantId: user.tenantId, role: user.role, creatorId: user.creatorId, isGlobalAdmin: true };
        }

        // Creator path: look up by email, verify bcrypt hash stored in users.password_hash.
        try {
          const [user] = await db
            .select({ id: users.id, tenantId: users.tenantId, email: users.email, name: users.name, role: users.role, creatorId: users.creatorId, passwordHash: users.passwordHash })
            .from(users)
            .where(eq(users.email, credentials.email))
            .limit(1);
          if (user?.passwordHash && await compare(credentials.password, user.passwordHash)) {
            clearAuthRateLimit(ip);
            return { id: user.id, email: user.email, name: user.name, tenantId: user.tenantId, role: user.role, creatorId: user.creatorId };
          }
        } catch {
          // DB unavailable — fall through.
        }

        // Second lookup path (non-admin users without role/creatorId in first select)
        try {
          const [user] = await db
            .select({ id: users.id, tenantId: users.tenantId, email: users.email, name: users.name, passwordHash: users.passwordHash })
            .from(users)
            .where(eq(users.email, credentials.email))
            .limit(1);

          if (user?.passwordHash && await compare(credentials.password, user.passwordHash)) {
            clearAuthRateLimit(ip);
            return { id: user.id, email: user.email, name: user.name, tenantId: user.tenantId };
          }
        } catch {
          // DB unavailable — fall through.
        }

        recordAuthFailure(ip);
        return null;
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        const u = user as typeof user & { tenantId: string; role: string; creatorId: string | null; isGlobalAdmin?: boolean };
        token.tenantId = u.tenantId;
        token.role = u.role;
        token.creatorId = u.creatorId ?? null;
        token.isGlobalAdmin = u.isGlobalAdmin ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) {
        const u = session.user as typeof session.user & { id: string; tenantId: string; role: string; creatorId: string | null; isGlobalAdmin: boolean };
        u.id = token.userId as string;
        u.tenantId = token.tenantId as string;
        u.role = (token.role as string) ?? "owner";
        u.creatorId = (token.creatorId as string | null) ?? null;
        u.isGlobalAdmin = (token.isGlobalAdmin as boolean) ?? false;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET ?? "dev-secret-change-in-production",
});

const POST = async (req: Request, ctx: unknown) => {
  const url = new URL(req.url);
  if (url.pathname === "/api/auth/callback/credentials") {
    const ip = extractIp(req.headers);
    const { blocked, retryAfterSecs } = isAuthBlocked(ip);
    if (blocked) {
      return Response.json(
        { error: "too_many_attempts" },
        { status: 429, headers: { "Retry-After": String(retryAfterSecs ?? 900) } }
      );
    }
  }

  try {
    return await (handler as (req: Request, ctx: unknown) => Promise<Response>)(req, ctx);
  } catch (err) {
    if (err instanceof SyntaxError) {
      return Response.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }
    throw err;
  }
};

export { handler as GET, POST };
