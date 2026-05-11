import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

/**
 * Returns the authenticated user's DB UUID on success, or a 401 response.
 * Callers: `const auth = await requireAuth(req); if (auth instanceof NextResponse) return auth;`
 */
export async function requireAuth(
  req: NextRequest,
): Promise<NextResponse | string> {
  try {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET ?? "dev-secret-change-in-production",
    });
    if (!token?.userId) return unauthorized();
    const userId = token.userId as string;
    if (!UUID_RE.test(userId)) return unauthorized();
    return userId;
  } catch {
    return unauthorized();
  }
}
