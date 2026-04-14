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
import { ArrowLeft, Eye, Film, TrendingUp, Sparkles } from "lucide-react";
import StatCard from "@/components/ui/StatCard";
import PlatformBadge from "@/components/ui/PlatformBadge";
import PeriodSelector, { Period, getPeriodDates } from "@/components/ui/PeriodSelector";
import { StatCardSkeleton, ChartSkeleton } from "@/components/ui/SkeletonCard";
import { formatViews, formatDate, formatDateShort, getPlatformColor, getPlatformLabel } from "@/lib/format";
import { type Platform } from "@/lib/mock-data";

type CreatorDetail = {
  creator: { id: string; name: string; avatarUrl: string | null };
  stats: {
    views: number;
    videos: number;
    newVideos: number;
    avgViews: number;
    viewsChange: number | null;
  };
  byPlatform: Array<{ platform: string; views: number; videos: number }>;
  byProduct: Array<{
    productId: string;
    productName: string;
    wbArticle: string;
    views: number;
    videos: number;
  }>;
  byDay: Array<{ date: string; views: number }>;
  topVideos: Array<{
    id: string;
    url: string;
    platform: string;
    views: number;
    productName: string;
    publishedAt: string;
  }>;
};

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
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [id, period]);

  const d = data;

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
              <span className="text-xs font-semibold text-white">{d?.creator?.name?.[0] ?? "?"}</span>
            </div>
            <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
              {d?.creator?.name ?? "Загрузка..."}
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
            title="Прирост просмотров"
            value={formatViews(d.stats.views)}
            change={d.stats.viewsChange}
            icon={<Eye className="w-4 h-4" style={{ color: "var(--accent-primary)" }} />}
            subtitle="за выбранный период"
            help="Сколько новых просмотров набрали видео этого креатора за выбранный период."
          />
          <StatCard
            title="Активных роликов"
            value={d.stats.videos}
            icon={<Film className="w-4 h-4" style={{ color: "#7C3AED" }} />}
            subtitle="получили рост"
            mono={false}
            help="Сколько роликов этого креатора принесли хотя бы один новый просмотр в этом периоде."
          />
          <StatCard
            title="Новых роликов"
            value={d.stats.newVideos}
            icon={<Sparkles className="w-4 h-4" style={{ color: "#D97706" }} />}
            subtitle="опубликовано в периоде"
            mono={false}
            help="Сколько роликов креатор опубликовал именно в этом периоде."
          />
          <StatCard
            title="Среднее на ролик"
            value={formatViews(d.stats.avgViews)}
            icon={<TrendingUp className="w-4 h-4" style={{ color: "#059669" }} />}
            subtitle="на один активный ролик"
            help="Прирост просмотров, делённый на количество активных роликов."
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
              Прирост просмотров по дням
            </h2>
            <ResponsiveContainer width="100%" height={210}>
              <LineChart data={d.byDay} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
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
