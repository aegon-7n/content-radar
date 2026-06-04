// TRU-344 one-time seed — remove after first successful call
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tenantInsights, videos } from "@/db/schema";
import { desc, count, eq } from "drizzle-orm";

const SEED_KEY = "tru344-seed-2026-06-03-8x7qp";

const PATTERNS = {
  patterns: [
    {
      distinguishing_signal:
        "TOP-видео используют нарратив «проблема → решение» или «сравнение» — MIDDLE опираются на сторителлинг и демо без чёткой проблемы",
      evidence:
        "54% TOP-видео (7/13) используют problem_solution или comparison против 17% MIDDLE (2/12). 92% MIDDLE — storytelling/demo/before_after без проблемы против 46% TOP.",
      actionable:
        "Перед съёмкой зафиксируйте: какую боль решает ролик или что он сравнивает. Стройте сценарий вокруг «Проблема → Решение» или «Продукт A vs B» — не просто показ товара.",
      confidence: "sharp",
    },
    {
      distinguishing_signal:
        "TOP-видео откладывают первое появление продукта за первую секунду — MIDDLE показывают его мгновенно",
      evidence:
        "46% TOP (6/13) показывают продукт после 1-й секунды против 8% MIDDLE (1/12). 83% MIDDLE демонстрируют продукт ≤1 сек против 54% TOP.",
      actionable:
        "Используйте первую секунду для хука или постановки проблемы. Продукт должен появиться как решение, а не открытие ролика.",
      confidence: "sharp",
    },
    {
      distinguishing_signal:
        "TOP-видео используют текст на экране как лейблы (характеристики, проблемы) — MIDDLE только как хук",
      evidence:
        "38% TOP (5/13) используют текст исключительно как labeling без хука против 0% MIDDLE. 100% MIDDLE — текст только как hook.",
      actionable:
        "Добавьте текстовые лейблы: называйте проблему, решение или характеристику продукта прямо в кадре. Не ограничивайте текст только кликбейтными хуками.",
      confidence: "medium",
    },
  ],
};

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (body.seed_key !== SEED_KEY) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const rows = await db
    .select({ tenantId: videos.tenantId, cnt: count() })
    .from(videos)
    .groupBy(videos.tenantId)
    .orderBy(desc(count()))
    .limit(1);

  if (!rows.length) {
    return NextResponse.json({ error: "no tenants with videos" }, { status: 404 });
  }

  const { tenantId } = rows[0];

  const existing = await db
    .select({ id: tenantInsights.id })
    .from(tenantInsights)
    .where(eq(tenantInsights.tenantId, tenantId))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json({
      ok: true,
      message: "already seeded",
      tenantId,
      existingRows: existing.length,
    });
  }

  await db.insert(tenantInsights).values({
    tenantId,
    computedAt: new Date("2026-06-03T04:00:00Z"),
    periodStart: "2026-05-27",
    periodEnd: "2026-06-02",
    patterns: PATTERNS,
    videoCountUsed: 25,
    geminiCostUsd: "0.063000",
  });

  return NextResponse.json({ ok: true, tenantId, seeded: true, videoCountUsed: 25 });
}
