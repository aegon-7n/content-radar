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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const params = querySchema.parse(Object.fromEntries(searchParams));

    const to = params.to ? new Date(params.to + "T23:59:59Z") : new Date();
    const from = params.from
      ? new Date(params.from + "T00:00:00Z")
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const { prevFrom, prevTo } = getPreviousPeriod(from, to);

    const { sql } = await import("drizzle-orm");

    // Current period: views and videos per creator
    const currentResult = await db.execute(sql`
      WITH latest_metrics AS (
        SELECT DISTINCT ON (video_id)
          video_id,
          views
        FROM video_metrics
        ORDER BY video_id, scraped_at DESC
      )
      SELECT
        c.id AS creator_id,
        c.name AS creator_name,
        c.avatar_url,
        COALESCE(SUM(lm.views), 0)::bigint AS views,
        COUNT(DISTINCT v.id)::int AS videos
      FROM creators c
      LEFT JOIN videos v ON v.creator_id = c.id
        AND v.published_at >= ${from.toISOString()} AND v.published_at <= ${to.toISOString()}
      LEFT JOIN latest_metrics lm ON lm.video_id = v.id
      GROUP BY c.id, c.name, c.avatar_url
      ORDER BY views DESC
    `);

    // Previous period: views per creator
    const prevResult = await db.execute(sql`
      WITH latest_metrics AS (
        SELECT DISTINCT ON (video_id)
          video_id,
          views
        FROM video_metrics
        ORDER BY video_id, scraped_at DESC
      )
      SELECT
        c.id AS creator_id,
        COALESCE(SUM(lm.views), 0)::bigint AS views
      FROM creators c
      LEFT JOIN videos v ON v.creator_id = c.id
        AND v.published_at >= ${prevFrom.toISOString()} AND v.published_at <= ${prevTo.toISOString()}
      LEFT JOIN latest_metrics lm ON lm.video_id = v.id
      GROUP BY c.id
    `);

    // Views by platform per creator
    const byPlatformResult = await db.execute(sql`
      WITH latest_metrics AS (
        SELECT DISTINCT ON (video_id)
          video_id,
          views
        FROM video_metrics
        ORDER BY video_id, scraped_at DESC
      )
      SELECT
        v.creator_id,
        v.platform,
        COALESCE(SUM(lm.views), 0)::bigint AS views,
        COUNT(DISTINCT v.id)::int AS videos
      FROM videos v
      LEFT JOIN latest_metrics lm ON lm.video_id = v.id
      WHERE v.published_at >= ${from.toISOString()} AND v.published_at <= ${to.toISOString()}
      GROUP BY v.creator_id, v.platform
      ORDER BY v.creator_id, views DESC
    `);

    type CurrentRow = {
      creator_id: string;
      creator_name: string;
      avatar_url: string | null;
      views: string;
      videos: number;
    };
    type PrevRow = { creator_id: string; views: string };
    type PlatformRow = {
      creator_id: string;
      platform: string;
      views: string;
      videos: number;
    };

    const prevMap = new Map<string, number>();
    for (const row of prevResult as unknown as PrevRow[]) {
      prevMap.set(row.creator_id, Number(row.views));
    }

    const platformMap = new Map<string, Array<{ platform: string; views: number; videos: number }>>();
    for (const row of byPlatformResult as unknown as PlatformRow[]) {
      if (!platformMap.has(row.creator_id)) {
        platformMap.set(row.creator_id, []);
      }
      platformMap.get(row.creator_id)!.push({
        platform: row.platform,
        views: Number(row.views),
        videos: Number(row.videos),
      });
    }

    const creators = (currentResult as unknown as CurrentRow[]).map((row) => {
      const views = Number(row.views);
      const videos = Number(row.videos);
      const prevViews = prevMap.get(row.creator_id) ?? 0;

      return {
        id: row.creator_id,
        name: row.creator_name,
        avatarUrl: row.avatar_url,
        views,
        videos,
        avgViews: videos > 0 ? Math.round(views / videos) : 0,
        viewsChange: calcChange(views, prevViews),
        byPlatform: platformMap.get(row.creator_id) ?? [],
      };
    });

    return NextResponse.json({ creators });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: error.issues },
        { status: 400 }
      );
    }
    console.error("[creators] GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
