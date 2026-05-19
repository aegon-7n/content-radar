import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";

/**
 * GET /api/health — operational overview of the scraper pipeline.
 *
 * Used by the sidebar "Последнее обновление" widget and, later, by any
 * external uptime monitor. Returns counts + per-job state from
 * scraper_state, so the UI can render something like:
 *
 *   Discover:    00:02 сегодня • ok (added=21)
 *   Metrics:     00:17 сегодня • partial (ok=230 fail=2)
 *   Audit:       01:04 сегодня • ok (missing=0)
 *
 * Overall "healthy" flag is true iff every known job has status === "ok"
 * AND its last_run_at is within the last 25 hours (a single missed cron
 * window counts as "stale"). Never throws — on DB failure returns
 * `status: "error"` so the sidebar can show something instead of
 * crashing the whole render.
 */
export async function GET() {
  try {
    const [counts, state] = await Promise.all([
      db.execute(sql`
        SELECT
          (SELECT COUNT(*) FROM videos)::int AS total_videos,
          (SELECT COUNT(*) FROM creators)::int AS total_creators,
          (SELECT COUNT(*) FROM products)::int AS total_products,
          (SELECT MAX(scraped_at) FROM video_metrics) AS last_metric_at
      `),
      db.execute(sql`
        SELECT job_name, last_run_at, last_success_at, last_status, last_message
        FROM scraper_state
      `),
    ]);

    const c = counts[0] as unknown as {
      total_videos: number;
      total_creators: number;
      total_products: number;
      last_metric_at: string | null;
    };

    type JobRow = {
      job_name: string;
      last_run_at: string | null;
      last_success_at: string | null;
      last_status: string | null;
      last_message: string | null;
    };
    const jobsMap: Record<string, JobRow> = {};
    for (const r of state as unknown as JobRow[]) {
      jobsMap[r.job_name] = r;
    }

    // "Stale" = more than 25 hours since last run (a single missed daily cron).
    const STALE_MS = 25 * 60 * 60 * 1000;
    // Same threshold as scraper/run_daily.py: a partial run with < 20% fail
    // rate is treated as effectively healthy. This matches reality — a
    // couple of permanent ru_cross_border_block TikTok videos are not an
    // incident we want to page on every single night.
    const PARTIAL_FAIL_RATE_OK = 0.20;
    const now = Date.now();

    /**
     * Parse "ok=237 fail=1 skipped=0" style message. Returns failRate
     * (0..1) if both numbers can be extracted, otherwise null.
     */
    function extractFailRate(msg: string | null): number | null {
      if (!msg) return null;
      const ok = /ok=(\d+)/.exec(msg);
      const fail = /fail=(\d+)/.exec(msg);
      if (!ok || !fail) return null;
      const okN = Number(ok[1]);
      const failN = Number(fail[1]);
      const total = okN + failN;
      if (total === 0) return null;
      return failN / total;
    }

    const knownJobs = ["auto_discover", "run_daily", "audit"] as const;
    const jobs = knownJobs.map((name) => {
      const row = jobsMap[name];
      const lastRun = row?.last_run_at ? new Date(row.last_run_at) : null;
      const stale = !lastRun || now - lastRun.getTime() > STALE_MS;
      const rawStatus = row?.last_status ?? "unknown";

      // Effective status — same as raw unless it's "partial" or "fail" with a
      // low fail rate (below threshold), in which case we promote to "ok".
      // "fail" can now carry ok=N fail=M format from audit.py so it's parseable.
      let effectiveStatus = rawStatus;
      if (rawStatus === "partial" || rawStatus === "fail") {
        const rate = extractFailRate(row?.last_message ?? null);
        if (rate !== null && rate < PARTIAL_FAIL_RATE_OK) {
          effectiveStatus = "ok";
        }
      }

      return {
        name,
        lastRunAt: row?.last_run_at ?? null,
        lastSuccessAt: row?.last_success_at ?? null,
        status: effectiveStatus,
        rawStatus, // kept for debugging; UI can use `status`.
        message: row?.last_message ?? null,
        stale,
      };
    });

    const healthy = jobs.every((j) => j.status === "ok" && !j.stale);

    return NextResponse.json({
      status: healthy ? "ok" : "degraded",
      totals: {
        videos: c.total_videos,
        creators: c.total_creators,
        products: c.total_products,
      },
      lastMetricAt: c.last_metric_at,
      jobs,
      now: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[health] error:", error);
    return NextResponse.json(
      { status: "error", error: String(error) },
      { status: 500 }
    );
  }
}
