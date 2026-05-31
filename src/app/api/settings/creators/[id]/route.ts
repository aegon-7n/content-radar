import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { creators, videos, subscriptions } from "@/db/schema";
import { eq, and, count, sum, ne, gte } from "drizzle-orm";
import { z } from "zod";
import { requireOwner } from "@/lib/tenant";
import { getTuPool, getCurrentPeriodStart } from "@/lib/yookassa";
import { resolveYouTubeChannelId, YouTubeResolveError } from "@/lib/youtube";

const optionalHandle = z.string().nullable().optional().or(z.literal(""));

const patchCreatorSchema = z.object({
  name: z.string().min(1, "Имя не может быть пустым").optional(),
  avatarUrl: z
    .string()
    .nullable()
    .optional()
    .or(z.literal(""))
    .refine(
      (v) => !v || /^https?:\/\//.test(v),
      { message: "Некорректный URL аватара" },
    ),
  tiktokUsername: optionalHandle,
  // Accept @handle, full URL, or raw UC-ID — resolveYouTubeChannelId
  // validates and converts to UC... at runtime.
  youtubeChannelId: optionalHandle,
  instagramUsername: optionalHandle,
  pinterestUsername: optionalHandle,
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
      const firstIssue = parsed.error.issues[0];
      const message = firstIssue?.message || "Ошибка валидации";
      return NextResponse.json(
        { error: message, details: parsed.error.issues },
        { status: 400 }
      );
    }

    if (parsed.data.videoLimit !== undefined && parsed.data.videoLimit !== null) {
      const newLimit = parsed.data.videoLimit;

      // C3: new monthly limit must not be below creator's usage in the current period.
      const periodStart = getCurrentPeriodStart();
      const [creatorCount] = await db
        .select({ count: count() })
        .from(videos)
        .where(and(
          eq(videos.creatorId, id),
          eq(videos.tenantId, tenantId),
          gte(videos.createdAt, periodStart),
        ));
      const currentUsed = Number(creatorCount?.count ?? 0);
      if (newLimit < currentUsed) {
        return NextResponse.json(
          { error: `Нельзя снизить лимит ниже использованного в этом месяце (${currentUsed})` },
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
      const raw = parsed.data.youtubeChannelId;
      if (!raw || (typeof raw === "string" && raw.trim() === "")) {
        updates.youtubeChannelId = null;
      } else {
        try {
          updates.youtubeChannelId = await resolveYouTubeChannelId(raw);
        } catch (err) {
          const message =
            err instanceof YouTubeResolveError
              ? err.message
              : "Не удалось распознать YouTube канал";
          return NextResponse.json({ error: message }, { status: 400 });
        }
      }
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

    // Soft-delete if videos exist (preserves history + frees handles like
    // youtube_channel_id for a new creator on the same channel).
    if (Number(videoCount[0].count) > 0) {
      await db
        .update(creators)
        .set({ archivedAt: new Date() })
        .where(and(eq(creators.id, id), eq(creators.tenantId, tenantId)));
      return NextResponse.json({ success: true, archived: true });
    }

    await db.delete(creators).where(and(eq(creators.id, id), eq(creators.tenantId, tenantId)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[settings/creators/[id]] DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
