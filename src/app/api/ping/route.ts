import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/ping — public liveness probe for uptime monitors (UptimeRobot, Cloudflare).
 * Returns only {"ok": true} — no internal data. No auth required.
 *
 * /api/health requires auth and returns full scraper state + counts.
 * Use /api/ping for external monitoring, /api/health for internal tooling.
 */
export function GET() {
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
