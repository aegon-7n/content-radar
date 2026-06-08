import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { db } from "@/db";
import { adminSettings, users } from "@/db/schema";
import { eq } from "drizzle-orm";
// ─── Failed-attempt rate limiting (OWASP A07:2021) ───────────────────────────
// Counts only failed credential checks per IP — successful login clears the
// counter so legitimate NAT users (office Wi-Fi, shared IP) aren't blocked.
// Raised from 10 → 50 to handle multi-user NAT scenarios.
const failedAttemptsMap = new Map<string, { count: number; windowStart: number }>();
const AUTH_RATE_LIMIT_MAX = 50;
const AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60_000;

function isRateLimited(ip: string): { limited: boolean; retryAfterSecs?: number } {
  const now = Date.now();

  if (Math.random() < 0.02) {
    for (const [key, entry] of failedAttemptsMap) {
      if (now - entry.windowStart > AUTH_RATE_LIMIT_WINDOW_MS * 2) {
        failedAttemptsMap.delete(key);
      }
    }
  }

  const entry = failedAttemptsMap.get(ip);
  if (!entry || now - entry.windowStart > AUTH_RATE_LIMIT_WINDOW_MS) {
    return { limited: false };
  }

  if (entry.count >= AUTH_RATE_LIMIT_MAX) {
    const retryAfterSecs = Math.ceil((entry.windowStart + AUTH_RATE_LIMIT_WINDOW_MS - now) / 1000);
    return { limited: true, retryAfterSecs };
  }

  return { limited: false };
}

function recordFailedAttempt(ip: string): null {
  const now = Date.now();
  const entry = failedAttemptsMap.get(ip);
  if (!entry || now - entry.windowStart > AUTH_RATE_LIMIT_WINDOW_MS) {
    failedAttemptsMap.set(ip, { count: 1, windowStart: now });
  } else {
    entry.count += 1;
  }
  return null;
}

function clearFailedAttempts(ip: string): void {
  failedAttemptsMap.delete(ip);
}

function getIpFromAuthReq(req: { headers?: Record<string, unknown> }): string {
  const h = req.headers ?? {};
  const ri = h["x-real-ip"];
  const ff = h["x-forwarded-for"];
  if (typeof ri === "string" && ri) return ri;
  if (typeof ff === "string" && ff) return ff.split(",")[0]?.trim() ?? "unknown";
  return "unknown";
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

        const ip = getIpFromAuthReq(req as { headers?: Record<string, unknown> });
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
          if (!passwordOk) return recordFailedAttempt(ip);

          const [user] = await db
            .select({ id: users.id, tenantId: users.tenantId, email: users.email, name: users.name, role: users.role, creatorId: users.creatorId })
            .from(users)
            .where(eq(users.email, adminEmail))
            .limit(1);
          if (!user) return recordFailedAttempt(ip);

          clearFailedAttempts(ip);
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
            clearFailedAttempts(ip);
            return { id: user.id, email: user.email, name: user.name, tenantId: user.tenantId, role: user.role, creatorId: user.creatorId };
          }
        } catch {
          // DB unavailable — fall through.
        }

        // Check non-admin users with bcrypt password_hash
        const [user] = await db
          .select({ id: users.id, tenantId: users.tenantId, email: users.email, name: users.name, passwordHash: users.passwordHash })
          .from(users)
          .where(eq(users.email, credentials.email))
          .limit(1);

        if (!user?.passwordHash) return recordFailedAttempt(ip);

        const valid = await compare(credentials.password, user.passwordHash);
        if (!valid) return recordFailedAttempt(ip);

        clearFailedAttempts(ip);
        return { id: user.id, email: user.email, name: user.name, tenantId: user.tenantId };
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
    const ip =
      req.headers.get("x-real-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    const { limited, retryAfterSecs } = isRateLimited(ip);
    if (limited) {
      return Response.json(
        { error: "too many requests" },
        { status: 429, headers: { "Retry-After": String(retryAfterSecs ?? AUTH_RATE_LIMIT_WINDOW_MS / 1000) } }
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
