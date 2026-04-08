import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { videos, users, creators, products } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const PLATFORM_VALUES = ["tiktok", "youtube", "instagram", "likee", "pinterest"] as const;

// Cache the default user id at module level
let defaultUserId: string | null = null;

async function getDefaultUserId(): Promise<string> {
  if (defaultUserId) return defaultUserId;
  const result = await db.select({ id: users.id }).from(users).limit(1);
  if (!result.length) throw new Error("No users found in database");
  defaultUserId = result[0].id;
  return defaultUserId;
}

const createVideoSchema = z.object({
  url: z.string().url("URL ролика должен быть валидным"),
  creatorId: z.string().uuid("Некорректный ID креатора"),
  productId: z.string().uuid("Некорректный ID товара"),
  platform: z.enum(PLATFORM_VALUES, { error: "Платформа должна быть одной из: tiktok, youtube, instagram, likee, pinterest" }),
  publishedAt: z.string().datetime({ message: "Некорректный формат даты публикации (ISO 8601)" }),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createVideoSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ошибка валидации", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { url, creatorId, productId, platform, publishedAt } = parsed.data;

    // Verify creator exists
    const creator = await db
      .select({ id: creators.id })
      .from(creators)
      .where(eq(creators.id, creatorId))
      .limit(1);

    if (!creator.length) {
      return NextResponse.json({ error: "Креатор не найден" }, { status: 404 });
    }

    // Verify product exists
    const product = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    if (!product.length) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }

    const userId = await getDefaultUserId();

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
