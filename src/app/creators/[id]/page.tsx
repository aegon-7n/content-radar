"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { ArrowLeft, Eye, Film, TrendingUp, BarChart2 } from "lucide-react";
import StatCard from "@/components/ui/StatCard";
import PlatformBadge from "@/components/ui/PlatformBadge";
import PeriodSelector, { Period, getPeriodDates } from "@/components/ui/PeriodSelector";
import { StatCardSkeleton, ChartSkeleton } from "@/components/ui/SkeletonCard";
import { formatViews, formatDate, formatDateShort, formatPercent, getPlatformColor, getPlatformLabel } from "@/lib/format";
import { MOCK_CREATOR_DETAIL, type CreatorDetail, type Platform } from "@/lib/mock-data";

const tooltipStyle = {
  backgroundColor: "var(--surface-1)",
  border: "1px solid var(--border-default)",
  borderRadius: "8px",
  color: "var(--text-primary)",
  fontSize: "12px",
};

export default function CreatorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params.id as string;

  const initialPeriod = (searchParams.get("period") as Period) || "30d";
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [data, setData] = useState<CreatorDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const { from, to } = getPeriodDates(period);
    fetch(`/api/creators/${id}?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.stats) {
          d.name = d.creator?.name ?? d.name;
          d.totalViews = d.stats.views ?? 0;
          d.totalVideos = d.stats.videos ?? 0;
          d.avgViewsPerVideo = d.stats.avgViews ?? 0;
          d.viewsChange = d.stats.viewsChange ?? 0;
          d.dailyViews = d.byDay ?? [];
        }
        setData(d);
      })
      .catch(() => setData(MOCK_CREATOR_DETAIL[id] ?? null))
      .finally(() => setLoading(false));
  }, [id, period]);

  const d = data ?? MOCK_CREATOR_DETAIL[id];

  return (
    <div className="p-6 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/creators")}
            className="flex items-center gap-1.5 text-xs transition-colors"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Назад
          </button>
          <div className="w-px h-4" style={{ background: "var(--border-default)" }} />
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
              <span className="text-xs font-semibold text-white">{d?.name?.[0] ?? "?"}</span>
            </div>
            <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
              {d?.name ?? "Загрузка..."}
            </h1>
          </div>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {/* Stat cards */}
      {loading || !d ? (
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            title="Просмотры"
            value={formatViews(d.totalViews)}
            change={d.viewsChange}
            icon={<Eye className="w-4 h-4" style={{ color: "var(--accent-primary)" }} />}
          />
          <StatCard
            title="Роликов"
            value={d.totalVideos}
            icon={<Film className="w-4 h-4" style={{ color: "#7C3AED" }} />}
          />
          <StatCard
            title="Среднее на ролик"
            value={formatViews(d.avgViewsPerVideo)}
            icon={<TrendingUp className="w-4 h-4" style={{ color: "#059669" }} />}
          />
          <StatCard
            title="% изменение"
            value={`${d.viewsChange >= 0 ? "+" : ""}${d.viewsChange.toFixed(1)}%`}
            icon={<BarChart2 className="w-4 h-4" style={{ color: "#D97706" }} />}
            subtitle="к прошлому периоду"
            mono={false}
          />
        </div>
      )}

      {/* Charts row */}
      {loading || !d ? (
        <div className="grid grid-cols-2 gap-4">
          <ChartSkeleton height={280} />
          <ChartSkeleton height={280} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {/* Line chart */}
          <div
            className="rounded-xl p-5"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-default)",
            }}
          >
            <h2 className="text-sm font-medium mb-5" style={{ color: "var(--text-primary)" }}>
              Просмотры по дням
            </h2>
            <ResponsiveContainer width="100%" height={210}>
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
                  formatter={(v) => [formatViews(Number(v)), "Просмотры"]}
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

          {/* Bar chart by platform */}
          <div
            className="rounded-xl p-5"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-default)",
            }}
          >
            <h2 className="text-sm font-medium mb-5" style={{ color: "var(--text-primary)" }}>
              По платформам
            </h2>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart
                data={d.byPlatform.map((p) => ({
                  name: getPlatformLabel(p.platform),
                  views: p.views,
                  platform: p.platform,
                }))}
                margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "var(--text-disabled)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
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
                  formatter={(v) => [formatViews(Number(v)), "Просмотры"]}
                  cursor={{ fill: "var(--bg-muted)" }}
                />
                <Bar dataKey="views" radius={[4, 4, 0, 0]}>
                  {d.byPlatform.map((p) => (
                    <Cell key={p.platform} fill={getPlatformColor(p.platform)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Products table */}
      {d && (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
          }}
        >
          <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border-default)" }}>
            <h2 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              По товарам
            </h2>
          </div>
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-default)", background: "var(--bg-subtle)" }}>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>Товар</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>Артикул WB</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>Просмотры</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>Ролики</th>
              </tr>
            </thead>
            <tbody>
              {d.byProduct.map((p) => (
                <tr
                  key={p.wbArticle}
                  className="last:border-0 transition-colors"
                  style={{ borderBottom: "1px solid var(--border-subtle)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-muted)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td className="px-4 py-3 text-sm" style={{ color: "var(--text-primary)" }}>
                    {p.productName}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                    {p.wbArticle}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm" style={{ color: "var(--text-primary)" }}>
                    {formatViews(p.views)}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm" style={{ color: "var(--text-primary)" }}>
                    {p.videos}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Top videos table */}
      {d && d.topVideos.length > 0 && (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
          }}
        >
          <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border-default)" }}>
            <h2 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              Топ роликов
            </h2>
          </div>
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-default)", background: "var(--bg-subtle)" }}>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>Платформа</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>Ссылка</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>Просмотры</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>Товар</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>Дата</th>
              </tr>
            </thead>
            <tbody>
              {d.topVideos.map((v) => (
                <tr
                  key={v.id}
                  className="last:border-0 transition-colors"
                  style={{ borderBottom: "1px solid var(--border-subtle)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-muted)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td className="px-4 py-3">
                    <PlatformBadge platform={v.platform as Platform} size="sm" />
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={v.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs transition-colors"
                      style={{ color: "var(--text-muted)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                    >
                      {v.url.replace(/^https?:\/\//, "").slice(0, 40)}…
                    </a>
                  </td>
                  <td className="px-4 py-3 font-mono text-sm" style={{ color: "var(--text-primary)" }}>
                    {formatViews(v.views)}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                    {v.productName}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--text-disabled)" }}>
                    {formatDate(v.publishedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
