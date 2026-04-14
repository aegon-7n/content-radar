"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import PlatformBadge from "@/components/ui/PlatformBadge";
import PeriodSelector, { Period, getPeriodDates } from "@/components/ui/PeriodSelector";
import { TableSkeleton } from "@/components/ui/SkeletonCard";
import { formatViews, formatPercent } from "@/lib/format";
import { MOCK_CREATORS, type Creator, type Platform } from "@/lib/mock-data";

type SortKey = "totalViews" | "totalVideos" | "avgViewsPerVideo" | "viewsChange";
type SortDir = "asc" | "desc";

function SortIcon({ active, dir }: { col?: string; active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3" style={{ color: "var(--text-disabled)" }} />;
  return dir === "asc"
    ? <ArrowUp className="w-3 h-3" style={{ color: "var(--accent-primary)" }} />
    : <ArrowDown className="w-3 h-3" style={{ color: "var(--accent-primary)" }} />;
}

export default function CreatorsPage() {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("30d");
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("totalViews");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    setLoading(true);
    const { from, to } = getPeriodDates(period);
    fetch(`/api/creators?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((d) => {
        const list = d.creators ?? d;
        setCreators(list.map((c: Record<string, unknown>) => ({
          ...c,
          totalViews: c.views,
          totalVideos: c.videos,
          avgViewsPerVideo: c.avgViews,
        })));
      })
      .catch(() => setCreators(MOCK_CREATORS))
      .finally(() => setLoading(false));
  }, [period]);

  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }, [sortKey]);

  const sorted = [...creators].sort((a, b) => {
    const mul = sortDir === "asc" ? 1 : -1;
    return (a[sortKey] - b[sortKey]) * mul;
  });

  const headers: { key: SortKey; label: string }[] = [
    { key: "totalViews", label: "Просмотры" },
    { key: "totalVideos", label: "Ролики" },
    { key: "avgViewsPerVideo", label: "Среднее/ролик" },
    { key: "viewsChange", label: "% изменение" },
  ];

  return (
    <div className="p-6 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Креаторы
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            {creators.length} креаторов
          </p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {/* Table */}
      {loading ? (
        <TableSkeleton rows={3} />
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
          }}
        >
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-default)", background: "var(--bg-subtle)" }}>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>
                  Имя
                </th>
                {headers.map((h) => (
                  <th
                    key={h.key}
                    className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide cursor-pointer select-none group"
                    style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}
                    onClick={() => handleSort(h.key)}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="transition-colors"
                        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                      >
                        {h.label}
                      </span>
                      <SortIcon col={h.key} active={sortKey === h.key} dir={sortDir} />
                    </div>
                  </th>
                ))}
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>
                  По платформам
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((creator) => (
                <tr
                  key={creator.id}
                  className="cursor-pointer transition-colors last:border-0"
                  style={{ borderBottom: "1px solid var(--border-subtle)" }}
                  onClick={() => router.push(`/creators/${creator.id}?period=${period}`)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-muted)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shrink-0">
                        <span className="text-[10px] font-semibold text-white">
                          {creator.name[0]}
                        </span>
                      </div>
                      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                        {creator.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="font-mono text-sm" style={{ color: "var(--text-primary)" }}>
                      {formatViews(creator.totalViews)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="font-mono text-sm" style={{ color: "var(--text-primary)" }}>
                      {creator.totalVideos}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="font-mono text-sm" style={{ color: "var(--text-primary)" }}>
                      {formatViews(creator.avgViewsPerVideo)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className="text-sm font-medium font-mono"
                      style={{
                        color: creator.viewsChange >= 0 ? "var(--success-text)" : "var(--error-text)",
                      }}
                    >
                      {formatPercent(creator.viewsChange)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {creator.byPlatform
                        .sort((a, b) => b.views - a.views)
                        .slice(0, 3)
                        .map((p) => (
                          <div key={p.platform} className="flex items-center gap-1">
                            <PlatformBadge platform={p.platform as Platform} size="sm" />
                            <span className="font-mono text-[10px]" style={{ color: "var(--text-disabled)" }}>
                              {formatViews(p.views)}
                            </span>
                          </div>
                        ))}
                    </div>
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
