import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuthWithTenant } from "@/lib/tenant";

/**
 * Creators list — same cumulative delta model as /api/dashboard.
 *
 * For every creator we return "views their videos gained during the period"
 * (not "latest views of videos they published in the period"), per-platform
 * breakdown of that same delta, and period-over-period change. viewsChange is
 * null when the previous period has no baseline data.
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

    // Per-video delta over [fromISO, toISO]. Shared with dashboard.
    const perVideoDelta = (fromISO: string, toISO: string) => sql`
      WITH
      end_views AS (
        SELECT DISTINCT ON (vm.video_id)
          vm.video_id, vm.views
        FROM video_metrics vm
        WHERE vm.scraped_at <= ${toISO}
        ORDER BY vm.video_id, vm.scraped_at DESC
      ),
      start_views AS (
        SELECT DISTINCT ON (vm.video_id)
          vm.video_id, vm.views
        FROM video_metrics vm
        WHERE vm.scraped_at < ${fromISO}
        ORDER BY vm.video_id, vm.scraped_at DESC
      )
      SELECT
        v.id AS video_id,
        v.creator_id,
        v.platform,
        v.published_at,
        GREATEST(COALESCE(ev.views, 0) - COALESCE(sv.views, 0), 0) AS delta
      FROM videos v
      LEFT JOIN end_views ev ON ev.video_id = v.id
      LEFT JOIN start_views sv ON sv.video_id = v.id
      WHERE v.tenant_id = ${tenantId}
    `;

    // Current period: delta per creator.
    const currentResult = await db.execute(sql`
      WITH deltas AS (${perVideoDelta(from.toISOString(), to.toISOString())})
      SELECT
        c.id AS creator_id,
        c.name AS creator_name,
        c.avatar_url,
        COALESCE(SUM(d.delta), 0)::bigint AS views,
        COUNT(DISTINCT d.video_id) FILTER (WHERE d.delta > 0)::int AS active_videos,
        (SELECT COUNT(*) FROM videos v2
         WHERE v2.creator_id = c.id
           AND v2.published_at >= ${from.toISOString()}
           AND v2.published_at <= ${to.toISOString()})::int AS new_videos
      FROM creators c
      LEFT JOIN deltas d ON d.creator_id = c.id
      WHERE c.tenant_id = ${tenantId}
      GROUP BY c.id, c.name, c.avatar_url
      ORDER BY views DESC
    `);

    // Previous period delta per creator.
    const prevResult = await db.execute(sql`
      WITH deltas AS (${perVideoDelta(prevFrom.toISOString(), prevTo.toISOString())})
      SELECT
        c.id AS creator_id,
        COALESCE(SUM(d.delta), 0)::bigint AS views
      FROM creators c
      LEFT JOIN deltas d ON d.creator_id = c.id
      WHERE c.tenant_id = ${tenantId}
      GROUP BY c.id
    `);

    // Platform breakdown per creator in the current period.
    const byPlatformResult = await db.execute(sql`
      WITH deltas AS (${perVideoDelta(from.toISOString(), to.toISOString())})
      SELECT
        d.creator_id,
        d.platform,
        COALESCE(SUM(d.delta), 0)::bigint AS views,
        COUNT(DISTINCT d.video_id) FILTER (WHERE d.delta > 0)::int AS videos
      FROM deltas d
      WHERE d.creator_id IS NOT NULL
      GROUP BY d.creator_id, d.platform
      ORDER BY d.creator_id, views DESC
    `);

    type CurrentRow = {
      creator_id: string;
      creator_name: string;
      avatar_url: string | null;
      views: string;
      active_videos: number;
      new_videos: number;
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
      const activeVideos = Number(row.active_videos);
      const newVideos = Number(row.new_videos);
      const prevViews = prevMap.get(row.creator_id) ?? 0;

      return {
        id: row.creator_id,
        name: row.creator_name,
        avatarUrl: row.avatar_url,
        views,
        videos: activeVideos,
        newVideos,
        avgViews: activeVideos > 0 ? Math.round(views / activeVideos) : 0,
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
