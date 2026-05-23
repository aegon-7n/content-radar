import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { creators, videos } from "@/db/schema";
import { eq, count } from "drizzle-orm";
import { z } from "zod";
import { requireAuthWithTenant } from "@/lib/tenant";

function stripAt(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim().replace(/^@+/, "").trim();
  return t.length ? t : null;
}


const createCreatorSchema = z.object({
  name: z.string().min(1, "Имя обязательно"),
  avatarUrl: z.string().url("Некорректный URL аватара").optional().or(z.literal("")),
  tiktokUsername: z.string().optional().or(z.literal("")),
  youtubeChannelId: z
    .string()
    .regex(/^UC[A-Za-z0-9_-]{20,30}$/, "YouTube Channel ID должен начинаться с UC и быть длиной 22–32 символа (пример: UCxxxxxxxxxxxxxxxxxx)")
    .optional()
    .or(z.literal("")),
  instagramUsername: z.string().optional().or(z.literal("")),
  pinterestUsername: z.string().optional().or(z.literal("")),
});

export async function GET(request: NextRequest) {
  const auth = await requireAuthWithTenant(request);
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.ctx;

  try {
    const result = await db
      .select({
        id: creators.id,
        name: creators.name,
        avatarUrl: creators.avatarUrl,
        tiktokUsername: creators.tiktokUsername,
        youtubeChannelId: creators.youtubeChannelId,
        instagramUsername: creators.instagramUsername,
        pinterestUsername: creators.pinterestUsername,
        createdAt: creators.createdAt,
        videoCount: count(videos.id),
      })
      .from(creators)
      .where(eq(creators.tenantId, tenantId))
      .leftJoin(videos, eq(videos.creatorId, creators.id))
      .groupBy(
        creators.id,
        creators.name,
        creators.avatarUrl,
        creators.tiktokUsername,
        creators.youtubeChannelId,
        creators.instagramUsername,
        creators.pinterestUsername,
        creators.createdAt,
      )
      .orderBy(creators.name);

    return NextResponse.json({ creators: result });
  } catch (error) {
    console.error("[settings/creators] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthWithTenant(request);
  if (!auth.ok) return auth.response;
  const { tenantId, userId } = auth.ctx;

  try {
    const body = await request.json();
    const parsed = createCreatorSchema.safeParse(body);

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const message = firstIssue?.message || "Ошибка валидации";
      return NextResponse.json(
        { error: message, details: parsed.error.issues },
        { status: 400 }
      );
    }

    const {
      name,
      avatarUrl,
      tiktokUsername,
      youtubeChannelId,
      instagramUsername,
      pinterestUsername,
    } = parsed.data;

    const [creator] = await db
      .insert(creators)
      .values({
        userId,
        tenantId,
        name,
        avatarUrl: avatarUrl || null,
        tiktokUsername: stripAt(tiktokUsername),
        youtubeChannelId: youtubeChannelId || null,
        instagramUsername: stripAt(instagramUsername),
        pinterestUsername: pinterestUsername || null,
      })
      .returning();

    return NextResponse.json({ creator }, { status: 201 });
  } catch (error) {
    console.error("[settings/creators] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
