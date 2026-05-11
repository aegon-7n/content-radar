import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { videos, creators, products } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";

const PLATFORM_VALUES = ["tiktok", "youtube", "instagram", "likee", "pinterest"] as const;

const createVideoSchema = z.object({
  url: z.string().url("URL ролика должен быть валидным"),
  creatorId: z.string().uuid("Некорректный ID креатора"),
  productId: z.string().uuid("Некорректный ID товара"),
  platform: z.enum(PLATFORM_VALUES, { error: "Платформа должна быть одной из: tiktok, youtube, instagram, likee, pinterest" }),
  publishedAt: z.string().datetime({ message: "Некорректный формат даты публикации (ISO 8601)" }),
});

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  try {
    const body = await request.json();
    const parsed = createVideoSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ошибка валидации", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const { url, creatorId, productId, platform, publishedAt } = parsed.data;

    const creator = await db
      .select({ id: creators.id })
      .from(creators)
      .where(and(eq(creators.id, creatorId), eq(creators.userId, userId)))
      .limit(1);

    if (!creator.length) {
      return NextResponse.json({ error: "Креатор не найден" }, { status: 404 });
    }

    const product = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.userId, userId)))
      .limit(1);

    if (!product.length) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }

    const [video] = await db
      .insert(videos)
      .values({
        userId,
        creatorId,
        productId,
        platform,
        url,
        publishedAt: new Date(publishedAt),
      })
      .returning();

    return NextResponse.json({ video }, { status: 201 });
  } catch (error) {
    console.error("[settings/videos] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
