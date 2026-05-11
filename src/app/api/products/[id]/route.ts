import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";

/**
 * Product detail — cumulative delta for the product's videos in the selected
 * period. Same model as /api/dashboard so numbers agree across screens.
 *
 * The videos table at the bottom shows the video's **latest metrics** (not
 * delta) because that is the operational view — the seller wants to see how
 * each individual creative is performing right now, which is a different
 * question than "how much did my catalog gain this week".
 */
const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  try {
    const { id } = await params;
    const { searchParams } = request.nextUrl;
    const query = querySchema.parse(Object.fromEntries(searchParams));

    const to = query.to ? new Date(query.to + "T23:59:59Z") : new Date();
    const from = query.from
      ? new Date(query.from + "T00:00:00Z")
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Product info — scoped to current user.
    const productResult = await db.execute(sql`
      SELECT id, name, wb_article FROM products WHERE id = ${id} AND user_id = ${userId}
    `);
    if (!productResult.length) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    const product = productResult[0] as unknown as {
      id: string;
      name: string;
      wb_article: string;
    };

    // Per-video delta scoped to this product.
    const perVideoDelta = sql`
      WITH
      product_videos AS (
        SELECT v.id, v.platform, v.creator_id, v.published_at
        FROM videos v
        WHERE v.product_id = ${id} AND v.user_id = ${userId}
      ),
      end_views AS (
        SELECT DISTINCT ON (vm.video_id) vm.video_id, vm.views
        FROM video_metrics vm
        INNER JOIN product_videos pv ON pv.id = vm.video_id
        WHERE vm.scraped_at <= ${to.toISOString()}
        ORDER BY vm.video_id, vm.scraped_at DESC
      ),
      start_views AS (
        SELECT DISTINCT ON (vm.video_id) vm.video_id, vm.views
        FROM video_metrics vm
        INNER JOIN product_videos pv ON pv.id = vm.video_id
        WHERE vm.scraped_at < ${from.toISOString()}
        ORDER BY vm.video_id, vm.scraped_at DESC
      )
      SELECT
        pv.id AS video_id,
        pv.platform,
        pv.creator_id,
        pv.published_at,
        GREATEST(COALESCE(ev.views, 0) - COALESCE(sv.views, 0), 0) AS delta
      FROM product_videos pv
      LEFT JOIN end_views ev ON ev.video_id = pv.id
      LEFT JOIN start_views sv ON sv.video_id = pv.id
    `;

    // Totals for the product.
    const statsResult = await db.execute(sql`
      WITH deltas AS (${perVideoDelta})
      SELECT
        COALESCE(SUM(delta), 0)::bigint AS views,
        COUNT(*) FILTER (WHERE delta > 0)::int AS active_videos,
        COUNT(*) FILTER (
          WHERE published_at >= ${from.toISOString()}
            AND published_at <= ${to.toISOString()}
        )::int AS new_videos
      FROM deltas
    `);

    // By platform.
    const byPlatformResult = await db.execute(sql`
      WITH deltas AS (${perVideoDelta})
      SELECT
        platform,
        COALESCE(SUM(delta), 0)::bigint AS views,
        COUNT(*) FILTER (WHERE delta > 0)::int AS videos
      FROM deltas
      GROUP BY platform
      ORDER BY views DESC
    `);

    // By creator.
    const byCreatorResult = await db.execute(sql`
      WITH deltas AS (${perVideoDelta})
      SELECT
        c.id AS creator_id,
        c.name AS creator_name,
        COALESCE(SUM(d.delta), 0)::bigint AS views,
        COUNT(*) FILTER (WHERE d.delta > 0)::int AS videos
      FROM deltas d
      LEFT JOIN creators c ON c.id = d.creator_id
      GROUP BY c.id, c.name
      ORDER BY views DESC
    `);

    // All videos for this product — list with latest metrics (NOT delta).
    // Operational view: "how is each video actually performing right now".
    // Not restricted to the selected period because the seller is looking at
    // the product's creatives, not aggregate trends.
    const videosResult = await db.execute(sql`
      WITH latest_metrics AS (
        SELECT DISTINCT ON (video_id)
          video_id, views, likes, comments, shares, saves
        FROM video_metrics
        ORDER BY video_id, scraped_at DESC
      )
      SELECT
        v.id,
        v.url,
        v.platform,
        v.published_at,
        COALESCE(lm.views, 0)::bigint AS views,
        COALESCE(lm.likes, 0)::int AS likes,
        COALESCE(lm.comments, 0)::int AS comments,
        COALESCE(lm.shares, 0)::int AS shares,
        COALESCE(lm.saves, 0)::int AS saves,
        COALESCE(c.name, '—') AS creator_name
      FROM videos v
      LEFT JOIN latest_metrics lm ON lm.video_id = v.id
      LEFT JOIN creators c ON c.id = v.creator_id
      WHERE v.product_id = ${id} AND v.user_id = ${userId}
      ORDER BY views DESC
    `);

    const statsRow = statsResult[0] as unknown as {
      views: string;
      active_videos: number;
      new_videos: number;
    };

    return NextResponse.json({
      product: {
        id: product.id,
        name: product.name,
        wbArticle: product.wb_article,
      },
      stats: {
        views: Number(statsRow?.views ?? 0),
        videos: Number(statsRow?.active_videos ?? 0),
        newVideos: Number(statsRow?.new_videos ?? 0),
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
      byCreator: (byCreatorResult as unknown as Array<{
        creator_id: string;
        creator_name: string;
        views: string;
        videos: number;
      }>).map((row) => ({
        creatorId: row.creator_id,
        creatorName: row.creator_name,
        views: Number(row.views),
        videos: Number(row.videos),
      })),
      videos: (videosResult as unknown as Array<{
        id: string;
        url: string;
        platform: string;
        views: string;
        likes: number;
        comments: number;
        shares: number;
        saves: number;
        creator_name: string;
        published_at: string;
      }>).map((row) => ({
        id: row.id,
        url: row.url,
        platform: row.platform,
        views: Number(row.views),
        likes: Number(row.likes),
        comments: Number(row.comments),
        shares: Number(row.shares),
        saves: Number(row.saves),
        creatorName: row.creator_name,
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
    console.error("[products/[id]] GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
