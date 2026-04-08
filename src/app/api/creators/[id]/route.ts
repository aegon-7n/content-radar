import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { z } from "zod";

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

function calcChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100 * 100) / 100;
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

    const { sql } = await import("drizzle-orm");

    // Creator info
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

    // Current period stats
    const currentStatsResult = await db.execute(sql`
      WITH latest_metrics AS (
        SELECT DISTINCT ON (video_id)
          video_id,
          views
        FROM video_metrics
        WHERE scraped_at >= ${from.toISOString()} AND scraped_at <= ${to.toISOString()}
        ORDER BY video_id, scraped_at DESC
      )
      SELECT
        COALESCE(SUM(lm.views), 0)::bigint AS views,
        COUNT(DISTINCT v.id)::int AS videos
      FROM videos v
      LEFT JOIN latest_metrics lm ON lm.video_id = v.id
      WHERE v.creator_id = ${id}
        AND v.published_at >= ${from.toISOString()} AND v.published_at <= ${to.toISOString()}
    `);

    // Previous period views
    const prevStatsResult = await db.execute(sql`
      WITH latest_metrics AS (
        SELECT DISTINCT ON (video_id)
          video_id,
          views
        FROM video_metrics
        WHERE scraped_at >= ${prevFrom.toISOString()} AND scraped_at <= ${prevTo.toISOString()}
        ORDER BY video_id, scraped_at DESC
      )
      SELECT
        COALESCE(SUM(lm.views), 0)::bigint AS views
      FROM videos v
      LEFT JOIN latest_metrics lm ON lm.video_id = v.id
      WHERE v.creator_id = ${id}
        AND v.published_at >= ${prevFrom.toISOString()} AND v.published_at <= ${prevTo.toISOString()}
    `);

    // By platform
    const byPlatformResult = await db.execute(sql`
      WITH latest_metrics AS (
        SELECT DISTINCT ON (video_id)
          video_id,
          views
        FROM video_metrics
        WHERE scraped_at >= ${from.toISOString()} AND scraped_at <= ${to.toISOString()}
        ORDER BY video_id, scraped_at DESC
      )
      SELECT
        v.platform,
        COALESCE(SUM(lm.views), 0)::bigint AS views,
        COUNT(DISTINCT v.id)::int AS videos
      FROM videos v
      LEFT JOIN latest_metrics lm ON lm.video_id = v.id
      WHERE v.creator_id = ${id}
        AND v.published_at >= ${from.toISOString()} AND v.published_at <= ${to.toISOString()}
      GROUP BY v.platform
      ORDER BY views DESC
    `);

    // By product
    const byProductResult = await db.execute(sql`
      WITH latest_metrics AS (
        SELECT DISTINCT ON (video_id)
          video_id,
          views
        FROM video_metrics
        WHERE scraped_at >= ${from.toISOString()} AND scraped_at <= ${to.toISOString()}
        ORDER BY video_id, scraped_at DESC
      )
      SELECT
        p.id AS product_id,
        p.name AS product_name,
        p.wb_article,
        COALESCE(SUM(lm.views), 0)::bigint AS views,
        COUNT(DISTINCT v.id)::int AS videos
      FROM videos v
      INNER JOIN products p ON p.id = v.product_id
      LEFT JOIN latest_metrics lm ON lm.video_id = v.id
      WHERE v.creator_id = ${id}
        AND v.published_at >= ${from.toISOString()} AND v.published_at <= ${to.toISOString()}
      GROUP BY p.id, p.name, p.wb_article
      ORDER BY views DESC
    `);

    // By day
    const byDayResult = await db.execute(sql`
      WITH daily_latest AS (
        SELECT DISTINCT ON (vm.video_id, DATE(vm.scraped_at AT TIME ZONE 'UTC'))
          vm.video_id,
          DATE(vm.scraped_at AT TIME ZONE 'UTC') AS day,
          vm.views
        FROM video_metrics vm
        INNER JOIN videos v ON v.id = vm.video_id
        WHERE v.creator_id = ${id}
          AND vm.scraped_at >= ${from.toISOString()} AND vm.scraped_at <= ${to.toISOString()}
          AND v.published_at >= ${from.toISOString()} AND v.published_at <= ${to.toISOString()}
        ORDER BY vm.video_id, DATE(vm.scraped_at AT TIME ZONE 'UTC'), vm.scraped_at DESC
      ),
      with_prev AS (
        SELECT
          day,
          views,
          LAG(views) OVER (PARTITION BY video_id ORDER BY day) AS prev_views
        FROM daily_latest
      )
      SELECT
        day::text AS date,
        COALESCE(SUM(GREATEST(views - COALESCE(prev_views, 0), 0)), 0)::bigint AS views
      FROM with_prev
      GROUP BY day
      ORDER BY day ASC
    `);

    // Top videos
    const topVideosResult = await db.execute(sql`
      WITH latest_metrics AS (
        SELECT DISTINCT ON (video_id)
          video_id,
          views
        FROM video_metrics
        WHERE scraped_at >= ${from.toISOString()} AND scraped_at <= ${to.toISOString()}
        ORDER BY video_id, scraped_at DESC
      )
      SELECT
        v.id,
        v.url,
        v.platform,
        v.published_at,
        lm.views,
        p.name AS product_name
      FROM videos v
      INNER JOIN latest_metrics lm ON lm.video_id = v.id
      INNER JOIN products p ON p.id = v.product_id
      WHERE v.creator_id = ${id}
        AND v.published_at >= ${from.toISOString()} AND v.published_at <= ${to.toISOString()}
      ORDER BY lm.views DESC
      LIMIT 10
    `);

    const statsRow = currentStatsResult[0] as unknown as {
      views: string;
      videos: number;
    };
    const prevStatsRow = prevStatsResult[0] as unknown as { views: string };

    const views = Number(statsRow?.views ?? 0);
    const videos = Number(statsRow?.videos ?? 0);
    const prevViews = Number(prevStatsRow?.views ?? 0);

    return NextResponse.json({
      creator: {
        id: creator.id,
        name: creator.name,
        avatarUrl: creator.avatar_url,
      },
      stats: {
        views,
        videos,
        avgViews: videos > 0 ? Math.round(views / videos) : 0,
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
        views: string;
        videos: number;
      }>).map((row) => ({
        productId: row.product_id,
        productName: row.product_name,
        wbArticle: row.wb_article,
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
        product_name: string;
        published_at: string;
      }>).map((row) => ({
        id: row.id,
        url: row.url,
        platform: row.platform,
        views: Number(row.views),
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
