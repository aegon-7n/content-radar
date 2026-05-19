import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuthWithTenant } from "@/lib/tenant";

/**
 * Dashboard analytics — cumulative delta model.
 *
 * The seller asks one question: "How many views did my videos gain DURING this
 * period?" We answer with a single consistent formula:
 *
 *     delta_period = Σ max(views_at(to) − views_at(from), 0)
 *
 * where `views_at(T)` for a video v is the latest metric snapshot with
 * `scraped_at ≤ T`, or 0 if we have no snapshot that old (the video did not
 * exist in our DB yet). This is monotonic across period lengths — a 30-day
 * window always shows a number ≥ than a 7-day window — and it never needs a
 * "special case for new videos" branch that would make the UI jump between
 * incompatible meanings when the seller flips 7d ↔ 30d.
 *
 * Secondary metrics exposed:
 *   - newVideos   : videos with published_at ∈ [from, to]. A plain output count,
 *                   not tied to metrics.
 *   - avgPerVideo : delta_period / videos that actually gained views in the
 *                   period. "On average, each active video gained X views in
 *                   this period".
 *   - activePlatforms : platforms with delta > 0 out of the 5 supported.
 *
 * Period-over-period change is computed with the same delta formula on
 * [prevFrom, prevTo]. If the previous period's delta is 0 (usually because we
 * have no history that far back), `viewsChange` is `null` — the UI renders "—"
 * rather than a meaningless +100%.
 */
const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  category: z.string().optional(),
});

function getPreviousPeriod(from: Date, to: Date): { prevFrom: Date; prevTo: Date } {
  const periodMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - periodMs);
  return { prevFrom, prevTo };
}

function calcChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100 * 10) / 10;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuthWithTenant(request);
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.ctx;

  try {
    const { searchParams } = request.nextUrl;
    const params = querySchema.parse(Object.fromEntries(searchParams));

    const to = params.to ? new Date(params.to + "T23:59:59Z") : new Date();
    const from = params.from
      ? new Date(params.from + "T00:00:00Z")
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const { prevFrom, prevTo } = getPreviousPeriod(from, to);

    const categoryFilter = params.category
      ? sql` AND p.category = ${params.category}`
      : sql``;

    // Per-video delta for a window — reusable CTE. For each video that passes
    // the category filter we compute max(views@to − views@from, 0).
    const perVideoDelta = (fromISO: string, toISO: string) => sql`
      WITH
      filtered_videos AS (
        SELECT v.id, v.platform, v.published_at
        FROM videos v
        LEFT JOIN products p ON p.id = v.product_id
        WHERE v.tenant_id = ${tenantId} ${categoryFilter}
      ),
      end_views AS (
        SELECT DISTINCT ON (vm.video_id)
          vm.video_id,
          vm.views
        FROM video_metrics vm
        INNER JOIN filtered_videos fv ON fv.id = vm.video_id
        WHERE vm.scraped_at <= ${toISO}
        ORDER BY vm.video_id, vm.scraped_at DESC
      ),
      start_views AS (
        SELECT DISTINCT ON (vm.video_id)
          vm.video_id,
          vm.views
        FROM video_metrics vm
        INNER JOIN filtered_videos fv ON fv.id = vm.video_id
        WHERE vm.scraped_at < ${fromISO}
        ORDER BY vm.video_id, vm.scraped_at DESC
      )
      SELECT
        fv.id AS video_id,
        fv.platform,
        fv.published_at,
        GREATEST(COALESCE(ev.views, 0) - COALESCE(sv.views, 0), 0) AS delta
      FROM filtered_videos fv
      LEFT JOIN end_views ev ON ev.video_id = fv.id
      LEFT JOIN start_views sv ON sv.video_id = fv.id
    `;

    // Current period totals.
    const currentResult = await db.execute(sql`
      WITH deltas AS (${perVideoDelta(from.toISOString(), to.toISOString())})
      SELECT
        COALESCE(SUM(delta), 0)::bigint AS total_delta,
        COUNT(*) FILTER (WHERE delta > 0)::int AS active_videos,
        COUNT(*) FILTER (
          WHERE published_at >= ${from.toISOString()}
            AND published_at <= ${to.toISOString()}
        )::int AS new_videos
      FROM deltas
    `);

    // Previous period totals — only the delta and new-video count, so we can
    // compute period-over-period change.
    const previousResult = await db.execute(sql`
      WITH deltas AS (${perVideoDelta(prevFrom.toISOString(), prevTo.toISOString())})
      SELECT
        COALESCE(SUM(delta), 0)::bigint AS total_delta,
        COUNT(*) FILTER (
          WHERE published_at >= ${prevFrom.toISOString()}
            AND published_at <= ${prevTo.toISOString()}
        )::int AS new_videos
      FROM deltas
    `);

    // Delta grouped by platform.
    const byPlatformResult = await db.execute(sql`
      WITH deltas AS (${perVideoDelta(from.toISOString(), to.toISOString())})
      SELECT
        platform,
        COALESCE(SUM(delta), 0)::bigint AS views,
        COUNT(*) FILTER (WHERE delta > 0)::int AS videos
      FROM deltas
      GROUP BY platform
      ORDER BY views DESC
    `);

    // Daily delta series for the line chart. For each video we take the latest
    // snapshot per day and LAG() to get the previous day's value; the first
    // visible day is seeded with the baseline snapshot from before the period
    // so the opening bar is real delta, not cumulative.
    const byDayResult = await db.execute(sql`
      WITH filtered_videos AS (
        SELECT v.id AS video_id
        FROM videos v
        LEFT JOIN products p ON p.id = v.product_id
        WHERE v.tenant_id = ${tenantId} ${categoryFilter}
      ),
      baseline AS (
        SELECT DISTINCT ON (vm.video_id)
          vm.video_id,
          vm.views
        FROM video_metrics vm
        INNER JOIN filtered_videos fv ON fv.video_id = vm.video_id
        WHERE vm.scraped_at < ${from.toISOString()}
        ORDER BY vm.video_id, vm.scraped_at DESC
      ),
      daily_latest AS (
        SELECT DISTINCT ON (vm.video_id, DATE(vm.scraped_at AT TIME ZONE 'UTC'))
          vm.video_id,
          DATE(vm.scraped_at AT TIME ZONE 'UTC') AS day,
          vm.views
        FROM video_metrics vm
        INNER JOIN filtered_videos fv ON fv.video_id = vm.video_id
        WHERE vm.scraped_at >= ${from.toISOString()}
          AND vm.scraped_at <= ${to.toISOString()}
        ORDER BY vm.video_id, DATE(vm.scraped_at AT TIME ZONE 'UTC'), vm.scraped_at DESC
      ),
      with_prev AS (
        SELECT
          dl.video_id,
          dl.day,
          dl.views,
          COALESCE(
            LAG(dl.views) OVER (PARTITION BY dl.video_id ORDER BY dl.day),
            bl.views,
            0
          ) AS prev_views
        FROM daily_latest dl
        LEFT JOIN baseline bl ON bl.video_id = dl.video_id
      ),
      actual_days AS (
        SELECT
          day::text AS date,
          COALESCE(SUM(GREATEST(views - prev_views, 0)), 0)::bigint AS views
        FROM with_prev
        GROUP BY day
      ),
      all_days AS (
        SELECT d::date::text AS date
        FROM generate_series(
          ${from.toISOString()}::date,
          ${to.toISOString()}::date,
          '1 day'::interval
        ) d
      )
      SELECT
        ad.date,
        COALESCE(act.views, 0)::bigint AS views
      FROM all_days ad
      LEFT JOIN actual_days act ON act.date = ad.date
      ORDER BY ad.date ASC
    `);

    // Top 5 videos by delta in the period.
    const topVideosResult = await db.execute(sql`
      WITH deltas AS (${perVideoDelta(from.toISOString(), to.toISOString())}),
      latest_metrics AS (
        SELECT DISTINCT ON (video_id)
          video_id,
          likes,
          comments
        FROM video_metrics
        ORDER BY video_id, scraped_at DESC
      )
      SELECT
        v.id,
        v.url,
        v.platform,
        v.published_at,
        d.delta::bigint AS views,
        COALESCE(lm.likes, 0)::int AS likes,
        COALESCE(lm.comments, 0)::int AS comments,
        COALESCE(c.name, '—') AS creator_name,
        COALESCE(p.name, '—') AS product_name
      FROM deltas d
      INNER JOIN videos v ON v.id = d.video_id
      LEFT JOIN latest_metrics lm ON lm.video_id = v.id
      LEFT JOIN creators c ON c.id = v.creator_id
      LEFT JOIN products p ON p.id = v.product_id
      WHERE d.delta > 0
      ORDER BY d.delta DESC
      LIMIT 5
    `);

    // Categories for the filter chips.
    const categoriesResult = await db.execute(sql`
      SELECT DISTINCT category FROM products WHERE tenant_id = ${tenantId} AND category IS NOT NULL ORDER BY category ASC
    `);

    const current = currentResult[0] as unknown as {
      total_delta: string;
      active_videos: number;
      new_videos: number;
    };
    const previous = previousResult[0] as unknown as {
      total_delta: string;
      new_videos: number;
    };

    const totalViews = Number(current?.total_delta ?? 0);
    const activeVideos = Number(current?.active_videos ?? 0);
    const newVideos = Number(current?.new_videos ?? 0);
    const prevTotalViews = Number(previous?.total_delta ?? 0);
    const prevNewVideos = Number(previous?.new_videos ?? 0);

    const avgPerVideo = activeVideos > 0 ? Math.round(totalViews / activeVideos) : 0;
    const activePlatforms = (byPlatformResult as unknown as Array<{ views: string }>)
      .filter((r) => Number(r.views) > 0).length;

    const categories = (categoriesResult as unknown as Array<{ category: string }>)
      .map((r) => r.category);

    return NextResponse.json({
      totalViews,
      activeVideos,
      newVideos,
      avgPerVideo,
      activePlatforms,
      viewsChange: calcChange(totalViews, prevTotalViews),
      newVideosChange: calcChange(newVideos, prevNewVideos),

      categories,

      byPlatform: (byPlatformResult as unknown as Array<{
        platform: string;
        views: string;
        videos: number;
      }>).map((row) => ({
        platform: row.platform,
        views: Number(row.views),
        videos: Number(row.videos),
      })),

      byDay: (byDayResult as unknown as Array<{ date: string; views: string }>).map(
        (row) => ({
          date: row.date,
          views: Number(row.views),
        })
      ),

      topVideos: (topVideosResult as unknown as Array<{
        id: string;
        url: string;
        platform: string;
        views: string;
        likes: number;
        comments: number;
        creator_name: string;
        product_name: string;
        published_at: string;
      }>).map((row) => ({
        id: row.id,
        url: row.url,
        platform: row.platform,
        views: Number(row.views),
        likes: Number(row.likes),
        comments: Number(row.comments),
        creatorName: row.creator_name,
        productName: row.product_name,
        publishedAt: new Date(row.published_at).toISOString(),
      })),

      period: {
        from: from.toISOString(),
        to: to.toISOString(),
        days: Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000)),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: error.issues },
        { status: 400 }
      );
    }
    console.error("[dashboard] GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
