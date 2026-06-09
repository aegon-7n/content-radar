"use client";

import { useEffect, useState } from "react";
import type { CreatorInsightsData, InsightPattern } from "@/lib/creator-insights-data";

function pct(freq: [number, number]): string {
  if (freq[1] === 0) return "—";
  return Math.round((freq[0] / freq[1]) * 100) + "%";
}

function deltaColor(delta: number): string {
  if (delta >= 0.35) return "var(--success-text)";
  if (delta >= 0.20) return "var(--warning-text)";
  return "var(--text-muted)";
}

function PatternCard({ pattern, index }: { pattern: InsightPattern; index: number }) {
  const topPct = pct(pattern.freq_top);
  const botPct = pct(pattern.freq_bot);
  const deltaStr = "+" + Math.round(pattern.delta * 100) + "pp";

  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-4"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-default)",
      }}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div
          className="flex items-center justify-center w-7 h-7 rounded-lg shrink-0 text-xs font-bold"
          style={{ background: "var(--accent-muted)", color: "var(--accent-primary)" }}
        >
          {index + 1}
        </div>
        <h2 className="text-sm font-semibold leading-snug pt-0.5" style={{ color: "var(--text-primary)" }}>
          {pattern.title}
        </h2>
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
          style={{ background: "var(--success-bg)", border: "1px solid var(--success-border)", color: "var(--success-text)" }}
        >
          <span className="font-mono">↑ {topPct}</span>
          <span className="opacity-60">top {pattern.freq_top[0]}/{pattern.freq_top[1]}</span>
        </div>

        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
          style={{ background: "var(--error-bg)", border: "1px solid var(--error-border)", color: "var(--error-text)" }}
        >
          <span className="font-mono">↓ {botPct}</span>
          <span className="opacity-60">bot {pattern.freq_bot[0]}/{pattern.freq_bot[1]}</span>
        </div>

        <div
          className="px-2.5 py-1 rounded-full text-xs font-mono font-bold"
          style={{
            background: "var(--bg-muted)",
            color: deltaColor(pattern.delta),
          }}
        >
          Δ {deltaStr}
        </div>
      </div>

      {/* Actionable */}
      <div
        className="rounded-lg px-4 py-3 text-sm leading-relaxed"
        style={{ background: "var(--accent-muted)", color: "var(--text-secondary)" }}
      >
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--accent-primary)" }}>
          Что делать
        </span>
        <p className="mt-1">{pattern.actionable}</p>
      </div>

      {/* Inverted pair */}
      {pattern.inverted && (
        <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
          <span className="font-medium" style={{ color: "var(--text-disabled)" }}>Инверсия: </span>
          {pattern.inverted}
        </p>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

export default function PatternsPage() {
  const [data, setData] = useState<CreatorInsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    fetch("/api/dashboard/creator-insights")
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d: CreatorInsightsData & { state?: string }) => {
        if (d.state === "unavailable") {
          setUnavailable(true);
        } else {
          setData(d);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 md:gap-6 max-w-3xl">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
          AI-разбор топ-роликов
        </h1>
        {data && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {data.creator_name} · {formatDate(data.window.from)} – {formatDate(data.window.to)} ·{" "}
            {data.sample.parse_ok} роликов разобрано
            {data.sample.parse_failed > 0 && ` · ${data.sample.parse_failed} пропущено`}
          </p>
        )}
      </div>

      {/* Data note banner */}
      {data?.data_note && (
        <div
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs"
          style={{
            background: "var(--warning-bg)",
            border: "1px solid var(--warning-border)",
            color: "var(--warning-text)",
          }}
        >
          <span>⚠</span>
          <span>{data.data_note}</span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-xl h-44 animate-pulse"
              style={{ background: "var(--bg-muted)" }}
            />
          ))}
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div
          className="rounded-xl px-5 py-8 text-center text-sm"
          style={{ background: "var(--surface-1)", border: "1px solid var(--border-default)", color: "var(--text-muted)" }}
        >
          Не удалось загрузить данные
        </div>
      )}

      {/* Unavailable */}
      {unavailable && !loading && (
        <div
          className="rounded-xl px-5 py-10 text-center flex flex-col gap-2"
          style={{ background: "var(--surface-1)", border: "1px solid var(--border-default)" }}
        >
          <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            AI-разбор пока не настроен
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Раздел появится, когда накопится достаточно данных по вашим роликам.
          </p>
        </div>
      )}

      {/* Cards */}
      {!loading && !error && data && (
        <div className="flex flex-col gap-4">
          {data.patterns.map((p, i) => (
            <PatternCard key={p.id} pattern={p} index={i} />
          ))}
        </div>
      )}

      {/* Footer */}
      {data && !loading && (
        <p className="text-xs" style={{ color: "var(--text-disabled)" }}>
          Выборка: top-{data.sample.top_n} vs bot-{data.sample.bot_n} · {data.creator_name} · окно{" "}
          {formatDate(data.window.from)}→{formatDate(data.window.to)}
        </p>
      )}
    </div>
  );
}
