import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { products, videos } from "@/db/schema";
import { eq, count } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";

const patchProductSchema = z.object({
  name: z.string().min(1, "Название не может быть пустым").optional(),
  wbArticle: z.string().min(1, "Артикул не может быть пустым").optional(),
  category: z.string().optional().nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const denied = await requireAuth(request);
  if (denied) return denied;

  try {
    const { id } = params;

    const existing = await db.select({ id: products.id }).from(products).where(eq(products.id, id)).limit(1);
    if (!existing.length) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = patchProductSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ошибка валидации", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const updates: Record<string, string | number | null> = {};
    if (parsed.data.name !== undefined) {
      updates.name = parsed.data.name;
      updates.needsReview = 0; // снимаем флаг когда пользователь задаёт имя
    }
    if (parsed.data.wbArticle !== undefined) updates.wbArticle = parsed.data.wbArticle;
    if (parsed.data.category !== undefined) updates.category = parsed.data.category ?? null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Нет полей для обновления" }, { status: 400 });
    }

    const [updated] = await db
      .update(products)
      .set(updates)
      .where(eq(products.id, id))
      .returning();

    return NextResponse.json({ product: updated });
  } catch (error) {
    console.error("[settings/products/[id]] PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const denied = await requireAuth(request);
  if (denied) return denied;

  try {
    const { id } = params;

    const existing = await db.select({ id: products.id }).from(products).where(eq(products.id, id)).limit(1);
    if (!existing.length) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }

    const videoCount = await db
      .select({ count: count() })
      .from(videos)
      .where(eq(videos.productId, id));

    if (Number(videoCount[0].count) > 0) {
      return NextResponse.json(
        { error: "Нельзя удалить: есть ролики" },
        { status: 409 }
      );
    }

    await db.delete(products).where(eq(products.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[settings/products/[id]] DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
