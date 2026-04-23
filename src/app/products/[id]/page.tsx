"use client";

import { useState, useEffect, useMemo } from "react";
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
import { ArrowLeft, Eye, Film, Sparkles, Search, X } from "lucide-react";
import StatCard from "@/components/ui/StatCard";
import PlatformBadge from "@/components/ui/PlatformBadge";
import PeriodSelector, { Period, getPeriodDates } from "@/components/ui/PeriodSelector";
import { StatCardSkeleton, ChartSkeleton } from "@/components/ui/SkeletonCard";
import { formatViews, formatDate, formatER, getPlatformColor, getPlatformLabel } from "@/lib/format";
import { type Platform } from "@/lib/mock-data";

type ProductDetail = {
  product: { id: string; name: string; wbArticle: string };
  stats: { views: number; videos: number; newVideos: number };
  byPlatform: Array<{ platform: string; views: number; videos: number }>;
  byCreator: Array<{ creatorId: string; creatorName: string; views: number; videos: number }>;
  videos: Array<{
    id: string;
    url: string;
    platform: string;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    creatorName: string;
    publishedAt: string;
  }>;
};

const PLATFORMS = ["tiktok", "youtube", "instagram", "likee", "pinterest"] as const;

type VideoSortKey = "views" | "likes" | "comments" | "er" | "publishedAt";
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

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params.id as string;

  const initialPeriod = (searchParams.get("period") as Period) || "30d";
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [data, setData] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Creator table search
  const [creatorSearch, setCreatorSearch] = useState("");

  // Videos table filters
  const [videoSearch, setVideoSearch] = useState("");
  const [videoPlatform, setVideoPlatform] = useState("");
  const [videoSortKey, setVideoSortKey] = useState<VideoSortKey>("views");
  const [videoSortDir, setVideoSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    setLoading(true);
    const { from, to } = getPeriodDates(period);
    fetch(`/api/products/${id}?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [id, period]);

  const filteredCreators = useMemo(() => {
    if (!data) return [];
    let result = [...data.byCreator];
    if (creatorSearch) {
      const q = creatorSearch.toLowerCase();
      result = result.filter((c) => c.creatorName.toLowerCase().includes(q));
    }
    return result;
  }, [data, creatorSearch]);

  const filteredVideos = useMemo(() => {
    if (!data) return [];
    let result = [...data.videos];
    if (videoSearch) {
      const q = videoSearch.toLowerCase();
      result = result.filter(
        (v) =>
          v.url.toLowerCase().includes(q) ||
          v.creatorName.toLowerCase().includes(q)
      );
    }
    if (videoPlatform) {
      result = result.filter((v) => v.platform === videoPlatform);
    }
    result.sort((a, b) => {
      const mul = videoSortDir === "asc" ? 1 : -1;
      if (videoSortKey === "views") return (a.views - b.views) * mul;
      if (videoSortKey === "likes") return (a.likes - b.likes) * mul;
      if (videoSortKey === "comments") return (a.comments - b.comments) * mul;
      if (videoSortKey === "er") {
        const erA = a.views > 0 ? (a.likes + a.comments) / a.views : 0;
        const erB = b.views > 0 ? (b.likes + b.comments) / b.views : 0;
        return (erA - erB) * mul;
      }
      return (new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime()) * mul;
    });
    return result;
  }, [data, videoSearch, videoPlatform, videoSortKey, videoSortDir]);

  const hasVideoFilters = videoSearch !== "" || videoPlatform !== "";

  function handleVideoSort(key: VideoSortKey) {
    if (videoSortKey === key) {
      setVideoSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setVideoSortKey(key);
      setVideoSortDir("desc");
    }
  }

  const d = data;

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
              {d?.product?.name ?? "Загрузка..."}
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
                {d.product.wbArticle}
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
            title="Прирост просмотров"
            value={formatViews(d.stats.views)}
            icon={<Eye className="w-4 h-4" style={{ color: "var(--accent-primary)" }} />}
            subtitle="за выбранный период"
            help="Сколько новых просмотров набрали видео с этим товаром за период."
          />
          <StatCard
            title="Активных роликов"
            value={d.stats.videos}
            icon={<Film className="w-4 h-4" style={{ color: "#7C3AED" }} />}
            subtitle="получили рост"
            mono={false}
            help="Сколько роликов с этим товаром принесли рост в этом периоде."
          />
          <StatCard
            title="Новых роликов"
            value={d.stats.newVideos}
            icon={<Sparkles className="w-4 h-4" style={{ color: "#059669" }} />}
            subtitle="опубликовано в периоде"
            mono={false}
            help="Сколько роликов с этим товаром креаторы опубликовали именно в этом периоде."
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
          <div
            className="px-5 py-4 flex items-center justify-between gap-3"
            style={{ borderBottom: "1px solid var(--border-default)" }}
          >
            <h2 className="text-sm font-medium shrink-0" style={{ color: "var(--text-primary)" }}>
              По креаторам
              <span className="ml-2 font-mono text-xs" style={{ color: "var(--text-disabled)" }}>
                {filteredCreators.length}
              </span>
            </h2>
            <div className="relative">
              <Search
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3"
                style={{ color: "var(--text-disabled)" }}
              />
              <input
                type="text"
                placeholder="Поиск креатора..."
                value={creatorSearch}
                onChange={(e) => setCreatorSearch(e.target.value)}
                className="pl-7 pr-3 py-1.5 rounded-lg text-xs focus:outline-none"
                style={{ ...inputBase, width: "180px" }}
              />
            </div>
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
              {filteredCreators.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                    Креаторы не найдены
                  </td>
                </tr>
              ) : (
                filteredCreators.map((c) => (
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
                ))
              )}
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
          <div
            className="px-5 py-4 flex items-center justify-between gap-3"
            style={{ borderBottom: "1px solid var(--border-default)" }}
          >
            <h2 className="text-sm font-medium shrink-0" style={{ color: "var(--text-primary)" }}>
              Все ролики
              <span className="ml-2 font-mono text-xs" style={{ color: "var(--text-disabled)" }}>
                {filteredVideos.length}
              </span>
            </h2>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3"
                  style={{ color: "var(--text-disabled)" }}
                />
                <input
                  type="text"
                  placeholder="Поиск по URL, автору..."
                  value={videoSearch}
                  onChange={(e) => setVideoSearch(e.target.value)}
                  className="pl-7 pr-3 py-1.5 rounded-lg text-xs focus:outline-none"
                  style={{ ...inputBase, width: "200px" }}
                />
              </div>
              <select
                value={videoPlatform}
                onChange={(e) => setVideoPlatform(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg text-xs focus:outline-none appearance-none cursor-pointer"
                style={inputBase}
              >
                <option value="">Все платформы</option>
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>{getPlatformLabel(p)}</option>
                ))}
              </select>
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
          <table className="w-full">
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
                <th
                  className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide cursor-pointer select-none"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}
                  onClick={() => handleVideoSort("likes")}
                >
                  <div className="flex items-center gap-1">
                    Лайки
                    {videoSortKey === "likes" && (
                      <span style={{ color: "var(--accent-primary)" }}>
                        {videoSortDir === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </div>
                </th>
                <th
                  className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide cursor-pointer select-none"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}
                  onClick={() => handleVideoSort("comments")}
                >
                  <div className="flex items-center gap-1">
                    Комменты
                    {videoSortKey === "comments" && (
                      <span style={{ color: "var(--accent-primary)" }}>
                        {videoSortDir === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </div>
                </th>
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
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>Автор</th>
              </tr>
            </thead>
            <tbody>
              {filteredVideos.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                    Ролики не найдены
                  </td>
                </tr>
              ) : (
                filteredVideos.map((v) => (
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
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                      {formatViews(v.comments)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                      {formatER(v.views, v.likes, v.comments)}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--text-disabled)" }}>
                      {formatDate(v.publishedAt)}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                      {v.creatorName}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
