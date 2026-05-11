import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";

/**
 * Products list — cumulative delta per product, matching /api/dashboard and
 * /api/creators. For each product: how many views its promoting videos gained
 * in the selected period, per-platform breakdown of that delta, how many
 * videos were published in the period.
 */
const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  try {
    const { searchParams } = request.nextUrl;
    const params = querySchema.parse(Object.fromEntries(searchParams));

    const to = params.to ? new Date(params.to + "T23:59:59Z") : new Date();
    const from = params.from
      ? new Date(params.from + "T00:00:00Z")
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const perVideoDelta = sql`
      WITH
      end_views AS (
        SELECT DISTINCT ON (vm.video_id)
          vm.video_id, vm.views
        FROM video_metrics vm
        WHERE vm.scraped_at <= ${to.toISOString()}
        ORDER BY vm.video_id, vm.scraped_at DESC
      ),
      start_views AS (
        SELECT DISTINCT ON (vm.video_id)
          vm.video_id, vm.views
        FROM video_metrics vm
        WHERE vm.scraped_at < ${from.toISOString()}
        ORDER BY vm.video_id, vm.scraped_at DESC
      )
      SELECT
        v.id AS video_id,
        v.product_id,
        v.platform,
        GREATEST(COALESCE(ev.views, 0) - COALESCE(sv.views, 0), 0) AS delta
      FROM videos v
      LEFT JOIN end_views ev ON ev.video_id = v.id
      LEFT JOIN start_views sv ON sv.video_id = v.id
      WHERE v.user_id = ${userId}
    `;

    // Totals per product.
    const productsResult = await db.execute(sql`
      WITH deltas AS (${perVideoDelta})
      SELECT
        p.id AS product_id,
        p.name AS product_name,
        p.wb_article,
        COALESCE(SUM(d.delta), 0)::bigint AS views,
        COUNT(DISTINCT d.video_id) FILTER (WHERE d.delta > 0)::int AS active_videos,
        (SELECT COUNT(*) FROM videos v2
         WHERE v2.product_id = p.id
           AND v2.published_at >= ${from.toISOString()}
           AND v2.published_at <= ${to.toISOString()})::int AS new_videos
      FROM products p
      LEFT JOIN deltas d ON d.product_id = p.id
      WHERE p.user_id = ${userId}
      GROUP BY p.id, p.name, p.wb_article
      ORDER BY views DESC
    `);

    // Platform breakdown per product.
    const byPlatformResult = await db.execute(sql`
      WITH deltas AS (${perVideoDelta})
      SELECT
        d.product_id,
        d.platform,
        COALESCE(SUM(d.delta), 0)::bigint AS views
      FROM deltas d
      WHERE d.product_id IS NOT NULL
      GROUP BY d.product_id, d.platform
      ORDER BY d.product_id, views DESC
    `);

    type ProductRow = {
      product_id: string;
      product_name: string;
      wb_article: string;
      views: string;
      active_videos: number;
      new_videos: number;
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
      videos: Number(row.active_videos),
      newVideos: Number(row.new_videos),
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
