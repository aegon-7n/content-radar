"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ArrowLeft, Eye, Film, LayoutGrid } from "lucide-react";
import StatCard from "@/components/ui/StatCard";
import PlatformBadge from "@/components/ui/PlatformBadge";
import PeriodSelector, { Period, getPeriodDates } from "@/components/ui/PeriodSelector";
import { StatCardSkeleton, ChartSkeleton } from "@/components/ui/SkeletonCard";
import { formatViews, formatDate, getPlatformColor, getPlatformLabel } from "@/lib/format";
import { MOCK_PRODUCT_DETAIL, type ProductDetail, type Platform } from "@/lib/mock-data";

const tooltipStyle = {
  backgroundColor: "#1a1a1a",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "8px",
  color: "#fff",
  fontSize: "12px",
};

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const { from, to } = getPeriodDates(period);
    fetch(`/api/products/${id}?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.stats) {
          d.name = d.product?.name ?? d.name;
          d.wbArticle = d.product?.wbArticle ?? d.wbArticle;
          d.totalViews = d.stats.views ?? 0;
          d.totalVideos = d.stats.videos ?? 0;
        }
        setData(d);
      })
      .catch(() => setData(MOCK_PRODUCT_DETAIL[id] ?? null))
      .finally(() => setLoading(false));
  }, [id, period]);

  const d = data ?? MOCK_PRODUCT_DETAIL[id];

  return (
    <div className="p-6 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/products")}
            className="flex items-center gap-1.5 text-xs text-[#555] hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Назад
          </button>
          <div className="w-px h-4 bg-white/[0.08]" />
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold text-white">{d?.name ?? "Загрузка..."}</h1>
            {d && (
              <span className="font-mono text-xs text-[#555] bg-white/[0.04] border border-white/[0.06] px-2 py-1 rounded">
                {d.wbArticle}
              </span>
            )}
          </div>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {/* Stat cards */}
      {loading || !d ? (
        <div className="grid grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            title="Просмотры"
            value={formatViews(d.totalViews)}
            icon={<Eye className="w-4 h-4 text-blue-400" />}
          />
          <StatCard
            title="Роликов"
            value={d.totalVideos}
            icon={<Film className="w-4 h-4 text-violet-400" />}
          />
          <StatCard
            title="Платформ"
            value={d.byPlatform.length}
            icon={<LayoutGrid className="w-4 h-4 text-emerald-400" />}
            subtitle="активных платформ"
            mono={false}
          />
        </div>
      )}

      {/* Bar chart by platform */}
      {loading || !d ? (
        <ChartSkeleton height={260} />
      ) : (
        <div className="bg-[#111111] border border-white/[0.06] rounded-xl p-5">
          <h2 className="text-sm font-medium text-white mb-5">По платформам</h2>
          <ResponsiveContainer width="100%" height={200}>
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
      )}

      {/* By creator table */}
      {d && (
        <div className="bg-[#111111] border border-white/[0.06] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06]">
            <h2 className="text-sm font-medium text-white">По креаторам</h2>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left px-4 py-3 text-xs text-[#555] font-medium">Имя</th>
                <th className="text-left px-4 py-3 text-xs text-[#555] font-medium">Просмотры</th>
                <th className="text-left px-4 py-3 text-xs text-[#555] font-medium">Ролики</th>
              </tr>
            </thead>
            <tbody>
              {d.byCreator.map((c) => (
                <tr
                  key={c.creatorName}
                  className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500/40 to-violet-600/40 flex items-center justify-center shrink-0">
                        <span className="text-[9px] font-semibold text-white">{c.creatorName[0]}</span>
                      </div>
                      <span className="text-sm text-white">{c.creatorName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-white">{formatViews(c.views)}</td>
                  <td className="px-4 py-3 font-mono text-sm text-white">{c.videos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* All videos table */}
      {d && d.videos.length > 0 && (
        <div className="bg-[#111111] border border-white/[0.06] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06]">
            <h2 className="text-sm font-medium text-white">Все ролики</h2>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left px-4 py-3 text-xs text-[#555] font-medium">Платформа</th>
                <th className="text-left px-4 py-3 text-xs text-[#555] font-medium">Ссылка</th>
                <th className="text-left px-4 py-3 text-xs text-[#555] font-medium">Просмотры</th>
                <th className="text-left px-4 py-3 text-xs text-[#555] font-medium">Лайки</th>
                <th className="text-left px-4 py-3 text-xs text-[#555] font-medium">Дата</th>
                <th className="text-left px-4 py-3 text-xs text-[#555] font-medium">Автор</th>
              </tr>
            </thead>
            <tbody>
              {d.videos.map((v) => (
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
                  <td className="px-4 py-3 font-mono text-xs text-[#888]">{formatViews(v.likes)}</td>
                  <td className="px-4 py-3 text-xs text-[#555]">{formatDate(v.publishedAt)}</td>
                  <td className="px-4 py-3 text-xs text-[#888]">{v.creatorName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
