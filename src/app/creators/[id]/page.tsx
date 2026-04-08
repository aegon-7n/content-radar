"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
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
  backgroundColor: "#1a1a1a",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "8px",
  color: "#fff",
  fontSize: "12px",
};

export default function CreatorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<CreatorDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const { from, to } = getPeriodDates(period);
    fetch(`/api/creators/${id}?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((d) => {
        // Flatten nested API response into the shape the page expects
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
            className="flex items-center gap-1.5 text-xs text-[#555] hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Назад
          </button>
          <div className="w-px h-4 bg-white/[0.08]" />
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500/40 to-violet-600/40 flex items-center justify-center">
              <span className="text-xs font-semibold text-white">{d?.name?.[0] ?? "?"}</span>
            </div>
            <h1 className="text-xl font-semibold text-white">{d?.name ?? "Загрузка..."}</h1>
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
            icon={<Eye className="w-4 h-4 text-blue-400" />}
          />
          <StatCard
            title="Роликов"
            value={d.totalVideos}
            icon={<Film className="w-4 h-4 text-violet-400" />}
          />
          <StatCard
            title="Среднее на ролик"
            value={formatViews(d.avgViewsPerVideo)}
            icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}
          />
          <StatCard
            title="% изменение"
            value={`${d.viewsChange >= 0 ? "+" : ""}${d.viewsChange.toFixed(1)}%`}
            icon={<BarChart2 className="w-4 h-4 text-orange-400" />}
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
          <div className="bg-[#111111] border border-white/[0.06] rounded-xl p-5">
            <h2 className="text-sm font-medium text-white mb-5">Просмотры по дням</h2>
            <ResponsiveContainer width="100%" height={210}>
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
                  formatter={(v) => [formatViews(Number(v)), "Просмотры"]}
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

          {/* Bar chart by platform */}
          <div className="bg-[#111111] border border-white/[0.06] rounded-xl p-5">
            <h2 className="text-sm font-medium text-white mb-5">По платформам</h2>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart
                data={d.byPlatform.map((p) => ({
                  name: getPlatformLabel(p.platform),
                  views: p.views,
                  platform: p.platform,
                }))}
                margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#555", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
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
                  formatter={(v) => [formatViews(Number(v)), "Просмотры"]}
                  cursor={{ fill: "rgba(255,255,255,0.03)" }}
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
        <div className="bg-[#111111] border border-white/[0.06] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06]">
            <h2 className="text-sm font-medium text-white">По товарам</h2>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left px-4 py-3 text-xs text-[#555] font-medium">Товар</th>
                <th className="text-left px-4 py-3 text-xs text-[#555] font-medium">Артикул WB</th>
                <th className="text-left px-4 py-3 text-xs text-[#555] font-medium">Просмотры</th>
                <th className="text-left px-4 py-3 text-xs text-[#555] font-medium">Ролики</th>
              </tr>
            </thead>
            <tbody>
              {d.byProduct.map((p) => (
                <tr key={p.wbArticle} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-sm text-white">{p.productName}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[#555]">{p.wbArticle}</td>
                  <td className="px-4 py-3 font-mono text-sm text-white">{formatViews(p.views)}</td>
                  <td className="px-4 py-3 font-mono text-sm text-white">{p.videos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Top videos table */}
      {d && d.topVideos.length > 0 && (
        <div className="bg-[#111111] border border-white/[0.06] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06]">
            <h2 className="text-sm font-medium text-white">Топ роликов</h2>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left px-4 py-3 text-xs text-[#555] font-medium">Платформа</th>
                <th className="text-left px-4 py-3 text-xs text-[#555] font-medium">Ссылка</th>
                <th className="text-left px-4 py-3 text-xs text-[#555] font-medium">Просмотры</th>
                <th className="text-left px-4 py-3 text-xs text-[#555] font-medium">Товар</th>
                <th className="text-left px-4 py-3 text-xs text-[#555] font-medium">Дата</th>
              </tr>
            </thead>
            <tbody>
              {d.topVideos.map((v) => (
                <tr key={v.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <PlatformBadge platform={v.platform as Platform} size="sm" />
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={v.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#888] hover:text-white transition-colors"
                    >
                      {v.url.replace(/^https?:\/\//, "").slice(0, 40)}…
                    </a>
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-white">{formatViews(v.views)}</td>
                  <td className="px-4 py-3 text-xs text-[#888]">{v.productName}</td>
                  <td className="px-4 py-3 text-xs text-[#555]">{formatDate(v.publishedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
