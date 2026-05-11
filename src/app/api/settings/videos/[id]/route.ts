import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { videos, videoMetrics } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const denied = await requireAuth(request);
  if (denied) return denied;

  try {
    const { id } = params;

    const existing = await db
      .select({ id: videos.id })
      .from(videos)
      .where(eq(videos.id, id))
      .limit(1);

    if (!existing.length) {
      return NextResponse.json({ error: "Ролик не найден" }, { status: 404 });
    }

    // Explicitly delete metrics first (in case no CASCADE is set on FK)
    await db.delete(videoMetrics).where(eq(videoMetrics.videoId, id));

    // Delete the video itself
    await db.delete(videos).where(eq(videos.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[settings/videos/[id]] DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
