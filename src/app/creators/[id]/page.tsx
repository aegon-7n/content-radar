"use client";

import { useState, useEffect, useMemo } from "react";
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
import { ArrowLeft, Eye, Film, TrendingUp, Sparkles, Search, X } from "lucide-react";
import StatCard from "@/components/ui/StatCard";
import PlatformBadge from "@/components/ui/PlatformBadge";
import PeriodSelector, { Period, getPeriodDates } from "@/components/ui/PeriodSelector";
import { StatCardSkeleton, ChartSkeleton } from "@/components/ui/SkeletonCard";
import { formatViews, formatDate, formatDateShort, formatER, getPlatformColor, getPlatformLabel } from "@/lib/format";
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
    platform: string;
    views: number;
    videos: number;
  }>;
  byDay: Array<{ date: string; views: number }>;
  topVideos: Array<{
    id: string;
    url: string;
    platform: string;
    views: number;
    likes: number;
    comments: number;
    productName: string;
    publishedAt: string;
  }>;
};

// Core платформы для UI-фильтров. Likee + Pinterest скрыты: Likee частично
// сломан (docs/likee-research.md), Pinterest не в нашем ICP. Видео по этим
// платформам если есть — продолжают скрейпиться, просто фильтра по ним нет.
const PLATFORMS = ["tiktok", "youtube", "instagram"] as const;

type VideoSortKey = "views" | "publishedAt" | "er";
type SortDir = "asc" | "desc";

const tooltipStyle = {
  backgroundColor: "var(--surface-1)",
  border: "1px solid var(--border-default)",
  borderRadius: "8px",
  color: "var(--text-primary)",
  fontSize: "12px",
};

const inputBase = {
  background: "var(--surface-2)",
  border: "1px solid var(--border-default)",
  color: "var(--text-primary)",
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

  // Products table filters
  const [productSearch, setProductSearch] = useState("");
  const [productPlatform, setProductPlatform] = useState("");
  const [productSortDir, setProductSortDir] = useState<SortDir>("desc");

  // Videos table filters
  const [videoSearch, setVideoSearch] = useState("");
  const [videoPlatform, setVideoPlatform] = useState("");
  const [videoSortKey, setVideoSortKey] = useState<VideoSortKey>("views");
  const [videoSortDir, setVideoSortDir] = useState<SortDir>("desc");
  const [videoPage, setVideoPage] = useState(1);
  const [videoPerPage, setVideoPerPage] = useState(10);
  const PAGE_OPTIONS = [10, 20, 50] as const;

  useEffect(() => {
    setLoading(true);
    const { from, to } = getPeriodDates(period);
    fetch(`/api/creators/${id}?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [id, period]);

  // API возвращает byProduct в виде (product, platform) пар. На клиенте
  // сначала фильтруем по платформе, затем сворачиваем в одну строку на товар.
  const filteredProducts = useMemo(() => {
    if (!data) return [];

    let rows = data.byProduct;
    if (productPlatform) rows = rows.filter((r) => r.platform === productPlatform);

    const grouped = new Map<
      string,
      { productId: string; productName: string; wbArticle: string; views: number; videos: number }
    >();
    for (const r of rows) {
      const ex = grouped.get(r.productId);
      if (ex) {
        ex.views += r.views;
        ex.videos += r.videos;
      } else {
        grouped.set(r.productId, {
          productId: r.productId,
          productName: r.productName,
          wbArticle: r.wbArticle,
          views: r.views,
          videos: r.videos,
        });
      }
    }
    let result = Array.from(grouped.values());

    if (productSearch) {
      const q = productSearch.toLowerCase();
      result = result.filter(
        (p) => p.productName.toLowerCase().includes(q) || p.wbArticle.includes(q)
      );
    }

    result.sort((a, b) => {
      const mul = productSortDir === "asc" ? 1 : -1;
      return (a.views - b.views) * mul;
    });
    return result;
  }, [data, productSearch, productPlatform, productSortDir]);

  // Платформы, по которым у этого креатора есть товары — для dropdown.
  const productPlatforms = useMemo(() => {
    if (!data) return [] as string[];
    const set = new Set<string>();
    for (const r of data.byProduct) set.add(r.platform);
    return Array.from(set);
  }, [data]);

  const filteredVideos = useMemo(() => {
    if (!data) return [];
    let result = [...data.topVideos];
    if (videoSearch) {
      const q = videoSearch.toLowerCase();
      result = result.filter(
        (v) =>
          v.url.toLowerCase().includes(q) ||
          v.productName.toLowerCase().includes(q)
      );
    }
    if (videoPlatform) {
      result = result.filter((v) => v.platform === videoPlatform);
    }
    result.sort((a, b) => {
      const mul = videoSortDir === "asc" ? 1 : -1;
      if (videoSortKey === "publishedAt") {
        return (new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime()) * mul;
      }
      if (videoSortKey === "er") {
        const erA = a.views > 0 ? (a.likes + a.comments) / a.views : 0;
        const erB = b.views > 0 ? (b.likes + b.comments) / b.views : 0;
        return (erA - erB) * mul;
      }
      return (a.views - b.views) * mul;
    });
    return result;
  }, [data, videoSearch, videoPlatform, videoSortKey, videoSortDir]);

  const totalFilteredVideos = filteredVideos.length;
  const totalVideoPages = Math.max(1, Math.ceil(totalFilteredVideos / videoPerPage));
  const paginatedVideos = filteredVideos.slice((videoPage - 1) * videoPerPage, videoPage * videoPerPage);

  // Reset page when filters change
  const hasVideoFilters = videoSearch !== "" || videoPlatform !== "";

  function handleVideoSort(key: VideoSortKey) {
    setVideoPage(1);
    if (videoSortKey === key) {
      setVideoSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setVideoSortKey(key);
      setVideoSortDir("desc");
    }
  }

  const d = data;

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 md:gap-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => router.push("/creators")}
            className="flex items-center gap-1.5 text-xs transition-colors shrink-0"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Назад
          </button>
          <div className="w-px h-4 shrink-0" style={{ background: "var(--border-default)" }} />
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shrink-0">
              <span className="text-xs font-semibold text-white">{d?.creator?.name?.[0] ?? "?"}</span>
            </div>
            <h1 className="text-xl font-semibold truncate" style={{ color: "var(--text-primary)" }}>
              {d?.creator?.name ?? "Загрузка..."}
            </h1>
          </div>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {/* Stat cards */}
      {loading || !d ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {[...Array(4)].map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ChartSkeleton height={280} />
          <ChartSkeleton height={280} />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  interval={d.byDay.length <= 14 ? 0 : Math.ceil(d.byDay.length / 10) - 1}
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
          className="rounded-xl overflow-x-auto"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
          }}
        >
          <div
            className="px-5 py-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
            style={{ borderBottom: "1px solid var(--border-default)" }}
          >
            <h2 className="text-sm font-medium shrink-0" style={{ color: "var(--text-primary)" }}>
              По товарам
              <span className="ml-2 font-mono text-xs" style={{ color: "var(--text-disabled)" }}>
                {filteredProducts.length}
              </span>
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3"
                  style={{ color: "var(--text-disabled)" }}
                />
                <input
                  type="text"
                  placeholder="Поиск товара..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="w-full sm:w-44 pl-7 pr-3 py-1.5 rounded-lg text-xs focus:outline-none"
                  style={inputBase}
                />
              </div>
              <select
                value={productPlatform}
                onChange={(e) => setProductPlatform(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg text-xs focus:outline-none appearance-none cursor-pointer"
                style={inputBase}
              >
                <option value="">Все платформы</option>
                {productPlatforms.map((p) => (
                  <option key={p} value={p}>{getPlatformLabel(p)}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setProductSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-colors"
                style={{
                  borderColor: "var(--border-default)",
                  color: "var(--text-muted)",
                  background: "transparent",
                }}
                title={productSortDir === "desc" ? "Сортировка: убывание просмотров" : "Сортировка: возрастание просмотров"}
              >
                Просмотры
                <span style={{ color: "var(--accent-primary)", fontSize: "10px" }}>
                  {productSortDir === "asc" ? "↑" : "↓"}
                </span>
              </button>
            </div>
          </div>
          <table className="w-full min-w-[500px]">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-default)", background: "var(--bg-subtle)" }}>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>Товар</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>Артикул WB</th>
                <th
                  className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide cursor-pointer select-none"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}
                  onClick={() => setProductSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                >
                  <div className="flex items-center gap-1">
                    Просмотры
                    <span style={{ color: "var(--accent-primary)" }}>
                      {productSortDir === "asc" ? "↑" : "↓"}
                    </span>
                  </div>
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>Ролики</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                    Товары не найдены
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => (
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
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Top videos table */}
      {d && d.topVideos.length > 0 && (
        <div
          className="rounded-xl overflow-x-auto"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
          }}
        >
          <div
            className="px-5 py-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
            style={{ borderBottom: "1px solid var(--border-default)" }}
          >
            <h2 className="text-sm font-medium shrink-0" style={{ color: "var(--text-primary)" }}>
              Все ролики
              <span className="ml-2 font-mono text-xs" style={{ color: "var(--text-disabled)" }}>
                {totalFilteredVideos}
              </span>
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3"
                  style={{ color: "var(--text-disabled)" }}
                />
                <input
                  type="text"
                  placeholder="Поиск по URL, товару..."
                  value={videoSearch}
                  onChange={(e) => { setVideoSearch(e.target.value); setVideoPage(1); }}
                  className="w-full sm:w-48 pl-7 pr-3 py-1.5 rounded-lg text-xs focus:outline-none"
                  style={inputBase}
                />
              </div>
              <select
                value={videoPlatform}
                onChange={(e) => { setVideoPlatform(e.target.value); setVideoPage(1); }}
                className="px-2.5 py-1.5 rounded-lg text-xs focus:outline-none appearance-none cursor-pointer"
                style={inputBase}
              >
                <option value="">Все платформы</option>
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>{getPlatformLabel(p)}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => handleVideoSort(videoSortKey === "views" ? "publishedAt" : "views")}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-colors"
                style={{
                  borderColor: "var(--border-default)",
                  color: "var(--text-muted)",
                  background: "transparent",
                }}
                title="Переключить сортировку"
              >
                {videoSortKey === "views" ? "Просмотры" : "Дата"}
                <span style={{ color: "var(--accent-primary)", fontSize: "10px" }}>
                  {videoSortDir === "asc" ? "↑" : "↓"}
                </span>
              </button>
              {hasVideoFilters && (
                <button
                  type="button"
                  onClick={() => { setVideoSearch(""); setVideoPlatform(""); }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border transition-colors"
                  style={{
                    borderColor: "var(--border-default)",
                    color: "var(--text-muted)",
                    background: "var(--bg-muted)",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
                >
                  <X className="w-3 h-3" />
                  Сбросить
                </button>
              )}
            </div>
          </div>
          <table className="w-full min-w-[800px]">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-default)", background: "var(--bg-subtle)" }}>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>Платформа</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>Ссылка</th>
                <th
                  className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide cursor-pointer select-none"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}
                  onClick={() => handleVideoSort("views")}
                >
                  <div className="flex items-center gap-1">
                    Просмотры
                    {videoSortKey === "views" && (
                      <span style={{ color: "var(--accent-primary)" }}>
                        {videoSortDir === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </div>
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>Комменты</th>
                <th
                  className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide cursor-pointer select-none"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}
                  onClick={() => handleVideoSort("er")}
                  title="Engagement Rate = (лайки + комменты) / просмотры"
                >
                  <div className="flex items-center gap-1">
                    ER%
                    {videoSortKey === "er" && (
                      <span style={{ color: "var(--accent-primary)" }}>
                        {videoSortDir === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </div>
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>Товар</th>
                <th
                  className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide cursor-pointer select-none"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}
                  onClick={() => handleVideoSort("publishedAt")}
                >
                  <div className="flex items-center gap-1">
                    Дата
                    {videoSortKey === "publishedAt" && (
                      <span style={{ color: "var(--accent-primary)" }}>
                        {videoSortDir === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedVideos.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                    Ролики не найдены
                  </td>
                </tr>
              ) : (
                paginatedVideos.map((v) => (
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
                      {formatViews(v.comments)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                      {formatER(v.views, v.likes, v.comments)}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                      {v.productName}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--text-disabled)" }}>
                      {formatDate(v.publishedAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Pagination */}
          {totalFilteredVideos > 0 && (
            <div
              className="flex items-center justify-between px-5 py-3"
              style={{ borderTop: "1px solid var(--border-default)" }}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: "var(--text-disabled)" }}>
                  Показывать по
                </span>
                {PAGE_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => { setVideoPerPage(n); setVideoPage(1); }}
                    className="px-2 py-0.5 rounded text-xs transition-colors"
                    style={{
                      background: videoPerPage === n ? "var(--accent-muted)" : "transparent",
                      color: videoPerPage === n ? "var(--accent-primary)" : "var(--text-muted)",
                      fontWeight: videoPerPage === n ? 600 : 400,
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono" style={{ color: "var(--text-disabled)" }}>
                  {(videoPage - 1) * videoPerPage + 1}–{Math.min(videoPage * videoPerPage, totalFilteredVideos)} из {totalFilteredVideos}
                </span>
                <button
                  type="button"
                  disabled={videoPage <= 1}
                  onClick={() => setVideoPage((p) => p - 1)}
                  className="px-2 py-0.5 rounded text-xs transition-colors disabled:opacity-30"
                  style={{ color: "var(--text-muted)" }}
                >
                  ←
                </button>
                <button
                  type="button"
                  disabled={videoPage >= totalVideoPages}
                  onClick={() => setVideoPage((p) => p + 1)}
                  className="px-2 py-0.5 rounded text-xs transition-colors disabled:opacity-30"
                  style={{ color: "var(--text-muted)" }}
                >
                  →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
