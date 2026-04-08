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
  Legend,
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
  backgroundColor: "#1a1a1a",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "8px",
  color: "#fff",
  fontSize: "12px",
};

function DonutLabel({
  cx, cy, innerRadius, outerRadius, percent, platform,
}: {
  cx: number; cy: number; innerRadius: number; outerRadius: number;
  percent: number; platform: string;
}) {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const midAngle = 0; // recharts passes midAngle via props
  return null; // labels are in Legend instead
}

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
        d.avgViewsPerVideo = d.totalVideos > 0
          ? Math.round(d.totalViews / d.totalVideos)
          : 0;
        d.activePlatforms = (d.byPlatform ?? []).filter((p: { views: number }) => p.views > 0).length;
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
          <h1 className="text-xl font-semibold text-white">Дашборд</h1>
          <p className="text-xs text-[#555] mt-0.5">Общая статистика контента</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Category filter chips */}
          {allCategories.length > 0 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSelectedCategory(null)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs transition-colors",
                  selectedCategory === null
                    ? "bg-white/[0.10] text-white"
                    : "text-[#555] hover:text-[#888]"
                )}
              >
                Все
              </button>
              {allCategories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs transition-colors",
                    selectedCategory === cat
                      ? "bg-blue-600 text-white"
                      : "bg-white/[0.04] text-[#666] hover:text-[#aaa]"
                  )}
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
            title="Всего просмотров"
            value={formatViews(d.totalViews)}
            change={d.viewsChange}
            icon={<Eye className="w-4 h-4 text-blue-400" />}
          />
          <StatCard
            title="Всего роликов"
            value={d.totalVideos}
            change={d.videosChange}
            icon={<Film className="w-4 h-4 text-violet-400" />}
          />
          <StatCard
            title="Среднее на ролик"
            value={formatViews(d.avgViewsPerVideo)}
            icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}
            subtitle="просмотров на ролик"
          />
          <StatCard
            title="Активных платформ"
            value={d.activePlatforms}
            icon={<LayoutGrid className="w-4 h-4 text-orange-400" />}
            subtitle="из 5 доступных"
            mono={false}
          />
        </div>
      )}

      {/* Line chart */}
      {loading ? (
        <ChartSkeleton height={320} />
      ) : (
        <div className="bg-[#111111] border border-white/[0.06] rounded-xl p-5">
          <h2 className="text-sm font-medium text-white mb-5">Прирост просмотров по дням</h2>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={d.dailyViews} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDateShort}
                tick={{ fill: "#555", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={formatViews}
                tick={{ fill: "#555", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(v) => formatDate(v as string)}
                formatter={(v) => [formatViews(Number(v)), "Прирост"]}
                cursor={{ stroke: "rgba(255,255,255,0.06)" }}
              />
              <Line
                type="monotone"
                dataKey="views"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "#3b82f6", strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Bottom two-column row */}
      {!loading && (
        <div className="grid grid-cols-2 gap-4">
          {/* Platform donut chart */}
          <div className="bg-[#111111] border border-white/[0.06] rounded-xl p-5">
            <h2 className="text-sm font-medium text-white mb-4">По платформам</h2>
            {donutData.length === 0 ? (
              <div className="flex items-center justify-center h-[200px] text-sm text-[#444]">Нет данных</div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={100}
                      paddingAngle={3}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {donutData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(v) => [formatViews(Number(v)), ""]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="w-full flex flex-col gap-2">
                  {donutData.map((p) => (
                    <div key={p.platform} className="flex items-center gap-2.5">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                      <span className="text-xs text-[#777] flex-1">{p.name}</span>
                      <span className="font-mono text-xs text-white">{formatViews(p.value)}</span>
                      <span className="font-mono text-[11px] text-[#444] w-8 text-right">
                        {totalDonut > 0 ? `${Math.round((p.value / totalDonut) * 100)}%` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Top 5 videos */}
          <div className="bg-[#111111] border border-white/[0.06] rounded-xl p-5">
            <h2 className="text-sm font-medium text-white mb-4">Топ-5 роликов</h2>
            <div className="flex flex-col">
              {d.topVideos.slice(0, 5).map((v, i) => (
                <div
                  key={v.id}
                  className="flex items-center gap-3 py-2.5 border-b border-white/[0.04] last:border-0"
                >
                  <span className="text-xs text-[#444] font-mono w-4 shrink-0">{i + 1}</span>
                  <PlatformBadge platform={v.platform as Platform} size="sm" />
                  <div className="flex-1 min-w-0">
                    <a
                      href={v.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#888] hover:text-white transition-colors truncate block"
                      title={v.url}
                    >
                      {v.url.replace(/^https?:\/\//, "").slice(0, 36)}…
                    </a>
                    <span className="text-[10px] text-[#555]">{v.creatorName}</span>
                  </div>
                  <span className="font-mono text-xs text-white shrink-0">{formatViews(v.views)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
