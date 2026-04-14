import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { z } from "zod";

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

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

    const { sql } = await import("drizzle-orm");

    // Product info
    const productResult = await db.execute(sql`
      SELECT id, name, wb_article FROM products WHERE id = ${id}
    `);

    if (!productResult.length) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const product = productResult[0] as unknown as {
      id: string;
      name: string;
      wb_article: string;
    };

    // Stats
    const statsResult = await db.execute(sql`
      WITH latest_metrics AS (
        SELECT DISTINCT ON (video_id)
          video_id,
          views
        FROM video_metrics
        ORDER BY video_id, scraped_at DESC
      )
      SELECT
        COALESCE(SUM(lm.views), 0)::bigint AS views,
        COUNT(DISTINCT v.id)::int AS videos
      FROM videos v
      LEFT JOIN latest_metrics lm ON lm.video_id = v.id
      WHERE v.product_id = ${id}
        AND v.published_at >= ${from.toISOString()} AND v.published_at <= ${to.toISOString()}
    `);

    // By platform
    const byPlatformResult = await db.execute(sql`
      WITH latest_metrics AS (
        SELECT DISTINCT ON (video_id)
          video_id,
          views
        FROM video_metrics
        ORDER BY video_id, scraped_at DESC
      )
      SELECT
        v.platform,
        COALESCE(SUM(lm.views), 0)::bigint AS views,
        COUNT(DISTINCT v.id)::int AS videos
      FROM videos v
      LEFT JOIN latest_metrics lm ON lm.video_id = v.id
      WHERE v.product_id = ${id}
        AND v.published_at >= ${from.toISOString()} AND v.published_at <= ${to.toISOString()}
      GROUP BY v.platform
      ORDER BY views DESC
    `);

    // By creator
    const byCreatorResult = await db.execute(sql`
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
        COALESCE(SUM(lm.views), 0)::bigint AS views,
        COUNT(DISTINCT v.id)::int AS videos
      FROM videos v
      LEFT JOIN creators c ON c.id = v.creator_id
      LEFT JOIN latest_metrics lm ON lm.video_id = v.id
      WHERE v.product_id = ${id}
        AND v.published_at >= ${from.toISOString()} AND v.published_at <= ${to.toISOString()}
      GROUP BY c.id, c.name
      ORDER BY views DESC
    `);

    // All videos with latest metrics
    const videosResult = await db.execute(sql`
      WITH latest_metrics AS (
        SELECT DISTINCT ON (video_id)
          video_id,
          views,
          likes,
          comments,
          shares,
          saves
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
      WHERE v.product_id = ${id}
        AND v.published_at >= ${from.toISOString()} AND v.published_at <= ${to.toISOString()}
      ORDER BY views DESC
    `);

    const statsRow = statsResult[0] as unknown as { views: string; videos: number };

    return NextResponse.json({
      product: {
        id: product.id,
        name: product.name,
        wbArticle: product.wb_article,
      },
      stats: {
        views: Number(statsRow?.views ?? 0),
        videos: Number(statsRow?.videos ?? 0),
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
