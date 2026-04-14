"use client";

import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Eye, Film, TrendingUp, LayoutGrid } from "lucide-react";
import StatCard from "@/components/ui/StatCard";
import PlatformBadge from "@/components/ui/PlatformBadge";
import PeriodSelector, { Period, getPeriodDates } from "@/components/ui/PeriodSelector";
import { StatCardSkeleton, ChartSkeleton } from "@/components/ui/SkeletonCard";
import { formatViews, formatDate, formatDateShort, getPlatformColor, getPlatformLabel } from "@/lib/format";
import { MOCK_DASHBOARD, type DashboardData, type Platform } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const tooltipStyle = {
  backgroundColor: "var(--surface-1)",
  border: "1px solid var(--border-default)",
  borderRadius: "8px",
  color: "var(--text-primary)",
  fontSize: "12px",
};

export default function DashboardPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const { from, to } = getPeriodDates(period, customFrom, customTo);
    const params = new URLSearchParams({ from, to });
    if (selectedCategory) params.set("category", selectedCategory);

    fetch(`/api/dashboard?${params}`)
      .then((r) => r.json())
      .then((d) => {
        d.dailyViews = d.byDay ?? [];
        setData(d);
        if (d.categories?.length > 0) {
          setAllCategories(d.categories);
        }
      })
      .catch(() => setData(MOCK_DASHBOARD))
      .finally(() => setLoading(false));
  }, [period, customFrom, customTo, selectedCategory]);

  const d = data ?? MOCK_DASHBOARD;

  const donutData = [...(d.byPlatform ?? [])]
    .filter((p) => p.views > 0)
    .sort((a, b) => b.views - a.views)
    .map((p) => ({
      name: getPlatformLabel(p.platform as Platform),
      value: p.views,
      platform: p.platform,
      color: getPlatformColor(p.platform as Platform),
    }));

  const totalDonut = donutData.reduce((s, p) => s + p.value, 0);

  return (
    <div className="p-6 flex flex-col gap-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Дашборд
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            Прирост просмотров всех ваших роликов за выбранный период
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Category filter chips */}
          {allCategories.length > 0 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSelectedCategory(null)}
                className="px-2.5 py-1 rounded-lg text-xs transition-colors"
                style={{
                  background: selectedCategory === null ? "var(--surface-3)" : "transparent",
                  color: selectedCategory === null ? "var(--text-primary)" : "var(--text-muted)",
                }}
              >
                Все
              </button>
              {allCategories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
                  className="px-2.5 py-1 rounded-lg text-xs transition-colors"
                  style={{
                    background: selectedCategory === cat ? "var(--accent-primary)" : "var(--bg-muted)",
                    color: selectedCategory === cat ? "var(--text-inverse)" : "var(--text-muted)",
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
          <PeriodSelector
            value={period}
            onChange={setPeriod}
            customFrom={customFrom}
            customTo={customTo}
            onCustomChange={(f, t) => { setCustomFrom(f); setCustomTo(t); }}
          />
        </div>
      </div>

      {/* Stat cards */}
      {loading ? (
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            title="Прирост просмотров"
            value={formatViews(d.totalViews)}
            change={d.viewsChange}
            icon={<Eye className="w-4 h-4" style={{ color: "var(--accent-primary)" }} />}
            subtitle={`за ${d.period?.days ?? 30} дн.`}
            help="Сколько новых просмотров набрали все ваши ролики за выбранный период — от первого до последнего дня."
          />
          <StatCard
            title="Новых роликов"
            value={d.newVideos}
            change={d.newVideosChange}
            icon={<Film className="w-4 h-4" style={{ color: "#7C3AED" }} />}
            subtitle="опубликовано в периоде"
            mono={false}
            help="Сколько роликов креаторы выпустили в этот период (по дате публикации на платформе)."
          />
          <StatCard
            title="Среднее на ролик"
            value={formatViews(d.avgPerVideo)}
            icon={<TrendingUp className="w-4 h-4" style={{ color: "#059669" }} />}
            subtitle={`на один из ${d.activeVideos} активных`}
            help="Прирост просмотров, делённый на количество роликов у которых вообще был рост в этом периоде."
          />
          <StatCard
            title="Активных платформ"
            value={d.activePlatforms}
            icon={<LayoutGrid className="w-4 h-4" style={{ color: "#D97706" }} />}
            subtitle="из 5 доступных"
            mono={false}
            help="Сколько платформ из TikTok/YouTube/Instagram/Likee/Pinterest принесли хотя бы один новый просмотр."
          />
        </div>
      )}

      {/* Line chart */}
      {loading ? (
        <ChartSkeleton height={320} />
      ) : (
        <div
          className="rounded-xl p-5"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
          }}
        >
          <h2 className="text-sm font-medium mb-5" style={{ color: "var(--text-primary)" }}>
            Прирост просмотров по дням
          </h2>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={d.dailyViews} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDateShort}
                tick={{ fill: "var(--text-disabled)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={formatViews}
                tick={{ fill: "var(--text-disabled)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(v) => formatDate(v as string)}
                formatter={(v) => [formatViews(Number(v)), "Прирост"]}
                cursor={{ stroke: "var(--border-default)" }}
              />
              <Line
                type="monotone"
                dataKey="views"
                stroke="var(--accent-primary)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "var(--accent-primary)", strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Bottom two-column row */}
      {!loading && (
        <div className="grid grid-cols-2 gap-4">
          {/* Platform donut chart */}
          <div
            className="rounded-xl p-5"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-default)",
            }}
          >
            <h2 className="text-sm font-medium mb-4" style={{ color: "var(--text-primary)" }}>
              По платформам
            </h2>
            {donutData.length === 0 ? (
              <div
                className="flex items-center justify-center h-[200px] text-sm"
                style={{ color: "var(--text-muted)" }}
              >
                Нет данных
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="shrink-0" style={{ width: 200, height: 200, overflow: "visible" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                      <Pie
                        data={donutData}
                        cx="50%"
                        cy="50%"
                        innerRadius={52}
                        outerRadius={78}
                        paddingAngle={3}
                        dataKey="value"
                        strokeWidth={0}
                        label={false}
                      >
                        {donutData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(value, name) => [formatViews(Number(value)), name as string]}
                        wrapperStyle={{ overflow: "visible", zIndex: 50 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 flex flex-col gap-2.5">
                  {donutData.map((p) => (
                    <div key={p.platform} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                      <span className="text-xs flex-1" style={{ color: "var(--text-muted)" }}>
                        {p.name}
                      </span>
                      <span className="font-mono text-xs" style={{ color: "var(--text-primary)" }}>
                        {formatViews(p.value)}
                      </span>
                      <span className="font-mono text-[11px] w-8 text-right" style={{ color: "var(--text-disabled)" }}>
                        {totalDonut > 0 ? `${Math.round((p.value / totalDonut) * 100)}%` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Top 5 videos */}
          <div
            className="rounded-xl p-5"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-default)",
            }}
          >
            <h2 className="text-sm font-medium mb-4" style={{ color: "var(--text-primary)" }}>
              Топ-5 роликов
            </h2>
            <div className="flex flex-col">
              {d.topVideos.slice(0, 5).map((v, i) => (
                <div
                  key={v.id}
                  className="flex items-center gap-3 py-2.5 last:border-0"
                  style={{ borderBottom: "1px solid var(--border-subtle)" }}
                >
                  <span className="text-xs font-mono w-4 shrink-0" style={{ color: "var(--text-disabled)" }}>
                    {i + 1}
                  </span>
                  <PlatformBadge platform={v.platform as Platform} size="sm" />
                  <div className="flex-1 min-w-0">
                    <a
                      href={v.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs transition-colors truncate block"
                      style={{ color: "var(--text-muted)" }}
                      title={v.url}
                    >
                      {v.url.replace(/^https?:\/\//, "").slice(0, 36)}…
                    </a>
                    <span className="text-[10px]" style={{ color: "var(--text-disabled)" }}>
                      {v.creatorName}
                    </span>
                  </div>
                  <span className="font-mono text-xs shrink-0" style={{ color: "var(--text-primary)" }}>
                    {formatViews(v.views)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
