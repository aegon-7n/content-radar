import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { products, users, videos } from "@/db/schema";
import { eq, count } from "drizzle-orm";
import { z } from "zod";

// Cache the default user id at module level
let defaultUserId: string | null = null;

async function getDefaultUserId(): Promise<string> {
  if (defaultUserId) return defaultUserId;
  const result = await db.select({ id: users.id }).from(users).limit(1);
  if (!result.length) throw new Error("No users found in database");
  defaultUserId = result[0].id;
  return defaultUserId;
}

const createProductSchema = z.object({
  name: z.string().min(1, "Название обязательно"),
  wbArticle: z.string().min(1, "Артикул WB обязателен"),
  category: z.string().optional().or(z.literal("")),
});

export async function GET() {
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
  try {
    const body = await request.json();
    const parsed = createProductSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ошибка валидации", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const userId = await getDefaultUserId();
    const { name, wbArticle, category } = parsed.data;

    const [product] = await db
      .insert(products)
      .values({
        userId,
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
