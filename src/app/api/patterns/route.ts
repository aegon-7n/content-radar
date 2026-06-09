import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithTenant } from "@/lib/tenant";
import { db } from "@/db";
import { tenantInsights, videos } from "@/db/schema";
import { eq, desc, count, sql } from "drizzle-orm";
import type { InsightPattern } from "@/db/schema";

const COLD_START_THRESHOLD = 10;
const FRESH_DAYS = 8;

const PLATFORM_LABELS: Record<string, string> = {
  tiktok: "TikTok",
  youtube: "YouTube",
  instagram: "Instagram Reels",
  likee: "Likee",
  pinterest: "Pinterest",
};

export type MetricObservation = {
  label: string;
  value: string;
  detail?: string;
};

async function computeMetricInsights(tenantId: string): Promise<MetricObservation[]> {
  const rows = await db.execute(sql`
    WITH latest AS (
      SELECT DISTINCT ON (video_id) video_id, views
      FROM video_metrics ORDER BY video_id, scraped_at DESC
    ),
    platform_stats AS (
      SELECT
        v.platform,
        COUNT(DISTINCT v.id) AS video_count,
        AVG(l.views)::bigint AS avg_views,
        MAX(l.views) AS max_views
      FROM videos v
      JOIN latest l ON l.video_id = v.id
      WHERE v.tenant_id = ${tenantId}
        AND v.fail_streak < 3
        AND l.views > 0
      GROUP BY v.platform
      ORDER BY avg_views DESC
    ),
    creator_stats AS (
      SELECT
        c.name AS creator_name,
        COUNT(DISTINCT v.id) AS video_count,
        AVG(l.views)::bigint AS avg_views,
        MAX(l.views) AS max_views
      FROM videos v
      JOIN creators c ON c.id = v.creator_id
      JOIN latest l ON l.video_id = v.id
      WHERE v.tenant_id = ${tenantId}
        AND v.fail_streak < 3
        AND l.views > 0
      GROUP BY c.name
      ORDER BY avg_views DESC
    )
    SELECT
      (SELECT jsonb_agg(row_to_json(p)) FROM platform_stats p) AS platforms,
      (SELECT jsonb_agg(row_to_json(c)) FROM creator_stats c) AS creators
  `);

  const result = rows[0] as {
    platforms: Array<{ platform: string; video_count: number; avg_views: number; max_views: number }> | null;
    creators: Array<{ creator_name: string; video_count: number; avg_views: number; max_views: number }> | null;
  };

  const observations: MetricObservation[] = [];

  const platforms = result?.platforms ?? [];
  if (platforms.length >= 2) {
    const best = platforms[0];
    const second = platforms[1];
    const ratio = second.avg_views > 0 ? Math.round(best.avg_views / second.avg_views) : null;
    if (ratio && ratio >= 2) {
      observations.push({
        label: `${PLATFORM_LABELS[best.platform] ?? best.platform} эффективнее всего`,
        value: `в ${ratio}× больше просмотров в среднем`,
        detail: `чем ${PLATFORM_LABELS[second.platform] ?? second.platform}`,
      });
    } else {
      observations.push({
        label: `Лучшая платформа — ${PLATFORM_LABELS[best.platform] ?? best.platform}`,
        value: formatViews(best.avg_views) + " просм. в среднем",
        detail: `${best.video_count} роликов`,
      });
    }
  } else if (platforms.length === 1) {
    const p = platforms[0];
    observations.push({
      label: `Средний ролик на ${PLATFORM_LABELS[p.platform] ?? p.platform}`,
      value: formatViews(p.avg_views) + " просмотров",
      detail: `рекорд ${formatViews(p.max_views)}`,
    });
  }

  const creators = result?.creators ?? [];
  if (creators.length >= 2) {
    const best = creators[0];
    const second = creators[1];
    const ratio = second.avg_views > 0 ? Math.round(best.avg_views / second.avg_views) : null;
    if (ratio && ratio >= 2) {
      observations.push({
        label: `${best.creator_name} набирает больше всех`,
        value: `в ${ratio}× больше, чем ${second.creator_name}`,
        detail: `${formatViews(best.avg_views)} просм. в среднем`,
      });
    } else {
      observations.push({
        label: `Топ-перформер: ${best.creator_name}`,
        value: formatViews(best.avg_views) + " просм. в среднем",
        detail: `${best.video_count} роликов`,
      });
    }
  }

  return observations;
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

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
    const observations = await computeMetricInsights(tenantId);
    return NextResponse.json({
      state: observations.length > 0 ? "metric_insights" : "insufficient",
      observations,
      videos_analyzed: insight.videoCountUsed,
    });
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
