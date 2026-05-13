import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { videos, videoMetrics } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuthWithTenant } from "@/lib/tenant";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuthWithTenant(request);
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.ctx;

  try {
    const { id } = params;

    const existing = await db
      .select({ id: videos.id })
      .from(videos)
      .where(and(eq(videos.id, id), eq(videos.tenantId, tenantId)))
      .limit(1);

    if (!existing.length) {
      return NextResponse.json({ error: "Ролик не найден" }, { status: 404 });
    }

    await db.delete(videoMetrics).where(eq(videoMetrics.videoId, id));

    await db.delete(videos).where(and(eq(videos.id, id), eq(videos.tenantId, tenantId)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[settings/videos/[id]] DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
