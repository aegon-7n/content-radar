import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { creators, videos } from "@/db/schema";
import { eq, count, and } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";

const createCreatorSchema = z.object({
  name: z.string().min(1, "Имя обязательно"),
  avatarUrl: z.string().url("Некорректный URL аватара").optional().or(z.literal("")),
  tiktokUsername: z.string().optional().or(z.literal("")),
  youtubeChannelId: z.string().optional().or(z.literal("")),
  instagramUsername: z.string().optional().or(z.literal("")),
  pinterestUsername: z.string().optional().or(z.literal("")),
});

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

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
      .leftJoin(videos, eq(videos.creatorId, creators.id))
      .where(eq(creators.userId, userId))
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
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  try {
    const body = await request.json();
    const parsed = createCreatorSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ошибка валидации", details: parsed.error.issues },
        { status: 400 },
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
        name,
        avatarUrl: avatarUrl || null,
        tiktokUsername: tiktokUsername || null,
        youtubeChannelId: youtubeChannelId || null,
        instagramUsername: instagramUsername || null,
        pinterestUsername: pinterestUsername || null,
      })
      .returning();

    return NextResponse.json({ creator }, { status: 201 });
  } catch (error) {
    console.error("[settings/creators] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
