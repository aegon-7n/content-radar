import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { z } from "zod";

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const params = querySchema.parse(Object.fromEntries(searchParams));

    const to = params.to ? new Date(params.to + "T23:59:59Z") : new Date();
    const from = params.from
      ? new Date(params.from + "T00:00:00Z")
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const { sql } = await import("drizzle-orm");

    // Product totals
    const productsResult = await db.execute(sql`
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
      FROM products p
      LEFT JOIN videos v ON v.product_id = p.id
        AND v.published_at >= ${from.toISOString()} AND v.published_at <= ${to.toISOString()}
      LEFT JOIN latest_metrics lm ON lm.video_id = v.id
      GROUP BY p.id, p.name, p.wb_article
      ORDER BY views DESC
    `);

    // Views by platform per product
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
        v.product_id,
        v.platform,
        COALESCE(SUM(lm.views), 0)::bigint AS views
      FROM videos v
      INNER JOIN latest_metrics lm ON lm.video_id = v.id
      WHERE v.published_at >= ${from.toISOString()} AND v.published_at <= ${to.toISOString()}
      GROUP BY v.product_id, v.platform
      ORDER BY v.product_id, views DESC
    `);

    type ProductRow = {
      product_id: string;
      product_name: string;
      wb_article: string;
      views: string;
      videos: number;
    };
    type PlatformRow = {
      product_id: string;
      platform: string;
      views: string;
    };

    const platformMap = new Map<string, Array<{ platform: string; views: number }>>();
    for (const row of byPlatformResult as unknown as PlatformRow[]) {
      if (!platformMap.has(row.product_id)) {
        platformMap.set(row.product_id, []);
      }
      platformMap.get(row.product_id)!.push({
        platform: row.platform,
        views: Number(row.views),
      });
    }

    const productsList = (productsResult as unknown as ProductRow[]).map((row) => ({
      id: row.product_id,
      name: row.product_name,
      wbArticle: row.wb_article,
      views: Number(row.views),
      videos: Number(row.videos),
      byPlatform: platformMap.get(row.product_id) ?? [],
    }));

    return NextResponse.json({ products: productsList });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: error.issues },
        { status: 400 }
      );
    }
    console.error("[products] GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
