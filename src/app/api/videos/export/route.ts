import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";

const PLATFORM_VALUES = ["tiktok", "youtube", "instagram", "likee", "pinterest"] as const;

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  creatorId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  platform: z.enum(PLATFORM_VALUES).optional(),
});

export async function GET(request: NextRequest) {
  const denied = await requireAuth(request);
  if (denied) return denied;

  try {
    const { searchParams } = request.nextUrl;
    const params = querySchema.parse(Object.fromEntries(searchParams));

    const to = params.to ? new Date(params.to + "T23:59:59Z") : new Date();
    const from = params.from
      ? new Date(params.from + "T00:00:00Z")
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const { sql } = await import("drizzle-orm");

    const creatorFilter = params.creatorId
      ? sql`AND v.creator_id = ${params.creatorId}`
      : sql``;
    const productFilter = params.productId
      ? sql`AND v.product_id = ${params.productId}`
      : sql``;
    const platformFilter = params.platform
      ? sql`AND v.platform = ${params.platform}`
      : sql``;

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
        v.url,
        v.platform,
        v.published_at,
        COALESCE(lm.views, 0)::bigint AS views,
        COALESCE(lm.likes, 0)::int AS likes,
        COALESCE(lm.comments, 0)::int AS comments,
        COALESCE(lm.shares, 0)::int AS shares,
        COALESCE(lm.saves, 0)::int AS saves,
        COALESCE(c.name, '—') AS creator_name,
        COALESCE(p.name, '—') AS product_name,
        COALESCE(p.wb_article, '') AS wb_article
      FROM videos v
      LEFT JOIN latest_metrics lm ON lm.video_id = v.id
      LEFT JOIN creators c ON c.id = v.creator_id
      LEFT JOIN products p ON p.id = v.product_id
      WHERE v.published_at >= ${from.toISOString()} AND v.published_at <= ${to.toISOString()}
        ${creatorFilter}
        ${productFilter}
        ${platformFilter}
      ORDER BY views DESC
      LIMIT 10000
    `);

    type VideoRow = {
      url: string;
      platform: string;
      published_at: string;
      views: string;
      likes: number;
      comments: number;
      shares: number;
      saves: number;
      creator_name: string;
      product_name: string;
      wb_article: string;
    };

    const rows = videosResult as unknown as VideoRow[];

    const csvHeader = "url,platform,views,likes,comments,shares,saves,creator,product,wb_article,published_at";

    const escapeField = (value: string | number): string => {
      const str = String(value);
      // Wrap in quotes if the field contains comma, quote, or newline
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvRows = rows.map((row) =>
      [
        escapeField(row.url),
        escapeField(row.platform),
        escapeField(Number(row.views)),
        escapeField(Number(row.likes)),
        escapeField(Number(row.comments)),
        escapeField(Number(row.shares)),
        escapeField(Number(row.saves)),
        escapeField(row.creator_name),
        escapeField(row.product_name),
        escapeField(row.wb_article),
        escapeField(new Date(row.published_at).toISOString()),
      ].join(",")
    );

    // BOM + header + rows
    const csvContent = "\uFEFF" + [csvHeader, ...csvRows].join("\n");

    const exportDate = new Date().toISOString().slice(0, 10);

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="videos-export-${exportDate}.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: error.issues },
        { status: 400 }
      );
    }
    console.error("[videos/export] GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
