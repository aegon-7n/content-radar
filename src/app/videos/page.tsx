"use client";

import { useState, useEffect, useMemo } from "react";
import { Search, X, ChevronLeft, ChevronRight, Download } from "lucide-react";
import PlatformBadge from "@/components/ui/PlatformBadge";
import PeriodSelector, { Period, getPeriodDates } from "@/components/ui/PeriodSelector";
import { TableSkeleton } from "@/components/ui/SkeletonCard";
import { formatViews, formatDate, getPlatformLabel } from "@/lib/format";
import { MOCK_VIDEOS, type Video, type Platform } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const PLATFORMS = ["tiktok", "youtube", "instagram", "likee", "pinterest"] as const;
const PAGE_SIZE = 10;

type SortKey = "views" | "publishedAt";
type SortDir = "asc" | "desc";

export default function VideosPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string>("");

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("views");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Pagination
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    const { from, to } = getPeriodDates(period);
    const params = new URLSearchParams({ from, to });
    if (platformFilter) params.set("platform", platformFilter);
    fetch(`/api/videos?${params}`)
      .then((r) => r.json())
      .then((d) => setVideos(d.videos ?? d))
      .catch(() => setVideos(MOCK_VIDEOS))
      .finally(() => setLoading(false));
  }, [period, platformFilter]);

  const filtered = useMemo(() => {
    let result = [...videos];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (v) =>
          v.url.toLowerCase().includes(q) ||
          v.creatorName.toLowerCase().includes(q) ||
          v.productName.toLowerCase().includes(q)
      );
    }
    result.sort((a, b) => {
      const mul = sortDir === "asc" ? 1 : -1;
      if (sortKey === "views") return (a.views - b.views) * mul;
      return (new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime()) * mul;
    });
    return result;
  }, [videos, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
    setPage(1);
  };

  const resetFilters = () => {
    setSearch("");
    setPlatformFilter("");
    setPage(1);
  };

  const hasFilters = search !== "" || platformFilter !== "";

  return (
    <div className="p-6 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-white">Ролики</h1>
            <span className="text-xs text-[#555] bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded font-mono">
              {filtered.length.toLocaleString("ru-RU")} роликов
            </span>
          </div>
          <p className="text-xs text-[#555] mt-0.5">Все публикации по всем платформам</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              const { from, to } = getPeriodDates(period);
              const params = new URLSearchParams({ from, to });
              if (platformFilter) params.set("platform", platformFilter);
              if (search) params.set("search", search);
              window.location.href = `/api/videos/export?${params}`;
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-[#888] border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] hover:text-white transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Экспорт CSV
          </button>
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#444]" />
          <input
            type="text"
            placeholder="Поиск по URL, автору, товару..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-4 py-2 bg-[#111111] border border-white/[0.06] rounded-lg text-xs text-white placeholder:text-[#444] focus:outline-none focus:border-white/[0.12] transition-colors"
          />
        </div>

        {/* Platform filter */}
        <select
          value={platformFilter}
          onChange={(e) => { setPlatformFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-[#111111] border border-white/[0.06] rounded-lg text-xs text-white focus:outline-none focus:border-white/[0.12] transition-colors appearance-none cursor-pointer"
        >
          <option value="">Все платформы</option>
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>{getPlatformLabel(p)}</option>
          ))}
        </select>

        {/* Reset */}
        {hasFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-[#888] border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] hover:text-white transition-colors"
          >
            <X className="w-3 h-3" />
            Сбросить
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <TableSkeleton rows={10} />
      ) : (
        <div className="bg-[#111111] border border-white/[0.06] rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left px-4 py-3 text-xs text-[#555] font-medium">Платформа</th>
                <th className="text-left px-4 py-3 text-xs text-[#555] font-medium">URL</th>
                <th
                  className="text-left px-4 py-3 text-xs text-[#555] font-medium cursor-pointer select-none group"
                  onClick={() => handleSort("views")}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="group-hover:text-white transition-colors">Просмотры</span>
                    {sortKey === "views" && (
                      <span className="text-blue-400">{sortDir === "asc" ? "↑" : "↓"}</span>
                    )}
                  </div>
                </th>
                <th className="text-left px-4 py-3 text-xs text-[#555] font-medium">Лайки</th>
                <th className="text-left px-4 py-3 text-xs text-[#555] font-medium">Автор</th>
                <th className="text-left px-4 py-3 text-xs text-[#555] font-medium">Товар</th>
                <th
                  className="text-left px-4 py-3 text-xs text-[#555] font-medium cursor-pointer select-none group"
                  onClick={() => handleSort("publishedAt")}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="group-hover:text-white transition-colors">Дата</span>
                    {sortKey === "publishedAt" && (
                      <span className="text-blue-400">{sortDir === "asc" ? "↑" : "↓"}</span>
                    )}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-[#555]">
                    Ролики не найдены
                  </td>
                </tr>
              ) : (
                paginated.map((v) => (
                  <tr
                    key={v.id}
                    className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-4 py-3">
                      <PlatformBadge platform={v.platform as Platform} size="sm" />
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      <a
                        href={v.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[#888] hover:text-white transition-colors block truncate"
                        title={v.url}
                      >
                        {v.url.replace(/^https?:\/\//, "").slice(0, 40)}
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm text-white">{formatViews(v.views)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-[#888]">{formatViews(v.likes)}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#888]">{v.creatorName}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-[#888]">{v.productName}</span>
                        <span className="font-mono text-[10px] text-[#444]">{v.wbArticle}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#555]">{formatDate(v.publishedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#555]">
            Показано {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} из {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border transition-colors",
                page === 1
                  ? "border-white/[0.04] text-[#333] cursor-not-allowed"
                  : "border-white/[0.06] text-[#888] hover:text-white hover:bg-white/[0.04]"
              )}
            >
              <ChevronLeft className="w-3 h-3" />
              Предыдущая
            </button>

            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = i + 1;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  className={cn(
                    "w-8 h-8 rounded-lg text-xs font-medium transition-colors",
                    page === p
                      ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                      : "text-[#555] hover:text-white hover:bg-white/[0.04]"
                  )}
                >
                  {p}
                </button>
              );
            })}
            {totalPages > 5 && <span className="text-[#444] text-xs px-1">…</span>}

            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border transition-colors",
                page === totalPages
                  ? "border-white/[0.04] text-[#333] cursor-not-allowed"
                  : "border-white/[0.06] text-[#888] hover:text-white hover:bg-white/[0.04]"
              )}
            >
              Следующая
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
