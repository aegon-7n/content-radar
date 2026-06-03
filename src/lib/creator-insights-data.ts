// v2 mock data (top-15 vs mid-15 Тима, 60 дней, 2026-04-03→06-03)
// Will be replaced with bottom-15 re-run JSON from TRU-361 (Krab pipeline)

export type InsightPattern = {
  id: string;
  title: string;
  freq_top: [number, number]; // [count, total]
  freq_bot: [number, number];
  delta: number;
  actionable: string;
  inverted?: string;
};

export type CreatorInsightsData = {
  creator_id: string;
  creator_name: string;
  window: { from: string; to: string };
  sample: { top_n: number; bot_n: number; parse_ok: number; parse_failed: number };
  data_note?: string; // shown in UI when using preliminary data
  patterns: InsightPattern[];
};

// v2 data: top-15 vs mid-15. Will swap for top-15 vs bottom-15 when TRU-361 delivers.
const CREATOR_INSIGHTS_V2: CreatorInsightsData = {
  creator_id: "tima",
  creator_name: "Тима",
  window: { from: "2026-04-03", to: "2026-06-03" },
  sample: { top_n: 15, bot_n: 15, parse_ok: 25, parse_failed: 5 },
  data_note: "Данные v2: top-15 vs mid-15. Обновление на bottom-15 ожидается.",
  patterns: [
    {
      id: "p1",
      title: "Структура: проблема→решение / сравнение",
      freq_top: [7, 13],
      freq_bot: [2, 12],
      delta: 0.37,
      actionable:
        "В первую секунду сформулировать проблему или competitor-frame, далее — продукт как решение. Не «вот товар который я купил», а «вот проблема → вот решение».",
      inverted:
        "В bottom — 92% storytelling/demo/before_after vs 46% в top.",
    },
    {
      id: "p2",
      title: "Задержка появления продукта в кадре",
      freq_top: [6, 13],
      freq_bot: [1, 12],
      delta: 0.38,
      actionable:
        "Первая секунда = текст или действие БЕЗ товара, продукт появляется на 2–3 сек как продуманное появление. Если зритель сразу видит товар — он уходит.",
      inverted:
        "В bottom — 83% показывают продукт в первую секунду vs 54% в top.",
    },
    {
      id: "p3",
      title: "On-screen text как label/контекст, а не только hook",
      freq_top: [5, 13],
      freq_bot: [0, 12],
      delta: 0.38,
      actionable:
        "Использовать текст не только для стартового hook'а, но и для labeling — обозначения проблем, характеристик, competitor-сравнений. Шаблон «обычный X 🤢» работает как label-frame.",
      inverted:
        "В bottom — 100% (12/12) используют текст исключительно как hook, 0% имеют label-only текст.",
    },
  ],
};

export function getCreatorInsights(creatorId: string): CreatorInsightsData | null {
  if (creatorId === "tima") return CREATOR_INSIGHTS_V2;
  return null;
}

export function getDefaultCreatorInsights(): CreatorInsightsData {
  return CREATOR_INSIGHTS_V2;
}
