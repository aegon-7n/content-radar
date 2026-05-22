import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { creators, videos, subscriptions } from "@/db/schema";
import { eq, and, count, sum, ne } from "drizzle-orm";
import { z } from "zod";
import { requireOwner } from "@/lib/tenant";
import { getTuPool } from "@/lib/yookassa";

const patchCreatorSchema = z.object({
  name: z.string().min(1, "Имя не может быть пустым").optional(),
  avatarUrl: z.string().url("Некорректный URL аватара").optional().or(z.literal("")).optional(),
  tiktokUsername: z.string().optional().or(z.literal("")),
  youtubeChannelId: z.string().optional().or(z.literal("")),
  instagramUsername: z.string().optional().or(z.literal("")),
  pinterestUsername: z.string().optional().or(z.literal("")),
  // Per-creator video cap. null removes the limit.
  videoLimit: z.number().int().min(1).nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireOwner(request);
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.ctx;

  try {
    const { id } = params;

    const existing = await db.select({ id: creators.id }).from(creators).where(and(eq(creators.id, id), eq(creators.tenantId, tenantId))).limit(1);
    if (!existing.length) {
      return NextResponse.json({ error: "Креатор не найден" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = patchCreatorSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ошибка валидации", details: parsed.error.issues },
        { status: 400 }
      );
    }

    if (parsed.data.videoLimit !== undefined && parsed.data.videoLimit !== null) {
      const newLimit = parsed.data.videoLimit;

      // C3: new limit must not be below creator's current video count.
      const [creatorCount] = await db
        .select({ count: count() })
        .from(videos)
        .where(and(eq(videos.creatorId, id), eq(videos.tenantId, tenantId)));
      const currentUsed = Number(creatorCount?.count ?? 0);
      if (newLimit < currentUsed) {
        return NextResponse.json(
          { error: `Нельзя снизить лимит ниже текущего количества роликов (${currentUsed})` },
          { status: 422 }
        );
      }

      // C1: SUM of all other creators' limits + new limit must not exceed tenant pool.
      const [sub] = await db
        .select({ tier: subscriptions.tier })
        .from(subscriptions)
        .where(eq(subscriptions.tenantId, tenantId))
        .limit(1);
      const tuPool = getTuPool(sub?.tier);

      const [otherSum] = await db
        .select({ total: sum(creators.videoLimit) })
        .from(creators)
        .where(and(eq(creators.tenantId, tenantId), ne(creators.id, id)));
      const otherTotal = Number(otherSum?.total ?? 0);

      if (otherTotal + newLimit > tuPool) {
        return NextResponse.json(
          { error: `Сумма лимитов всех креаторов превысит пул тарифа (${tuPool} роликов). Доступно: ${tuPool - otherTotal}` },
          { status: 422 }
        );
      }
    }

    const updates: Record<string, string | number | null> = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.avatarUrl !== undefined) {
      updates.avatarUrl = parsed.data.avatarUrl === "" ? null : parsed.data.avatarUrl;
    }
    if (parsed.data.tiktokUsername !== undefined) {
      updates.tiktokUsername = parsed.data.tiktokUsername === "" ? null : parsed.data.tiktokUsername;
    }
    if (parsed.data.youtubeChannelId !== undefined) {
      updates.youtubeChannelId = parsed.data.youtubeChannelId === "" ? null : parsed.data.youtubeChannelId;
    }
    if (parsed.data.instagramUsername !== undefined) {
      updates.instagramUsername = parsed.data.instagramUsername === "" ? null : parsed.data.instagramUsername;
    }
    if (parsed.data.pinterestUsername !== undefined) {
      updates.pinterestUsername = parsed.data.pinterestUsername === "" ? null : parsed.data.pinterestUsername;
    }
    if (parsed.data.videoLimit !== undefined) {
      updates.videoLimit = parsed.data.videoLimit;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Нет полей для обновления" }, { status: 400 });
    }

    const [updated] = await db
      .update(creators)
      .set(updates)
      .where(and(eq(creators.id, id), eq(creators.tenantId, tenantId)))
      .returning();

    return NextResponse.json({ creator: updated });
  } catch (error) {
    console.error("[settings/creators/[id]] PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireOwner(request);
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.ctx;

  try {
    const { id } = params;

    const existing = await db.select({ id: creators.id }).from(creators).where(and(eq(creators.id, id), eq(creators.tenantId, tenantId))).limit(1);
    if (!existing.length) {
      return NextResponse.json({ error: "Креатор не найден" }, { status: 404 });
    }

    const videoCount = await db
      .select({ count: count() })
      .from(videos)
      .where(eq(videos.creatorId, id));

    if (Number(videoCount[0].count) > 0) {
      return NextResponse.json(
        { error: "Нельзя удалить: есть ролики" },
        { status: 409 }
      );
    }

    await db.delete(creators).where(and(eq(creators.id, id), eq(creators.tenantId, tenantId)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[settings/creators/[id]] DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
