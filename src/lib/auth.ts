import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireEnv } from "@/lib/env";

const SECRET = requireEnv("NEXTAUTH_SECRET");

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export async function requireAuth(req: NextRequest): Promise<NextResponse | null> {
  try {
    const token = await getToken({ req, secret: SECRET });
    if (!token) return unauthorized();
    return null;
  } catch {
    return unauthorized();
  }
}
