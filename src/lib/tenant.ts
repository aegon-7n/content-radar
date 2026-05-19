import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SECRET = process.env.NEXTAUTH_SECRET ?? "dev-secret-change-in-production";

export interface TenantContext {
  userId: string;
  tenantId: string;
}

type AuthResult =
  | { ok: true; ctx: TenantContext }
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
