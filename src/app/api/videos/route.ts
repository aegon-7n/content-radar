import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { z } from "zod";
import { requireAuthWithTenant } from "@/lib/tenant";

const PLATFORM_VALUES = ["tiktok", "youtube", "instagram", "likee", "pinterest"] as const;

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  creatorId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  platform: z.enum(PLATFORM_VALUES).optional(),
  sort: z.enum(["views", "date"]).optional().default("views"),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(1000).optional().default(50),
});

export async function GET(request: NextRequest) {
  const auth = await requireAuthWithTenant(request);
  if (!auth.ok) return auth.response;
  const { tenantId, role, creatorId: sessionCreatorId } = auth.ctx;

  try {
    const { searchParams } = request.nextUrl;
    const params = querySchema.parse(Object.fromEntries(searchParams));

    const to = params.to ? new Date(params.to + "T23:59:59Z") : new Date();
    const from = params.from
      ? new Date(params.from + "T00:00:00Z")
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const { page, limit, sort } = params;
    const offset = (page - 1) * limit;

    const { sql } = await import("drizzle-orm");

    // Creator-role users are always scoped to their own creator; owners can filter optionally.
    const effectiveCreatorId =
      role === "creator" ? sessionCreatorId : (params.creatorId ?? null);
    const creatorFilter = effectiveCreatorId
      ? sql`AND v.creator_id = ${effectiveCreatorId}`
      : sql``;
    const productFilter = params.productId
      ? sql`AND v.product_id = ${params.productId}`
      : sql``;
    const platformFilter = params.platform
      ? sql`AND v.platform = ${params.platform}`
      : sql``;

    const orderBy =
      sort === "date"
        ? sql`v.published_at DESC`
        : sql`views DESC`;

    // Total count
    const countResult = await db.execute(sql`
      SELECT COUNT(DISTINCT v.id)::int AS total
      FROM videos v
      WHERE v.published_at >= ${from.toISOString()} AND v.published_at <= ${to.toISOString()}
        AND v.tenant_id = ${tenantId}
        ${creatorFilter}
        ${productFilter}
        ${platformFilter}
    `);

    const total = Number((countResult[0] as unknown as { total: number }).total ?? 0);

    // Videos with latest metrics (any time, not restricted to period)
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
        v.creator_id,
        v.product_id,
        COALESCE(lm.views, 0)::bigint AS views,
        COALESCE(lm.likes, 0)::int AS likes,
        COALESCE(lm.comments, 0)::int AS comments,
        COALESCE(lm.shares, 0)::int AS shares,
        COALESCE(lm.saves, 0)::int AS saves,
        c.name AS creator_name,
        p.name AS product_name,
        p.wb_article
      FROM videos v
      LEFT JOIN latest_metrics lm ON lm.video_id = v.id
      LEFT JOIN creators c ON c.id = v.creator_id
      LEFT JOIN products p ON p.id = v.product_id
      WHERE v.published_at >= ${from.toISOString()} AND v.published_at <= ${to.toISOString()}
        AND v.tenant_id = ${tenantId}
        ${creatorFilter}
        ${productFilter}
        ${platformFilter}
      ORDER BY ${orderBy}
      LIMIT ${limit} OFFSET ${offset}
    `);

    type VideoRow = {
      id: string;
      url: string;
      platform: string;
      published_at: string;
      creator_id: string | null;
      product_id: string | null;
      views: string;
      likes: number;
      comments: number;
      shares: number;
      saves: number;
      creator_name: string | null;
      product_name: string | null;
      wb_article: string | null;
    };

    const videosList = (videosResult as unknown as VideoRow[]).map((row) => ({
      id: row.id,
      url: row.url,
      platform: row.platform,
      views: Number(row.views),
      likes: Number(row.likes),
      comments: Number(row.comments),
      shares: Number(row.shares),
      saves: Number(row.saves),
      creatorId: row.creator_id ?? "",
      creatorName: row.creator_name ?? "—",
      productId: row.product_id ?? "",
      productName: row.product_name ?? "—",
      wbArticle: row.wb_article ?? "",
      publishedAt: new Date(row.published_at).toISOString(),
    }));

    return NextResponse.json({
      isEmpty: videosList.length === 0 && total === 0,
      videos: videosList,
      total,
      page,
      limit,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: error.issues },
        { status: 400 }
      );
    }
    console.error("[videos] GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
