import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const SECRET = process.env.NEXTAUTH_SECRET ?? "dev-secret-change-in-production";

export interface TenantContext {
  userId: string;
  tenantId: string;
}

type AuthResult =
  | { ok: true; ctx: TenantContext }
  | { ok: false; response: NextResponse };

export interface TenantContextWithRole extends TenantContext {
  role: "owner" | "creator";
}

type AuthResultWithRole =
  | { ok: true; ctx: TenantContextWithRole }
  | { ok: false; response: NextResponse };

/**
 * Single enforcement point for tenant-scoped auth.
 * Every protected route MUST call this instead of requireAuth().
 * Returns the userId and tenantId from the JWT — no DB lookup needed
 * because tenantId is baked into the token at login.
 */
export async function requireAuthWithTenant(
  req: NextRequest,
): Promise<AuthResult> {
  try {
    const token = await getToken({ req, secret: SECRET });
    if (!token?.userId || !token?.tenantId) {
      return {
        ok: false,
        response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
      };
    }
    return {
      ok: true,
      ctx: {
        userId: token.userId as string,
        tenantId: token.tenantId as string,
      },
    };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
}

/**
 * Like requireAuthWithTenant but additionally loads the user's role from DB
 * and returns 403 if the caller is not an owner.
 */
export async function requireOwner(req: NextRequest): Promise<AuthResultWithRole> {
  const base = await requireAuthWithTenant(req);
  if (!base.ok) return base;

  const [user] = await db
    .select({ role: users.role })
    .from(users)
    .where(and(eq(users.id, base.ctx.userId), eq(users.tenantId, base.ctx.tenantId)))
    .limit(1);

  if (!user || user.role !== "owner") {
    return {
      ok: false,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, ctx: { ...base.ctx, role: "owner" } };
}
