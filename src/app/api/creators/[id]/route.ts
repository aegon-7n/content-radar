import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { z } from "zod";

/**
 * Creator detail — cumulative delta model, same as /api/dashboard.
 *
 * Everything (stats card, platform split, product split, daily series, top
 * videos) is computed against `max(views@to − views@from, 0)` per video so
 * the user never sees one number on the dashboard and an incompatible number
 * on the creator page for the same period.
 */
const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = request.nextUrl;
    const query = querySchema.parse(Object.fromEntries(searchParams));

    const to = query.to ? new Date(query.to + "T23:59:59Z") : new Date();
    const from = query.from
      ? new Date(query.from + "T00:00:00Z")
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const { prevFrom, prevTo } = getPreviousPeriod(from, to);

    // Creator info.
    const creatorResult = await db.execute(sql`
      SELECT id, name, avatar_url FROM creators WHERE id = ${id}
    `);
    if (!creatorResult.length) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 });
    }
    const creator = creatorResult[0] as unknown as {
      id: string;
      name: string;
      avatar_url: string | null;
    };

    // Per-video delta in [fromISO, toISO], scoped to this creator's videos.
    const perVideoDelta = (fromISO: string, toISO: string) => sql`
      WITH
      creator_videos AS (
        SELECT v.id, v.platform, v.product_id, v.published_at, v.url
        FROM videos v
        WHERE v.creator_id = ${id}
      ),
      end_views AS (
        SELECT DISTINCT ON (vm.video_id) vm.video_id, vm.views
        FROM video_metrics vm
        INNER JOIN creator_videos cv ON cv.id = vm.video_id
        WHERE vm.scraped_at <= ${toISO}
        ORDER BY vm.video_id, vm.scraped_at DESC
      ),
      start_views AS (
        SELECT DISTINCT ON (vm.video_id) vm.video_id, vm.views
        FROM video_metrics vm
        INNER JOIN creator_videos cv ON cv.id = vm.video_id
        WHERE vm.scraped_at < ${fromISO}
        ORDER BY vm.video_id, vm.scraped_at DESC
      )
      SELECT
        cv.id AS video_id,
        cv.platform,
        cv.product_id,
        cv.published_at,
        cv.url,
        GREATEST(COALESCE(ev.views, 0) - COALESCE(sv.views, 0), 0) AS delta
      FROM creator_videos cv
      LEFT JOIN end_views ev ON ev.video_id = cv.id
      LEFT JOIN start_views sv ON sv.video_id = cv.id
    `;

    // Current period totals.
    const currentStatsResult = await db.execute(sql`
      WITH deltas AS (${perVideoDelta(from.toISOString(), to.toISOString())})
      SELECT
        COALESCE(SUM(delta), 0)::bigint AS views,
        COUNT(*) FILTER (WHERE delta > 0)::int AS active_videos,
        COUNT(*) FILTER (
          WHERE published_at >= ${from.toISOString()}
            AND published_at <= ${to.toISOString()}
        )::int AS new_videos
      FROM deltas
    `);

    // Previous period views for change calc.
    const prevStatsResult = await db.execute(sql`
      WITH deltas AS (${perVideoDelta(prevFrom.toISOString(), prevTo.toISOString())})
      SELECT COALESCE(SUM(delta), 0)::bigint AS views FROM deltas
    `);

    // Delta per platform.
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

    // Delta per (product, platform) so the client can filter the products
    // table by platform without a refetch. Client folds rows back into
    // per-product totals based on the active platform filter.
    const byProductResult = await db.execute(sql`
      WITH deltas AS (${perVideoDelta(from.toISOString(), to.toISOString())})
      SELECT
        p.id AS product_id,
        p.name AS product_name,
        p.wb_article,
        d.platform,
        COALESCE(SUM(d.delta), 0)::bigint AS views,
        COUNT(*) FILTER (WHERE d.delta > 0)::int AS videos
      FROM deltas d
      LEFT JOIN products p ON p.id = d.product_id
      WHERE p.id IS NOT NULL
      GROUP BY p.id, p.name, p.wb_article, d.platform
      ORDER BY views DESC
    `);

    // Daily delta series for this creator's videos.
    const byDayResult = await db.execute(sql`
      WITH
      creator_videos AS (SELECT id FROM videos WHERE creator_id = ${id}),
      baseline AS (
        SELECT DISTINCT ON (vm.video_id) vm.video_id, vm.views
        FROM video_metrics vm
        INNER JOIN creator_videos cv ON cv.id = vm.video_id
        WHERE vm.scraped_at < ${from.toISOString()}
        ORDER BY vm.video_id, vm.scraped_at DESC
      ),
      daily_latest AS (
        SELECT DISTINCT ON (vm.video_id, DATE(vm.scraped_at AT TIME ZONE 'UTC'))
          vm.video_id,
          DATE(vm.scraped_at AT TIME ZONE 'UTC') AS day,
          vm.views
        FROM video_metrics vm
        INNER JOIN creator_videos cv ON cv.id = vm.video_id
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
      )
      SELECT
        day::text AS date,
        COALESCE(SUM(GREATEST(views - prev_views, 0)), 0)::bigint AS views
      FROM with_prev
      GROUP BY day
      ORDER BY day ASC
    `);

    // All videos with delta (no limit — frontend paginates client-side).
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
        d.video_id AS id,
        d.url,
        d.platform,
        d.published_at,
        d.delta::bigint AS views,
        COALESCE(lm.likes, 0)::int AS likes,
        COALESCE(lm.comments, 0)::int AS comments,
        COALESCE(p.name, '—') AS product_name
      FROM deltas d
      LEFT JOIN latest_metrics lm ON lm.video_id = d.video_id
      LEFT JOIN products p ON p.id = d.product_id
      ORDER BY d.delta DESC
    `);

    const statsRow = currentStatsResult[0] as unknown as {
      views: string;
      active_videos: number;
      new_videos: number;
    };
    const prevStatsRow = prevStatsResult[0] as unknown as { views: string };

    const views = Number(statsRow?.views ?? 0);
    const activeVideos = Number(statsRow?.active_videos ?? 0);
    const newVideos = Number(statsRow?.new_videos ?? 0);
    const prevViews = Number(prevStatsRow?.views ?? 0);

    return NextResponse.json({
      creator: {
        id: creator.id,
        name: creator.name,
        avatarUrl: creator.avatar_url,
      },
      stats: {
        views,
        videos: activeVideos,
        newVideos,
        avgViews: activeVideos > 0 ? Math.round(views / activeVideos) : 0,
        viewsChange: calcChange(views, prevViews),
      },
      byPlatform: (byPlatformResult as unknown as Array<{
        platform: string;
        views: string;
        videos: number;
      }>).map((row) => ({
        platform: row.platform,
        views: Number(row.views),
        videos: Number(row.videos),
      })),
      byProduct: (byProductResult as unknown as Array<{
        product_id: string;
        product_name: string;
        wb_article: string;
        platform: string;
        views: string;
        videos: number;
      }>).map((row) => ({
        productId: row.product_id,
        productName: row.product_name,
        wbArticle: row.wb_article,
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
        product_name: string;
        published_at: string;
      }>).map((row) => ({
        id: row.id,
        url: row.url,
        platform: row.platform,
        views: Number(row.views),
        likes: Number(row.likes),
        comments: Number(row.comments),
        productName: row.product_name,
        publishedAt: new Date(row.published_at).toISOString(),
      })),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: error.issues },
        { status: 400 }
      );
    }
    console.error("[creators/[id]] GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
