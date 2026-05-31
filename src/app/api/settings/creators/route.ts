import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { creators, videos } from "@/db/schema";
import { eq, count, and, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireAuthWithTenant } from "@/lib/tenant";
import { resolveYouTubeChannelId, YouTubeResolveError } from "@/lib/youtube";

function stripAt(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim().replace(/^@+/, "").trim();
  return t.length ? t : null;
}


// Accept null/undefined/empty/string. Frontend often sends nulls for empty fields;
// Zod's union default error message ("Invalid input") is unhelpful, so we keep
// the schema permissive at type level and validate format via .refine for YT.
const optionalHandle = z.string().nullable().optional().or(z.literal(""));

const createCreatorSchema = z.object({
  name: z.string().min(1, "Имя обязательно"),
  avatarUrl: z
    .string()
    .nullable()
    .optional()
    .or(z.literal(""))
    .refine(
      (v) => !v || /^https?:\/\//.test(v),
      { message: "Некорректный URL аватара" },
    ),
  tiktokUsername: z.string().nullable().optional().or(z.literal("")).refine(
    (v) => !v || /^[A-Za-z0-9_.]+$/.test(v.replace(/^@/, "")),
    { message: "TikTok @username должен быть на латинице" },
  ),
  // Accept @handle, full URL, or raw UC-ID — actual format check happens
  // in resolveYouTubeChannelId at runtime, which also turns it into UC...
  youtubeChannelId: optionalHandle,
  instagramUsername: optionalHandle,
  pinterestUsername: optionalHandle,
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
      .where(and(eq(creators.tenantId, tenantId), isNull(creators.archivedAt)))
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

    let resolvedYoutubeChannelId: string | null = null;
    if (youtubeChannelId && youtubeChannelId.trim()) {
      try {
        resolvedYoutubeChannelId = await resolveYouTubeChannelId(youtubeChannelId);
      } catch (err) {
        const message =
          err instanceof YouTubeResolveError
            ? err.message
            : "Не удалось распознать YouTube канал";
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

    const [creator] = await db
      .insert(creators)
      .values({
        userId,
        tenantId,
        name,
        avatarUrl: avatarUrl || null,
        tiktokUsername: stripAt(tiktokUsername),
        youtubeChannelId: resolvedYoutubeChannelId,
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
