import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { videos, videoMetrics, creators, products } from "@/db/schema";
import { sql, eq, and, gte, lte, desc } from "drizzle-orm";
import { z } from "zod";

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  category: z.string().optional(), // filter by product category
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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const params = querySchema.parse(Object.fromEntries(searchParams));

    const to = params.to ? new Date(params.to + "T23:59:59Z") : new Date();
    const from = params.from
      ? new Date(params.from + "T00:00:00Z")
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const { prevFrom, prevTo } = getPreviousPeriod(from, to);

    // Category filter clause — injected into each CTE
    const categoryFilter = params.category
      ? sql` AND p.category = ${params.category}`
      : sql``;

    // Latest metric per video using DISTINCT ON
    const latestMetricsCTE = sql`
      WITH latest_metrics AS (
        SELECT DISTINCT ON (video_id)
          video_id,
          views,
          likes,
          comments,
          shares,
          saves,
          scraped_at
        FROM video_metrics
        ORDER BY video_id, scraped_at DESC
      )
    `;

    // Total views and video count for current period
    const currentPeriodResult = await db.execute(sql`
      WITH latest_metrics AS (
        SELECT DISTINCT ON (video_id)
          video_id,
          views,
          scraped_at
        FROM video_metrics
        WHERE scraped_at >= ${from.toISOString()} AND scraped_at <= ${to.toISOString()}
        ORDER BY video_id, scraped_at DESC
      )
      SELECT
        COALESCE(SUM(lm.views), 0)::bigint AS total_views,
        COUNT(DISTINCT v.id)::int AS total_videos
      FROM videos v
      INNER JOIN latest_metrics lm ON lm.video_id = v.id
      INNER JOIN products p ON p.id = v.product_id
      WHERE v.published_at >= ${from.toISOString()} AND v.published_at <= ${to.toISOString()}
        ${categoryFilter}
    `);

    // Previous period totals
    const prevPeriodResult = await db.execute(sql`
      WITH latest_metrics AS (
        SELECT DISTINCT ON (video_id)
          video_id,
          views,
          scraped_at
        FROM video_metrics
        WHERE scraped_at >= ${prevFrom.toISOString()} AND scraped_at <= ${prevTo.toISOString()}
        ORDER BY video_id, scraped_at DESC
      )
      SELECT
        COALESCE(SUM(lm.views), 0)::bigint AS total_views,
        COUNT(DISTINCT v.id)::int AS total_videos
      FROM videos v
      INNER JOIN latest_metrics lm ON lm.video_id = v.id
      INNER JOIN products p ON p.id = v.product_id
      WHERE v.published_at >= ${prevFrom.toISOString()} AND v.published_at <= ${prevTo.toISOString()}
        ${categoryFilter}
    `);

    // Views by platform
    const byPlatformResult = await db.execute(sql`
      WITH latest_metrics AS (
        SELECT DISTINCT ON (video_id)
          video_id,
          views,
          scraped_at
        FROM video_metrics
        WHERE scraped_at >= ${from.toISOString()} AND scraped_at <= ${to.toISOString()}
        ORDER BY video_id, scraped_at DESC
      )
      SELECT
        v.platform,
        COALESCE(SUM(lm.views), 0)::bigint AS views,
        COUNT(DISTINCT v.id)::int AS videos
      FROM videos v
      INNER JOIN latest_metrics lm ON lm.video_id = v.id
      INNER JOIN products p ON p.id = v.product_id
      WHERE v.published_at >= ${from.toISOString()} AND v.published_at <= ${to.toISOString()}
        ${categoryFilter}
      GROUP BY v.platform
      ORDER BY views DESC
    `);

    // Views by day — daily delta (latest snapshot per video per day minus previous day snapshot)
    const byDayResult = await db.execute(sql`
      WITH filtered_videos AS (
        SELECT v.id AS video_id
        FROM videos v
        INNER JOIN products p ON p.id = v.product_id
        WHERE TRUE ${categoryFilter}
      ),
      daily_latest AS (
        SELECT DISTINCT ON (vm.video_id, DATE(vm.scraped_at AT TIME ZONE 'UTC'))
          vm.video_id,
          DATE(vm.scraped_at AT TIME ZONE 'UTC') AS day,
          vm.views
        FROM video_metrics vm
        INNER JOIN filtered_videos fv ON fv.video_id = vm.video_id
        WHERE vm.scraped_at >= ${from.toISOString()} AND vm.scraped_at <= ${to.toISOString()}
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

    // Top 5 videos
    const topVideosResult = await db.execute(sql`
      WITH latest_metrics AS (
        SELECT DISTINCT ON (video_id)
          video_id,
          views,
          scraped_at
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
        c.name AS creator_name,
        p.name AS product_name
      FROM videos v
      INNER JOIN latest_metrics lm ON lm.video_id = v.id
      INNER JOIN creators c ON c.id = v.creator_id
      INNER JOIN products p ON p.id = v.product_id
      WHERE v.published_at >= ${from.toISOString()} AND v.published_at <= ${to.toISOString()}
        ${categoryFilter}
      ORDER BY lm.views DESC
      LIMIT 5
    `);

    // Distinct categories for filter selector
    const categoriesResult = await db.execute(sql`
      SELECT DISTINCT category FROM products WHERE category IS NOT NULL ORDER BY category ASC
    `);

    const current = currentPeriodResult[0] as unknown as {
      total_views: string;
      total_videos: number;
    };
    const previous = prevPeriodResult[0] as unknown as {
      total_views: string;
      total_videos: number;
    };

    const totalViews = Number(current?.total_views ?? 0);
    const totalVideos = Number(current?.total_videos ?? 0);
    const prevTotalViews = Number(previous?.total_views ?? 0);
    const prevTotalVideos = Number(previous?.total_videos ?? 0);

    const categories = (categoriesResult as unknown as Array<{ category: string }>)
      .map((r) => r.category);

    return NextResponse.json({
      totalViews,
      totalVideos,
      viewsChange: calcChange(totalViews, prevTotalViews),
      videosChange: calcChange(totalVideos, prevTotalVideos),
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
        creator_name: string;
        product_name: string;
        published_at: string;
      }>).map((row) => ({
        id: row.id,
        url: row.url,
        platform: row.platform,
        views: Number(row.views),
        creatorName: row.creator_name,
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
    console.error("[dashboard] GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
