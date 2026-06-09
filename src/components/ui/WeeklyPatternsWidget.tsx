"use client";

import { useEffect, useState } from "react";
import { ChartSkeleton } from "@/components/ui/SkeletonCard";

type Pattern = {
  distinguishing_signal: string;
  evidence: string;
  actionable: string;
  confidence: "sharp" | "medium";
};

type MetricObservation = {
  label: string;
  value: string;
  detail?: string;
};

type PatternResponse =
  | { state: "empty" }
  | { state: "cold_start"; videos_this_week: number; threshold: number }
  | { state: "insufficient"; videos_analyzed: number }
  | { state: "metric_insights"; observations: MetricObservation[]; videos_analyzed: number }
  | { state: "partial"; stale_patterns: Pattern[]; stale_period_label: string; next_update: string }
  | { state: "loaded"; patterns: Pattern[]; period_label: string; updated_at: string; videos_analyzed: number; next_update: string };

function PatternCard({ pattern }: { pattern: Pattern }) {
  return (
    <div
      className="flex flex-col gap-2 p-4 rounded-lg flex-1 min-w-[240px]"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug" style={{ color: "var(--text-primary)" }}>
          {pattern.distinguishing_signal}
        </p>
        <span
          className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
          style={
            pattern.confidence === "sharp"
              ? { background: "var(--accent-muted)", color: "var(--accent-primary)" }
              : { background: "var(--bg-muted)", color: "var(--text-muted)" }
          }
        >
          {pattern.confidence === "sharp" ? "чётко" : "есть намёк"}
        </span>
      </div>
      <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
        {pattern.evidence}
      </p>
      <p className="text-xs" style={{ color: "var(--accent-primary)" }}>
        → {pattern.actionable}
      </p>
    </div>
  );
}

export default function WeeklyPatternsWidget() {
  const [data, setData] = useState<PatternResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/patterns")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <ChartSkeleton height={140} />;
  if (!data || data.state === "empty") return null;

  const patterns =
    data.state === "loaded"
      ? data.patterns
      : data.state === "partial"
      ? data.stale_patterns
      : null;

  const nextUpdate =
    data.state === "loaded" || data.state === "partial" ? data.next_update : null;

  const meta =
    data.state === "loaded"
      ? `${data.videos_analyzed} роликов · ${data.period_label}`
      : data.state === "partial"
      ? `Данные за ${data.stale_period_label}`
      : null;

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: "var(--surface-1)", border: "1px solid var(--border-default)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {data.state === "metric_insights" ? "Факты о вашем контенте" : "Паттерны топа недели"}
          </span>
          {meta && (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {meta}
            </span>
          )}
        </div>
        {nextUpdate && (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            Обновление: {nextUpdate}
          </span>
        )}
      </div>

      {data.state === "partial" && (
        <div
          className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg mb-4"
          style={{ background: "var(--bg-muted)", color: "var(--text-secondary)" }}
        >
          <span>⚠</span>
          <span>Данные прошлой недели — анализ этой недели ещё не готов</span>
        </div>
      )}

      {data.state === "cold_start" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Нужно больше роликов за неделю, чтобы выявить паттерны
          </p>
          <div className="flex items-center gap-3">
            <div
              className="flex-1 h-2 rounded-full overflow-hidden"
              style={{ background: "var(--bg-muted)" }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  background: "var(--accent-primary)",
                  width: `${Math.min((data.videos_this_week / data.threshold) * 100, 100)}%`,
                  transition: "width 0.4s ease",
                }}
              />
            </div>
            <span className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>
              {data.videos_this_week} / {data.threshold}
            </span>
          </div>
        </div>
      )}

      {data.state === "insufficient" && (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Ролики этой недели показали схожий результат — чётких паттернов не выявлено
        </p>
      )}

      {data.state === "metric_insights" && data.observations.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {data.observations.map((obs, i) => (
            <div
              key={i}
              className="flex flex-col gap-1 p-4 rounded-lg flex-1 min-w-[220px]"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)" }}
            >
              <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                {obs.label}
              </p>
              <p className="text-base font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>
                {obs.value}
              </p>
              {obs.detail && (
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {obs.detail}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {patterns && patterns.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {patterns.map((p, i) => (
            <PatternCard key={i} pattern={p} />
          ))}
        </div>
      )}
    </div>
  );
}
