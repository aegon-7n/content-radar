import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { requireAuthWithTenant } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  const auth = await requireAuthWithTenant(request);
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.ctx;

  try {
    const result = await db.execute(
      sql`SELECT MAX(vm.scraped_at) AS last_sync
FROM video_metrics vm
INNER JOIN videos v ON v.id = vm.video_id
WHERE v.tenant_id = ${tenantId}`
    );
    const row = result[0] as { last_sync: string | null };
    return NextResponse.json({ lastSync: row?.last_sync ?? null });
  } catch {
    return NextResponse.json({ lastSync: null });
  }
}
