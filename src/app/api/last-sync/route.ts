import { NextResponse } from "next/server";
import { db } from "@/db";
import { videoMetrics } from "@/db/schema";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    const result = await db.execute(
      sql`SELECT MAX(scraped_at) AS last_sync FROM video_metrics`
    );
    const row = result[0] as { last_sync: string | null };
    return NextResponse.json({ lastSync: row?.last_sync ?? null });
  } catch {
    return NextResponse.json({ lastSync: null });
  }
}
