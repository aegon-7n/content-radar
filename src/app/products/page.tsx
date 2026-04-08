"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import PlatformBadge from "@/components/ui/PlatformBadge";
import PeriodSelector, { Period, getPeriodDates } from "@/components/ui/PeriodSelector";
import { TableSkeleton } from "@/components/ui/SkeletonCard";
import { formatViews } from "@/lib/format";
import { MOCK_PRODUCTS, type Product, type Platform } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

type SortKey = "totalViews" | "totalVideos";
type SortDir = "asc" | "desc";

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-[#444]" />;
  return dir === "asc"
    ? <ArrowUp className="w-3 h-3 text-blue-400" />
    : <ArrowDown className="w-3 h-3 text-blue-400" />;
}

export default function ProductsPage() {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("30d");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("totalViews");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    setLoading(true);
    const { from, to } = getPeriodDates(period);
    fetch(`/api/products?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((d) => {
        const list = d.products ?? d;
        setProducts(list.map((p: Record<string, unknown>) => ({
          ...p,
          totalViews: p.views,
          totalVideos: p.videos,
        })));
      })
      .catch(() => setProducts(MOCK_PRODUCTS))
      .finally(() => setLoading(false));
  }, [period]);

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("desc");
      }
    },
    [sortKey]
  );

  const sorted = [...products].sort((a, b) => {
    const mul = sortDir === "asc" ? 1 : -1;
    return (a[sortKey] - b[sortKey]) * mul;
  });

  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Товары</h1>
          <p className="text-xs text-[#555] mt-0.5">{products.length} товаров</p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {loading ? (
        <TableSkeleton rows={8} />
      ) : (
        <div className="bg-[#111111] border border-white/[0.06] rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left px-4 py-3 text-xs text-[#555] font-medium">Название</th>
                <th className="text-left px-4 py-3 text-xs text-[#555] font-medium">Артикул WB</th>
                <th
                  className="text-left px-4 py-3 text-xs text-[#555] font-medium cursor-pointer select-none group"
                  onClick={() => handleSort("totalViews")}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="group-hover:text-white transition-colors">Просмотры</span>
                    <SortIcon active={sortKey === "totalViews"} dir={sortDir} />
                  </div>
                </th>
                <th
                  className="text-left px-4 py-3 text-xs text-[#555] font-medium cursor-pointer select-none group"
                  onClick={() => handleSort("totalVideos")}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="group-hover:text-white transition-colors">Ролики</span>
                    <SortIcon active={sortKey === "totalVideos"} dir={sortDir} />
                  </div>
                </th>
                <th className="text-left px-4 py-3 text-xs text-[#555] font-medium">По платформам</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((product) => (
                <tr
                  key={product.id}
                  className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] cursor-pointer transition-colors"
                  onClick={() => router.push(`/products/${product.id}`)}
                >
                  <td className="px-4 py-3.5">
                    <span className="text-sm text-white font-medium">{product.name}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="font-mono text-xs text-[#555] bg-white/[0.04] px-2 py-0.5 rounded">
                      {product.wbArticle}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="font-mono text-sm text-white">{formatViews(product.totalViews)}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="font-mono text-sm text-white">{product.totalVideos}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {product.byPlatform
                        .sort((a, b) => b.views - a.views)
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
