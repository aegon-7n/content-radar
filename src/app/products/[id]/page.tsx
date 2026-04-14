"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
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
  backgroundColor: "var(--surface-1)",
  border: "1px solid var(--border-default)",
  borderRadius: "8px",
  color: "var(--text-primary)",
  fontSize: "12px",
};

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params.id as string;

  const initialPeriod = (searchParams.get("period") as Period) || "30d";
  const [period, setPeriod] = useState<Period>(initialPeriod);
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
            <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
              {d?.name ?? "Загрузка..."}
            </h1>
            {d && (
              <span
                className="font-mono text-xs px-2 py-1 rounded"
                style={{
                  color: "var(--text-muted)",
                  background: "var(--bg-muted)",
                  border: "1px solid var(--border-default)",
                }}
              >
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
            icon={<Eye className="w-4 h-4" style={{ color: "var(--accent-primary)" }} />}
          />
          <StatCard
            title="Роликов"
            value={d.totalVideos}
            icon={<Film className="w-4 h-4" style={{ color: "#7C3AED" }} />}
          />
          <StatCard
            title="Платформ"
            value={d.byPlatform.length}
            icon={<LayoutGrid className="w-4 h-4" style={{ color: "#059669" }} />}
            subtitle="активных платформ"
            mono={false}
          />
        </div>
      )}

      {/* Bar chart by platform */}
      {loading || !d ? (
        <ChartSkeleton height={260} />
      ) : (
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
          <ResponsiveContainer width="100%" height={200}>
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
      )}

      {/* By creator table */}
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
              По креаторам
            </h2>
          </div>
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-default)", background: "var(--bg-subtle)" }}>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>Имя</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>Просмотры</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>Ролики</th>
              </tr>
            </thead>
            <tbody>
              {d.byCreator.map((c) => (
                <tr
                  key={c.creatorName}
                  className="last:border-0 transition-colors"
                  style={{ borderBottom: "1px solid var(--border-subtle)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-muted)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shrink-0">
                        <span className="text-[9px] font-semibold text-white">{c.creatorName[0]}</span>
                      </div>
                      <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                        {c.creatorName}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-sm" style={{ color: "var(--text-primary)" }}>
                    {formatViews(c.views)}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm" style={{ color: "var(--text-primary)" }}>
                    {c.videos}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* All videos table */}
      {d && d.videos.length > 0 && (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
          }}
        >
          <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border-default)" }}>
            <h2 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              Все ролики
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
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>Лайки</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>Дата</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>Автор</th>
              </tr>
            </thead>
            <tbody>
              {d.videos.map((v) => (
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
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                    {formatViews(v.likes)}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--text-disabled)" }}>
                    {formatDate(v.publishedAt)}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                    {v.creatorName}
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
