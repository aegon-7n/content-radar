import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { videos, creators, products } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { requireAuthWithTenant } from "@/lib/tenant";

const PLATFORM_VALUES = ["tiktok", "youtube", "instagram", "likee", "pinterest"] as const;

const importItemSchema = z.object({
  url: z.string().url("URL ролика должен быть валидным"),
  creatorName: z.string().min(1, "Имя креатора обязательно"),
  productName: z.string().min(1, "Название товара обязательно"),
  platform: z.enum(PLATFORM_VALUES, { error: "Неверная платформа" }),
  publishedAt: z.string().datetime({ message: "Некорректный формат даты (ISO 8601)" }),
  wbArticle: z.string().optional(),
});

const importBodySchema = z.array(importItemSchema).min(1, "Массив не может быть пустым");

export async function POST(request: NextRequest) {
  const auth = await requireAuthWithTenant(request);
  if (!auth.ok) return auth.response;
  const { tenantId, userId } = auth.ctx;

  try {
    const body = await request.json();
    const parsed = importBodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ошибка валидации", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const items = parsed.data;

    // In-memory caches to avoid repeated DB lookups within the same request
    const creatorCache = new Map<string, string>(); // name -> id
    const productCache = new Map<string, string>();  // name -> id

    let imported = 0;
    const errors: string[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemLabel = `[${i + 1}] "${item.url}"`;

      try {
        // --- Resolve creator ---
        let creatorId = creatorCache.get(item.creatorName);

        if (!creatorId) {
          const existing = await db
            .select({ id: creators.id })
            .from(creators)
            .where(and(eq(creators.tenantId, tenantId), eq(creators.name, item.creatorName)))
            .limit(1);

          if (existing.length) {
            creatorId = existing[0].id;
          } else {
            const [newCreator] = await db
              .insert(creators)
              .values({ userId, tenantId, name: item.creatorName })
              .returning({ id: creators.id });
            creatorId = newCreator.id;
          }

          creatorCache.set(item.creatorName, creatorId);
        }

        // --- Resolve product ---
        let productId = productCache.get(item.productName);

        if (!productId) {
          const existing = await db
            .select({ id: products.id })
            .from(products)
            .where(and(eq(products.tenantId, tenantId), eq(products.name, item.productName)))
            .limit(1);

          if (existing.length) {
            productId = existing[0].id;
          } else {
            const [newProduct] = await db
              .insert(products)
              .values({
                userId,
                tenantId,
                name: item.productName,
                wbArticle: item.wbArticle ?? "unknown",
              })
              .returning({ id: products.id });
            productId = newProduct.id;
          }

          productCache.set(item.productName, productId);
        }

        // --- Insert video ---
        await db.insert(videos).values({
          userId,
          tenantId,
          creatorId,
          productId,
          platform: item.platform,
          url: item.url,
          publishedAt: new Date(item.publishedAt),
        });

        imported++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${itemLabel}: ${message}`);
      }
    }

    return NextResponse.json({ imported, errors }, { status: 200 });
  } catch (error) {
    console.error("[settings/import] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
