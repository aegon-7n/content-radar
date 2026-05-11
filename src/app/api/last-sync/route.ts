import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  try {
    const result = await db.execute(
      sql`SELECT MAX(vm.scraped_at) AS last_sync FROM video_metrics vm INNER JOIN videos v ON v.id = vm.video_id WHERE v.user_id = ${userId}`,
    );
    const row = result[0] as { last_sync: string | null };
    return NextResponse.json({ lastSync: row?.last_sync ?? null });
  } catch {
    return NextResponse.json({ lastSync: null });
  }
}
