import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { creators, users, videos } from "@/db/schema";
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

const createCreatorSchema = z.object({
  name: z.string().min(1, "Имя обязательно"),
  avatarUrl: z.string().url("Некорректный URL аватара").optional().or(z.literal("")),
  tiktokUsername: z.string().optional().or(z.literal("")),
  youtubeChannelId: z.string().optional().or(z.literal("")),
  instagramUsername: z.string().optional().or(z.literal("")),
  likeeUsername: z.string().optional().or(z.literal("")),
  likeeUid: z.string().optional().or(z.literal("")),
  pinterestUsername: z.string().optional().or(z.literal("")),
});

export async function GET() {
  try {
    const result = await db
      .select({
        id: creators.id,
        name: creators.name,
        avatarUrl: creators.avatarUrl,
        tiktokUsername: creators.tiktokUsername,
        youtubeChannelId: creators.youtubeChannelId,
        instagramUsername: creators.instagramUsername,
        likeeUsername: creators.likeeUsername,
        likeeUid: creators.likeeUid,
        pinterestUsername: creators.pinterestUsername,
        createdAt: creators.createdAt,
        videoCount: count(videos.id),
      })
      .from(creators)
      .leftJoin(videos, eq(videos.creatorId, creators.id))
      .groupBy(
        creators.id,
        creators.name,
        creators.avatarUrl,
        creators.tiktokUsername,
        creators.youtubeChannelId,
        creators.instagramUsername,
        creators.likeeUsername,
        creators.likeeUid,
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
  try {
    const body = await request.json();
    const parsed = createCreatorSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ошибка валидации", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const userId = await getDefaultUserId();
    const {
      name,
      avatarUrl,
      tiktokUsername,
      youtubeChannelId,
      instagramUsername,
      likeeUsername,
      likeeUid,
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
        likeeUsername: likeeUsername || null,
        likeeUid: likeeUid || null,
        pinterestUsername: pinterestUsername || null,
      })
      .returning();

    return NextResponse.json({ creator }, { status: 201 });
  } catch (error) {
    console.error("[settings/creators] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
