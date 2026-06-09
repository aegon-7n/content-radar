"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import PlatformBadge from "@/components/ui/PlatformBadge";
import PeriodSelector, { Period, getPeriodDates } from "@/components/ui/PeriodSelector";
import OnboardingWizard from "@/components/ui/OnboardingWizard";
import { TableSkeleton } from "@/components/ui/SkeletonCard";
import { formatViews } from "@/lib/format";
import { MOCK_PRODUCTS, type Platform } from "@/lib/mock-data";

const MOCK_PRODUCT_ROWS = MOCK_PRODUCTS.map((p) => ({
  id: p.id,
  name: p.name,
  wbArticle: p.wbArticle,
  views: p.totalViews,
  videos: p.totalVideos,
  newVideos: 0,
  byPlatform: p.byPlatform,
}));

type ProductRow = {
  id: string;
  name: string;
  wbArticle: string;
  needsReview?: boolean;
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
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role ?? "owner";
  const [period, setPeriod] = useState<Period>("30d");
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("views");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [isEmpty, setIsEmpty] = useState(false);
  const [showDemo, setShowDemo] = useState(true);
  const [showWizard, setShowWizard] = useState(false);

  useEffect(() => {
    setLoading(true);
    const { from, to } = getPeriodDates(period);
    fetch(`/api/products?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((d) => {
        const list = (d.products ?? []) as ProductRow[];
        setIsEmpty(d.isEmpty === true || list.length === 0);
        setProducts(list);
      })
      .catch(() => {
        setIsEmpty(true);
        setProducts([]);
      })
      .finally(() => setLoading(false));
  }, [period]);

  const isDemo = isEmpty && showDemo && role !== "creator";
  const displayed = isDemo ? MOCK_PRODUCT_ROWS : products;

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

  const sorted = [...displayed].sort((a, b) => {
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
    <div className="p-4 md:p-6 flex flex-col gap-4 md:gap-6">
      {showWizard && session?.user && (
        <OnboardingWizard
          tenantId={(session.user as { tenantId?: string }).tenantId ?? ""}
          userName={session.user.name ?? ""}
          onComplete={() => setShowWizard(false)}
        />
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Товары
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            {isDemo ? `${MOCK_PRODUCT_ROWS.length} товаров (ДЕМО)` : `${products.length} товаров`}
          </p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {isDemo && (
        <div
          className="rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          style={{ background: "var(--accent-muted)", border: "1px solid var(--accent-border)" }}
        >
          <div className="flex items-center gap-2">
            <span className="text-base">🎬</span>
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
              <strong style={{ color: "var(--accent-primary)" }}>ДЕМО</strong>
              {" "}— пример того, как тут будут видны ваши товары и их продвижение. Товары автоматически появятся после первого скрейпинга роликов.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => { window.location.href = "/?openOnboarding=1"; }}
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

      {loading ? (
        <TableSkeleton rows={8} />
      ) : displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: "var(--accent-muted)", border: "1px solid var(--accent-border)" }}>
            <span className="text-base">🎬</span>
          </div>
          <div>
            <h3 className="text-base font-medium mb-1" style={{ color: "var(--text-primary)" }}>Пока нет товаров</h3>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Товары появятся автоматически после первого скрейпинга, или добавь вручную в{" "}
              <Link href="/settings" style={{ color: "var(--accent-primary)" }} className="hover:underline">Настройках</Link>.
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
          <table className="w-full min-w-[700px]">
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
                  className={`transition-colors last:border-0 ${isDemo ? "" : "cursor-pointer"}`}
                  style={{ borderBottom: "1px solid var(--border-subtle)" }}
                  onClick={() => { if (!isDemo) router.push(`/products/${product.id}?period=${period}`); }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-muted)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                        {product.name}
                      </span>
                      {product.needsReview && (
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                          style={{
                            background: "rgba(245,158,11,0.15)",
                            color: "#F59E0B",
                            border: "1px solid rgba(245,158,11,0.3)",
                            whiteSpace: "nowrap",
                          }}
                          title="Артикул определён автоматически — проверьте и уточните название товара в Настройках"
                        >
                          Нужно название
                        </span>
                      )}
                    </div>
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
