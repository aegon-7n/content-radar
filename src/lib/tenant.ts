import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SECRET = process.env.NEXTAUTH_SECRET ?? "dev-secret-change-in-production";

export interface TenantContext {
  userId: string;
  tenantId: string;
  role: "owner" | "creator";
  creatorId: string | null;
}

type AuthResult =
  | { ok: true; ctx: TenantContext }
  | { ok: false; response: NextResponse };

// Alias kept so callers of requireOwner don't need a signature change.
export type TenantContextWithRole = TenantContext;
type AuthResultWithRole = AuthResult;

/**
 * Single enforcement point for tenant-scoped auth.
 * Returns userId, tenantId, role, and creatorId from the JWT — no DB lookup
 * needed because all four fields are baked into the token at login.
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
        role: (token.role as "owner" | "creator") ?? "owner",
        creatorId: (token.creatorId as string | null) ?? null,
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
 * Like requireAuthWithTenant but additionally returns 403 if the caller is not
 * an owner. Role comes from the JWT — no DB lookup.
 */
export async function requireOwner(req: NextRequest): Promise<AuthResultWithRole> {
  const base = await requireAuthWithTenant(req);
  if (!base.ok) return base;

  if (base.ctx.role !== "owner") {
    return {
      ok: false,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }

  return base;
}
