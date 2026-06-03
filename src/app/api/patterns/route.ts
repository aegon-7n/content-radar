import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithTenant } from "@/lib/tenant";
import { db } from "@/db";
import { tenantInsights, videos } from "@/db/schema";
import { eq, desc, count } from "drizzle-orm";
import type { InsightPattern } from "@/db/schema";

const COLD_START_THRESHOLD = 10;
const FRESH_DAYS = 8;

export async function GET(request: NextRequest) {
  const auth = await requireAuthWithTenant(request);
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.ctx;

  const [{ value: videoCount }] = await db
    .select({ value: count() })
    .from(videos)
    .where(eq(videos.tenantId, tenantId));

  const total = Number(videoCount ?? 0);

  if (total < COLD_START_THRESHOLD) {
    return NextResponse.json({
      state: "cold_start",
      videos_this_week: total,
      threshold: COLD_START_THRESHOLD,
    });
  }

  const [insight] = await db
    .select()
    .from(tenantInsights)
    .where(eq(tenantInsights.tenantId, tenantId))
    .orderBy(desc(tenantInsights.computedAt))
    .limit(1);

  if (!insight) {
    return NextResponse.json({
      state: "cold_start",
      videos_this_week: total,
      threshold: COLD_START_THRESHOLD,
    });
  }

  const ageMs = Date.now() - new Date(insight.computedAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  const rawPatterns = insight.patterns as { patterns: InsightPattern[] };
  const patterns = (rawPatterns?.patterns ?? []).slice(0, 3);

  if (patterns.length === 0) {
    return NextResponse.json({ state: "insufficient", videos_analyzed: insight.videoCountUsed });
  }

  const nextMonday = getNextMonday();

  if (ageDays <= FRESH_DAYS) {
    return NextResponse.json({
      state: "loaded",
      patterns,
      period_label: formatPeriodLabel(insight.periodStart, insight.periodEnd),
      updated_at: insight.computedAt,
      videos_analyzed: insight.videoCountUsed,
      next_update: nextMonday,
    });
  }

  return NextResponse.json({
    state: "partial",
    stale_patterns: patterns,
    stale_period_label: formatPeriodLabel(insight.periodStart, insight.periodEnd),
    next_update: nextMonday,
  });
}

function formatPeriodLabel(start: string, end: string): string {
  const months = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  const s = new Date(start);
  const e = new Date(end);
  return `${s.getDate()} ${months[s.getMonth()]} – ${e.getDate()} ${months[e.getMonth()]}`;
}

function getNextMonday(): string {
  const now = new Date();
  const day = now.getDay();
  const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7 || 7;
  const next = new Date(now);
  next.setDate(now.getDate() + daysUntilMonday);
  return next.toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) + " 07:00 МСК";
}
