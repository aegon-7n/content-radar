import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { requireAuth } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  try {
    const { id } = await params;
    const { sql } = await import("drizzle-orm");

    // Video info with creator and product
    const videoResult = await db.execute(sql`
      SELECT
        v.id,
        v.url,
        v.platform,
        v.published_at,
        v.creator_id,
        v.product_id,
        c.name AS creator_name,
        p.name AS product_name,
        p.wb_article
      FROM videos v
      INNER JOIN creators c ON c.id = v.creator_id
      INNER JOIN products p ON p.id = v.product_id
      WHERE v.id = ${id} AND v.user_id = ${userId}
    `);

    if (!videoResult.length) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    type VideoRow = {
      id: string;
      url: string;
      platform: string;
      published_at: string;
      creator_id: string;
      product_id: string;
      creator_name: string;
      product_name: string;
      wb_article: string;
    };

    const row = videoResult[0] as unknown as VideoRow;

    // Latest metrics snapshot
    const latestResult = await db.execute(sql`
      SELECT views, likes, comments, shares, saves, scraped_at
      FROM video_metrics
      WHERE video_id = ${id}
      ORDER BY scraped_at DESC
      LIMIT 1
    `);

    type MetricRow = {
      views: string;
      likes: number;
      comments: number;
      shares: number;
      saves: number;
      scraped_at: string;
    };

    const latestRow = latestResult[0] as unknown as MetricRow | undefined;

    const latest = latestRow
      ? {
          views: Number(latestRow.views),
          likes: Number(latestRow.likes),
          comments: Number(latestRow.comments),
          shares: Number(latestRow.shares),
          saves: Number(latestRow.saves),
          scrapedAt: new Date(latestRow.scraped_at).toISOString(),
        }
      : null;

    // Full metrics history
    const historyResult = await db.execute(sql`
      SELECT
        DATE(scraped_at AT TIME ZONE 'UTC')::text AS date,
        views,
        likes,
        comments,
        shares,
        saves
      FROM video_metrics
      WHERE video_id = ${id}
      ORDER BY scraped_at ASC
    `);

    type HistoryRow = {
      date: string;
      views: string;
      likes: number;
      comments: number;
      shares: number;
      saves: number;
    };

    const history = (historyResult as unknown as HistoryRow[]).map((h) => ({
      date: h.date,
      views: Number(h.views),
      likes: Number(h.likes),
      comments: Number(h.comments),
      shares: Number(h.shares),
      saves: Number(h.saves),
    }));

    return NextResponse.json({
      video: {
        id: row.id,
        url: row.url,
        platform: row.platform,
        publishedAt: new Date(row.published_at).toISOString(),
        creatorId: row.creator_id,
        creatorName: row.creator_name,
        productId: row.product_id,
        productName: row.product_name,
        wbArticle: row.wb_article,
      },
      latest,
      history,
    });
  } catch (error) {
    console.error("[videos/[id]] GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
