-- TRU-344: Seed R&D pattern data (one-time, idempotent).
-- Inserts weekly analysis results for the tenant with the most videos,
-- only if that tenant has no existing tenant_insights row.
INSERT INTO tenant_insights (
  id,
  tenant_id,
  computed_at,
  period_start,
  period_end,
  patterns,
  video_count_used,
  gemini_cost_usd
)
SELECT
  gen_random_uuid(),
  v.tenant_id,
  '2026-06-03T04:00:00Z'::timestamptz,
  '2026-05-27',
  '2026-06-02',
  $json${
    "patterns": [
      {
        "distinguishing_signal": "TOP-видео используют нарратив «проблема → решение» или «сравнение» — MIDDLE опираются на сторителлинг и демо без чёткой проблемы",
        "evidence": "54% TOP-видео (7/13) используют problem_solution или comparison против 17% MIDDLE (2/12). 92% MIDDLE — storytelling/demo/before_after без проблемы против 46% TOP.",
        "actionable": "Перед съёмкой зафиксируйте: какую боль решает ролик или что он сравнивает. Стройте сценарий вокруг «Проблема → Решение» или «Продукт A vs B» — не просто показ товара.",
        "confidence": "sharp"
      },
      {
        "distinguishing_signal": "TOP-видео откладывают первое появление продукта за первую секунду — MIDDLE показывают его мгновенно",
        "evidence": "46% TOP (6/13) показывают продукт после 1-й секунды против 8% MIDDLE (1/12). 83% MIDDLE демонстрируют продукт ≤1 сек против 54% TOP.",
        "actionable": "Используйте первую секунду для хука или постановки проблемы. Продукт должен появиться как решение, а не открытие ролика.",
        "confidence": "sharp"
      },
      {
        "distinguishing_signal": "TOP-видео используют текст на экране как лейблы (характеристики, проблемы) — MIDDLE только как хук",
        "evidence": "38% TOP (5/13) используют текст исключительно как labeling без хука против 0% MIDDLE. 100% MIDDLE — текст только как hook.",
        "actionable": "Добавьте текстовые лейблы: называйте проблему, решение или характеристику продукта прямо в кадре. Не ограничивайте текст только кликбейтными хуками.",
        "confidence": "medium"
      }
    ]
  }$json$::jsonb,
  25,
  0.063000
FROM (
  SELECT tenant_id, COUNT(*) AS cnt
  FROM videos
  GROUP BY tenant_id
  ORDER BY cnt DESC
  LIMIT 1
) v
WHERE NOT EXISTS (
  SELECT 1 FROM tenant_insights ti WHERE ti.tenant_id = v.tenant_id
);
