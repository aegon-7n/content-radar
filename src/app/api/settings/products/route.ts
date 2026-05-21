import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { products, videos } from "@/db/schema";
import { eq, count } from "drizzle-orm";
import { z } from "zod";
import { requireAuthWithTenant } from "@/lib/tenant";

const createProductSchema = z.object({
  name: z.string().min(1, "Название обязательно"),
  wbArticle: z.string().min(1, "Артикул WB обязателен"),
  category: z.string().optional().or(z.literal("")),
});

export async function GET(request: NextRequest) {
  const auth = await requireAuthWithTenant(request);
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.ctx;

  try {
    const result = await db
      .select({
        id: products.id,
        name: products.name,
        wbArticle: products.wbArticle,
        category: products.category,
        needsReview: products.needsReview,
        createdAt: products.createdAt,
        videoCount: count(videos.id),
      })
      .from(products)
      .where(eq(products.tenantId, tenantId))
      .leftJoin(videos, eq(videos.productId, products.id))
      .groupBy(products.id, products.name, products.wbArticle, products.category, products.needsReview, products.createdAt)
      .orderBy(products.name);

    return NextResponse.json({ products: result });
  } catch (error) {
    console.error("[settings/products] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthWithTenant(request);
  if (!auth.ok) return auth.response;
  const { tenantId, userId } = auth.ctx;

  try {
    const body = await request.json();
    const parsed = createProductSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ошибка валидации", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { name, wbArticle, category } = parsed.data;

    const [product] = await db
      .insert(products)
      .values({
        userId,
        tenantId,
        name,
        wbArticle,
        category: category || null,
      })
      .returning();

    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    console.error("[settings/products] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
