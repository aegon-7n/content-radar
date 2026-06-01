import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/ping — public liveness probe for uptime monitors (UptimeRobot, Cloudflare).
 *
 * Returns no operational data. /api/health is auth-gated and contains
 * internal metrics; monitors should use this endpoint instead.
 */
export async function GET() {
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
