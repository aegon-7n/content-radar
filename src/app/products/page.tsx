"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import PlatformBadge from "@/components/ui/PlatformBadge";
import PeriodSelector, { Period, getPeriodDates } from "@/components/ui/PeriodSelector";
import { TableSkeleton } from "@/components/ui/SkeletonCard";
import { formatViews } from "@/lib/format";
import { MOCK_PRODUCTS, type Platform } from "@/lib/mock-data";

type ProductRow = {
  id: string;
  name: string;
  wbArticle: string;
  views: number;
  videos: number;
  newVideos: number;
  byPlatform: Array<{ platform: string; views: number }>;
};

type SortKey = "views" | "videos" | "newVideos";
type SortDir = "asc" | "desc";

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3" style={{ color: "var(--text-disabled)" }} />;
  return dir === "asc"
    ? <ArrowUp className="w-3 h-3" style={{ color: "var(--accent-primary)" }} />
    : <ArrowDown className="w-3 h-3" style={{ color: "var(--accent-primary)" }} />;
}

export default function ProductsPage() {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("30d");
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("views");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    setLoading(true);
    const { from, to } = getPeriodDates(period);
    fetch(`/api/products?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((d) => {
        setProducts((d.products ?? []) as ProductRow[]);
      })
      .catch(() => {
        const fallback = MOCK_PRODUCTS.map((p) => ({
          id: p.id,
          name: p.name,
          wbArticle: p.wbArticle,
          views: p.totalViews,
          videos: p.totalVideos,
          newVideos: 0,
          byPlatform: p.byPlatform,
        }));
        setProducts(fallback);
      })
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

  const headers: { key: SortKey; label: string; help: string }[] = [
    {
      key: "views",
      label: "Прирост просмотров",
      help: "Сколько просмотров набрали видео этого товара за выбранный период",
    },
    {
      key: "videos",
      label: "Активных роликов",
      help: "Сколько роликов с этим товаром получили рост в этот период",
    },
    {
      key: "newVideos",
      label: "Новых",
      help: "Сколько роликов с этим товаром опубликовано именно в этом периоде",
    },
  ];

  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Товары
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            {products.length} товаров
          </p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {loading ? (
        <TableSkeleton rows={8} />
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
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>Название</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>Артикул WB</th>
                {headers.map((h) => (
                  <th
                    key={h.key}
                    className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide cursor-pointer select-none"
                    style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}
                    onClick={() => handleSort(h.key)}
                    title={h.help}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="transition-colors"
                        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                      >
                        {h.label}
                      </span>
                      <SortIcon active={sortKey === h.key} dir={sortDir} />
                    </div>
                  </th>
                ))}
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>По платформам</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((product) => (
                <tr
                  key={product.id}
                  className="cursor-pointer transition-colors last:border-0"
                  style={{ borderBottom: "1px solid var(--border-subtle)" }}
                  onClick={() => router.push(`/products/${product.id}?period=${period}`)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-muted)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td className="px-4 py-3.5">
                    <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      {product.name}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className="font-mono text-xs px-2 py-0.5 rounded"
                      style={{
                        color: "var(--text-muted)",
                        background: "var(--bg-muted)",
                      }}
                    >
                      {product.wbArticle}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="font-mono text-sm" style={{ color: "var(--text-primary)" }}>
                      {formatViews(product.views)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="font-mono text-sm" style={{ color: "var(--text-primary)" }}>
                      {product.videos}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="font-mono text-sm" style={{ color: "var(--text-primary)" }}>
                      {product.newVideos}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {product.byPlatform
                        .slice()
                        .sort((a, b) => b.views - a.views)
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
