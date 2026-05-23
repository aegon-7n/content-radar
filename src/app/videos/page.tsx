"use client";

import { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import { Search, X, ChevronLeft, ChevronRight, Download } from "lucide-react";
import PlatformBadge from "@/components/ui/PlatformBadge";
import PeriodSelector, { Period, getPeriodDates } from "@/components/ui/PeriodSelector";
import OnboardingWizard from "@/components/ui/OnboardingWizard";
import { TableSkeleton } from "@/components/ui/SkeletonCard";
import { formatViews, formatDate, formatER, getPlatformLabel } from "@/lib/format";
import { MOCK_VIDEOS, type Video, type Platform } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const PLATFORMS = ["tiktok", "instagram", "youtube"] as const;
const PAGE_SIZE = 10;

type SortKey = "views" | "publishedAt";
type SortDir = "asc" | "desc";

export default function VideosPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role ?? "owner";
  const [period, setPeriod] = useState<Period>("30d");
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string>("");

  const [sortKey, setSortKey] = useState<SortKey>("views");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [page, setPage] = useState(1);
  const [isEmpty, setIsEmpty] = useState(false);
  const [showDemo, setShowDemo] = useState(true);
  const [showWizard, setShowWizard] = useState(false);

  useEffect(() => {
    setLoading(true);
    const { from, to } = getPeriodDates(period);
    const params = new URLSearchParams({ from, to });
    if (platformFilter) params.set("platform", platformFilter);
    params.set("limit", "1000");
    fetch(`/api/videos?${params}`)
      .then((r) => r.json())
      .then((d) => {
        const list = (d.videos ?? d) as Video[];
        setIsEmpty(Array.isArray(list) && list.length === 0);
        setVideos(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        setIsEmpty(true);
        setVideos([]);
      })
      .finally(() => setLoading(false));
  }, [period, platformFilter]);

  const isDemo = isEmpty && showDemo && role !== "creator";
  const displayedVideos: Video[] = isDemo ? MOCK_VIDEOS : videos;

  const filtered = useMemo(() => {
    let result = [...displayedVideos];
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
  }, [displayedVideos, search, sortKey, sortDir]);

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

  const inputBase = {
    background: "var(--surface-1)",
    border: "1px solid var(--border-default)",
    color: "var(--text-primary)",
  };

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 md:gap-6">
      {showWizard && session?.user && (
        <OnboardingWizard
          tenantId={(session.user as { tenantId?: string }).tenantId ?? ""}
          userName={session.user.name ?? ""}
          onComplete={() => setShowWizard(false)}
        />
      )}

      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
              Ролики
            </h1>
            <span
              className="text-xs px-2 py-0.5 rounded font-mono border"
              style={{
                color: "var(--text-muted)",
                background: "var(--bg-muted)",
                borderColor: "var(--border-default)",
              }}
            >
              {filtered.length.toLocaleString("ru-RU")} роликов{isDemo ? " (ДЕМО)" : ""}
            </span>
          </div>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            Все публикации по всем платформам
          </p>
        </div>
        <div className="flex items-center gap-2 md:gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => {
              const { from, to } = getPeriodDates(period);
              const params = new URLSearchParams({ from, to });
              if (platformFilter) params.set("platform", platformFilter);
              if (search) params.set("search", search);
              window.location.href = `/api/videos/export?${params}`;
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs border transition-colors"
            style={{
              color: "var(--text-muted)",
              borderColor: "var(--border-default)",
              background: "var(--bg-muted)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "var(--bg-overlay)";
              (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "var(--bg-muted)";
              (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
            }}
          >
            <Download className="w-3.5 h-3.5" />
            Экспорт CSV
          </button>
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
        <div className="relative flex-1 md:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "var(--text-disabled)" }} />
          <input
            type="text"
            placeholder="Поиск по URL, автору, товару..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-4 py-2 rounded-lg text-xs focus:outline-none transition-colors"
            style={{
              ...inputBase,
              color: "var(--text-primary)",
            }}
          />
        </div>

        <select
          value={platformFilter}
          onChange={(e) => { setPlatformFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 rounded-lg text-xs focus:outline-none transition-colors appearance-none cursor-pointer"
          style={inputBase}
        >
          <option value="">Все платформы</option>
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>{getPlatformLabel(p)}</option>
          ))}
        </select>

        {hasFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs border transition-colors"
            style={{
              color: "var(--text-muted)",
              borderColor: "var(--border-default)",
              background: "var(--bg-muted)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
              (e.currentTarget as HTMLElement).style.background = "var(--bg-overlay)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
              (e.currentTarget as HTMLElement).style.background = "var(--bg-muted)";
            }}
          >
            <X className="w-3 h-3" />
            Сбросить
          </button>
        )}
      </div>

      {isDemo && !loading && (
        <div
          className="rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          style={{ background: "var(--accent-muted)", border: "1px solid var(--accent-border)" }}
        >
          <div className="flex items-center gap-2">
            <span className="text-base">🎬</span>
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
              <strong style={{ color: "var(--accent-primary)" }}>ДЕМО</strong>
              {" "}— примеры роликов. Ваши появятся после первого скрейпинга (~00:00 МСК).
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowWizard(true)}
              className="text-xs px-3 py-1.5 rounded-lg transition-colors"
              style={{ background: "var(--surface-1)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
            >
              Открыть онбординг
            </button>
            <button
              onClick={() => setShowDemo(false)}
              className="text-xs px-3 py-1.5 rounded-lg transition-colors"
              style={{ background: "var(--accent-primary)", color: "#fff" }}
            >
              Мои данные
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <TableSkeleton rows={10} />
      ) : displayedVideos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: "var(--accent-muted)", border: "1px solid var(--accent-border)" }}>
            <span className="text-base">🎬</span>
          </div>
          <div>
            <h3 className="text-base font-medium mb-1" style={{ color: "var(--text-primary)" }}>Пока нет роликов</h3>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Ролики появятся после первого скрейпинга. Скрейпер запускается раз в сутки около 00:00 МСК.
            </p>
          </div>
        </div>
      ) : (
        <div
          className="rounded-xl overflow-x-auto"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
          }}
        >
          <table className="w-full min-w-[800px]">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-default)", background: "var(--bg-subtle)" }}>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>Платформа</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>URL</th>
                <th
                  className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide cursor-pointer select-none"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}
                  onClick={() => handleSort("views")}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="transition-colors"
                      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                    >
                      Просмотры
                    </span>
                    {sortKey === "views" && (
                      <span style={{ color: "var(--accent-primary)" }}>
                        {sortDir === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </div>
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>Лайки</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>Комменты</th>
                <th
                  className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}
                  title="Engagement Rate = (лайки + комменты) / просмотры"
                >
                  ER%
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>Автор</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>Товар</th>
                <th
                  className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide cursor-pointer select-none"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}
                  onClick={() => handleSort("publishedAt")}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="transition-colors"
                      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                    >
                      Дата
                    </span>
                    {sortKey === "publishedAt" && (
                      <span style={{ color: "var(--accent-primary)" }}>
                        {sortDir === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                    Ролики не найдены
                  </td>
                </tr>
              ) : (
                paginated.map((v) => (
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
                    <td className="px-4 py-3 max-w-[200px]">
                      <a
                        href={v.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs transition-colors block truncate"
                        style={{ color: "var(--text-muted)" }}
                        title={v.url}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                      >
                        {v.url.replace(/^https?:\/\//, "").slice(0, 40)}
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm" style={{ color: "var(--text-primary)" }}>
                        {formatViews(v.views)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                        {formatViews(v.likes)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                        {formatViews(v.comments)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                        {formatER(v.views, v.likes, v.comments)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                      {v.creatorName}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {v.productName}
                        </span>
                        <span className="font-mono text-[10px]" style={{ color: "var(--text-disabled)" }}>
                          {v.wbArticle}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--text-disabled)" }}>
                      {formatDate(v.publishedAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <span className="text-xs" style={{ color: "var(--text-disabled)" }}>
            Показано {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} из {filtered.length}
          </span>
          <div className="flex items-center gap-1 flex-wrap">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border transition-colors",
              )}
              style={{
                borderColor: "var(--border-default)",
                color: page === 1 ? "var(--text-disabled)" : "var(--text-muted)",
                cursor: page === 1 ? "not-allowed" : "pointer",
                opacity: page === 1 ? 0.5 : 1,
              }}
            >
              <ChevronLeft className="w-3 h-3" />
              Предыдущая
            </button>

            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = i + 1;
              const isActive = page === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  className="w-8 h-8 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    background: isActive ? "var(--accent-muted)" : "transparent",
                    color: isActive ? "var(--accent-primary)" : "var(--text-muted)",
                    border: isActive ? "1px solid var(--accent-border)" : "1px solid transparent",
                  }}
                >
                  {p}
                </button>
              );
            })}
            {totalPages > 5 && (
              <span className="text-xs px-1" style={{ color: "var(--text-disabled)" }}>…</span>
            )}

            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border transition-colors"
              style={{
                borderColor: "var(--border-default)",
                color: page === totalPages ? "var(--text-disabled)" : "var(--text-muted)",
                cursor: page === totalPages ? "not-allowed" : "pointer",
                opacity: page === totalPages ? 0.5 : 1,
              }}
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
