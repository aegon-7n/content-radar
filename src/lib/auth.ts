import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export async function requireAuth(req: NextRequest): Promise<NextResponse | null> {
  try {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET ?? "dev-secret-change-in-production",
    });
    if (!token) return unauthorized();
    return null;
  } catch {
    return unauthorized();
  }
}
