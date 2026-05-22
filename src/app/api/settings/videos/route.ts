import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { videos, creators, products, subscriptions } from "@/db/schema";
import { eq, and, count } from "drizzle-orm";
import { z } from "zod";
import { requireAuthWithTenant } from "@/lib/tenant";
import { getTuPool } from "@/lib/yookassa";

const PLATFORM_VALUES = ["tiktok", "youtube", "instagram", "likee", "pinterest"] as const;

const createVideoSchema = z.object({
  url: z.string().url("URL ролика должен быть валидным"),
  creatorId: z.string().uuid("Некорректный ID креатора"),
  productId: z.string().uuid("Некорректный ID товара"),
  platform: z.enum(PLATFORM_VALUES, { error: "Платформа должна быть одной из: tiktok, youtube, instagram, likee, pinterest" }),
  publishedAt: z.string().datetime({ message: "Некорректный формат даты публикации (ISO 8601)" }),
});

export async function POST(request: NextRequest) {
  const auth = await requireAuthWithTenant(request);
  if (!auth.ok) return auth.response;
  const { tenantId, userId } = auth.ctx;

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

    const [creator] = await db
      .select({ id: creators.id, videoLimit: creators.videoLimit })
      .from(creators)
      .where(and(eq(creators.id, creatorId), eq(creators.tenantId, tenantId)))
      .limit(1);

    if (!creator) {
      return NextResponse.json({ error: "Креатор не найден" }, { status: 404 });
    }

    // Soft-cap: check per-creator limit and tenant-level TU pool.
    const [creatorVideoCount] = await db
      .select({ count: count() })
      .from(videos)
      .where(and(eq(videos.creatorId, creatorId), eq(videos.tenantId, tenantId)));
    const creatorUsed = Number(creatorVideoCount?.count ?? 0);

    if (creator.videoLimit !== null && creatorUsed >= creator.videoLimit) {
      return NextResponse.json(
        { error: `Лимит роликов для этого креатора достигнут (${creator.videoLimit})` },
        { status: 422 }
      );
    }

    // Tenant-level TU pool check.
    const [sub] = await db
      .select({ tier: subscriptions.tier })
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, tenantId))
      .limit(1);
    const tuPool = getTuPool(sub?.tier);

    const [tenantVideoCount] = await db
      .select({ count: count() })
      .from(videos)
      .where(eq(videos.tenantId, tenantId));
    const tenantUsed = Number(tenantVideoCount?.count ?? 0);

    if (tenantUsed >= tuPool) {
      return NextResponse.json(
        { error: `Достигнут лимит роликов тарифного плана (${tuPool} видео). Обновите тариф.` },
        { status: 422 }
      );
    }

    const product = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.tenantId, tenantId)))
      .limit(1);

    if (!product.length) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }

    const [video] = await db
      .insert(videos)
      .values({
        userId,
        tenantId,
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
