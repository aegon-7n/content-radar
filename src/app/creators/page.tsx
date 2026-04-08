"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import PlatformBadge from "@/components/ui/PlatformBadge";
import PeriodSelector, { Period, getPeriodDates } from "@/components/ui/PeriodSelector";
import { TableSkeleton } from "@/components/ui/SkeletonCard";
import { formatViews, formatPercent } from "@/lib/format";
import { MOCK_CREATORS, type Creator, type Platform } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

type SortKey = "totalViews" | "totalVideos" | "avgViewsPerVideo" | "viewsChange";
type SortDir = "asc" | "desc";

function SortIcon({ col, active, dir }: { col: string; active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-[#444]" />;
  return dir === "asc"
    ? <ArrowUp className="w-3 h-3 text-blue-400" />
    : <ArrowDown className="w-3 h-3 text-blue-400" />;
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
          <h1 className="text-xl font-semibold text-white">Креаторы</h1>
          <p className="text-xs text-[#555] mt-0.5">{creators.length} креаторов</p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {/* Table */}
      {loading ? (
        <TableSkeleton rows={3} />
      ) : (
        <div className="bg-[#111111] border border-white/[0.06] rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left px-4 py-3 text-xs text-[#555] font-medium">
                  Имя
                </th>
                {headers.map((h) => (
                  <th
                    key={h.key}
                    className="text-left px-4 py-3 text-xs text-[#555] font-medium cursor-pointer select-none group"
                    onClick={() => handleSort(h.key)}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="group-hover:text-white transition-colors">{h.label}</span>
                      <SortIcon col={h.key} active={sortKey === h.key} dir={sortDir} />
                    </div>
                  </th>
                ))}
                <th className="text-left px-4 py-3 text-xs text-[#555] font-medium">
                  По платформам
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((creator) => (
                <tr
                  key={creator.id}
                  className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] cursor-pointer transition-colors"
                  onClick={() => router.push(`/creators/${creator.id}`)}
                >
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500/40 to-violet-600/40 flex items-center justify-center shrink-0">
                        <span className="text-[10px] font-semibold text-white">
                          {creator.name[0]}
                        </span>
                      </div>
                      <span className="text-sm text-white font-medium">{creator.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="font-mono text-sm text-white">{formatViews(creator.totalViews)}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="font-mono text-sm text-white">{creator.totalVideos}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="font-mono text-sm text-white">{formatViews(creator.avgViewsPerVideo)}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={cn(
                        "text-sm font-medium font-mono",
                        creator.viewsChange >= 0 ? "text-emerald-400" : "text-red-400"
                      )}
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
                            <span className="font-mono text-[10px] text-[#555]">
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
