"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Eye, Film, TrendingUp, LayoutGrid, HelpCircle } from "lucide-react";
import StatCard from "@/components/ui/StatCard";
import PlatformBadge from "@/components/ui/PlatformBadge";
import PeriodSelector, { Period, getPeriodDates } from "@/components/ui/PeriodSelector";
import { StatCardSkeleton, ChartSkeleton } from "@/components/ui/SkeletonCard";
import OnboardingWizard from "@/components/ui/OnboardingWizard";
import WeeklyPatternsWidget from "@/components/ui/WeeklyPatternsWidget";
import { formatViews, formatDate, formatDateShort, formatER, getPlatformColor, getPlatformLabel } from "@/lib/format";
import { MOCK_DASHBOARD, type DashboardData, type Platform } from "@/lib/mock-data";

const tooltipStyle = {
  backgroundColor: "var(--surface-1)",
  border: "1px solid var(--border-default)",
  borderRadius: "8px",
  color: "var(--text-primary)",
  fontSize: "12px",
};

function DashboardInner() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const role = (session?.user as { role?: string } | undefined)?.role ?? "owner";
  const searchParams = useSearchParams();

  const [period, setPeriod] = useState<Period>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isEmpty, setIsEmpty] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  // Auto-open onboarding wizard when redirected with ?openOnboarding=1
  useEffect(() => {
    if (searchParams.get("openOnboarding") === "1") {
      setShowWizard(true);
    }
  }, [searchParams]);

  useEffect(() => {
    setLoading(true);
    const { from, to } = getPeriodDates(period, customFrom, customTo);
    const params = new URLSearchParams({ from, to });
    if (selectedCategory) params.set("category", selectedCategory);

    fetch(`/api/dashboard?${params}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => {
        d.dailyViews = d.byDay ?? [];
        setData(d);
        setIsEmpty(d.isEmpty === true);
        if (d.categories?.length > 0) {
          setAllCategories(d.categories);
        }
      })
      .catch(() => setData(MOCK_DASHBOARD))
      .finally(() => setLoading(false));
  }, [period, customFrom, customTo, selectedCategory]);

  // Show onboarding wizard for empty owner tenants that haven't seen it yet.
  // Creators get a simpler "no videos yet" banner, not the full setup wizard.
  // Uses DB state (not localStorage) so cross-device/incognito behaviour is correct.
  useEffect(() => {
    if (isEmpty && session?.user && role !== "creator") {
      fetch("/api/onboarding/state")
        .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
        .then(({ state }: { state: string | null }) => {
          if (!state) setShowWizard(true);
        })
        .catch(() => {
          const tenantId = (session.user as { tenantId?: string }).tenantId ?? "";
          const done = localStorage.getItem(`onboarding_done_${tenantId}`);
          if (!done) setShowWizard(true);
        });
    }
  }, [isEmpty, session, role]);

  if (status === "unauthenticated") return null;

  const d = (isEmpty || !data) ? MOCK_DASHBOARD : data;
  const hasRealData = (d.dailyViews ?? []).some((v: { views: number }) => v.views > 0);
  const chartData = hasRealData ? (d.dailyViews ?? []) : (MOCK_DASHBOARD.dailyViews ?? []);

  const donutData = [...(d.byPlatform ?? [])]
    .filter((p) => p.views > 0)
    .sort((a, b) => b.views - a.views)
    .map((p) => ({
      name: getPlatformLabel(p.platform as Platform),
      value: p.views,
      platform: p.platform,
      color: getPlatformColor(p.platform as Platform),
    }));

  const totalDonut = donutData.reduce((s, p) => s + p.value, 0);

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 md:gap-6">
      {/* Onboarding wizard */}
      {showWizard && session?.user && (
        <OnboardingWizard
          tenantId={(session.user as { tenantId?: string }).tenantId ?? ""}
          userName={session.user.name ?? ""}
          onComplete={() => setShowWizard(false)}
        />
      )}

      {/* Header row */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Дашборд
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            Прирост просмотров всех ваших роликов за выбранный период
          </p>
        </div>
        <div className="flex items-center gap-2 md:gap-3 flex-wrap">
          {/* Category filter chips */}
          {allCategories.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <button
                onClick={() => setSelectedCategory(null)}
                className="px-2.5 py-1 rounded-lg text-xs transition-colors"
                style={{
                  background: selectedCategory === null ? "var(--surface-3)" : "transparent",
                  color: selectedCategory === null ? "var(--text-primary)" : "var(--text-muted)",
                }}
              >
                Все
              </button>
              {allCategories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
                  className="px-2.5 py-1 rounded-lg text-xs transition-colors"
                  style={{
                    background: selectedCategory === cat ? "var(--accent-primary)" : "var(--bg-muted)",
                    color: selectedCategory === cat ? "var(--text-inverse)" : "var(--text-muted)",
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
          <PeriodSelector
            value={period}
            onChange={setPeriod}
            customFrom={customFrom}
            customTo={customTo}
            onCustomChange={(f, t) => { setCustomFrom(f); setCustomTo(t); }}
          />
        </div>
      </div>

      {/* Demo banner */}
      {isEmpty && role === "creator" && (
        <div
          className="rounded-xl px-4 py-3 flex items-center gap-3"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)" }}
        >
          <span className="text-base">🎬</span>
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Роликов пока нет — попросите менеджера добавить вас в качестве автора хотя бы одного ролика.
            Ниже показан пример дашборда.
          </span>
        </div>
      )}
      {isEmpty && role !== "creator" && (
        <div
          className="rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          style={{ background: "var(--accent-muted)", border: "1px solid var(--accent-border)" }}
        >
          <div className="flex items-center gap-2">
            <span className="text-base">🎬</span>
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
              <strong style={{ color: "var(--accent-primary)" }}>ДЕМО</strong>
              {" "}— пример того, как будет выглядеть дашборд с вашими данными.
              Тут вы будете видеть эффективность каждого креатора и товара, какие платформы лучше заходят, и принимать решения.
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
              onClick={() => setIsEmpty(false)}
              className="text-xs px-3 py-1.5 rounded-lg transition-colors"
              style={{ background: "var(--accent-primary)", color: "#fff" }}
            >
              Мои данные
            </button>
          </div>
        </div>
      )}

      {/* Stat cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {[...Array(4)].map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <StatCard
            title="Прирост просмотров"
            value={formatViews(d.totalViews)}
            change={d.viewsChange}
            icon={<Eye className="w-4 h-4" style={{ color: "var(--accent-primary)" }} />}
            subtitle={`за ${d.period?.days ?? 30} дн.`}
            help="Сколько новых просмотров набрали все ваши ролики за выбранный период — от первого до последнего дня."
          />
          <StatCard
            title="Новых роликов"
            value={d.newVideos}
            change={d.newVideosChange}
            icon={<Film className="w-4 h-4" style={{ color: "#7C3AED" }} />}
            subtitle="опубликовано в периоде"
            mono={false}
            help="Сколько роликов креаторы выпустили в этот период (по дате публикации на платформе)."
          />
          <StatCard
            title="Среднее на ролик"
            value={formatViews(d.avgPerVideo)}
            icon={<TrendingUp className="w-4 h-4" style={{ color: "#059669" }} />}
            subtitle={`на один из ${d.activeVideos} активных`}
            help="Прирост просмотров, делённый на количество роликов у которых вообще был рост в этом периоде."
          />
          <StatCard
            title="Активных платформ"
            value={d.activePlatforms}
            icon={<LayoutGrid className="w-4 h-4" style={{ color: "#D97706" }} />}
            subtitle="TT, Instagram, YouTube"
            mono={false}
            help="Сколько платформ из TikTok / Instagram / YouTube принесли хотя бы один новый просмотр."
          />
        </div>
      )}

      {/* Line chart */}
      {loading ? (
        <ChartSkeleton height={320} />
      ) : (
        <div
          className="rounded-xl p-5"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
          }}
        >
          <div className="flex items-center gap-1.5 mb-5">
            <h2 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              Прирост просмотров по дням
            </h2>
            <div className="relative group">
              <HelpCircle className="w-3.5 h-3.5 cursor-help" style={{ color: "var(--text-disabled)" }} />
              <div
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 max-w-[280px] w-max rounded-lg px-3 py-2 text-xs leading-relaxed pointer-events-none"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-secondary)",
                  boxShadow: "var(--shadow-card)",
                }}
              >
                Данные обновляются раз в сутки. Прирост за сегодня появится завтра около 00:00 МСК.
              </div>
            </div>
          </div>
          <div className="relative">
            {!hasRealData && !isEmpty && (
              <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                <span
                  className="text-xs px-3 py-1.5 rounded-lg"
                  style={{
                    background: "var(--accent-muted)",
                    color: "var(--accent-primary)",
                    border: "1px solid var(--accent-border)",
                  }}
                >
                  🎬 ДЕМО — данных за этот период пока нет
                </span>
              </div>
            )}
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDateShort}
                tick={{ fill: "var(--text-disabled)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval={chartData.length <= 14 ? 0 : Math.ceil(chartData.length / 10) - 1}
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
                formatter={(v) => [formatViews(Number(v)), "Прирост"]}
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
        </div>
      )}

      <WeeklyPatternsWidget />

      {/* Bottom two-column row */}
      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Platform donut chart */}
          <div
            className="rounded-xl p-5"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-default)",
            }}
          >
            <h2 className="text-sm font-medium mb-4" style={{ color: "var(--text-primary)" }}>
              По платформам
            </h2>
            {donutData.length === 0 ? (
              <div
                className="flex items-center justify-center h-[200px] text-sm"
                style={{ color: "var(--text-muted)" }}
              >
                Нет данных
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div style={{ width: 180, height: 180, overflow: "visible" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                      <Pie
                        data={donutData}
                        cx="50%"
                        cy="50%"
                        innerRadius={48}
                        outerRadius={72}
                        paddingAngle={3}
                        dataKey="value"
                        strokeWidth={0}
                        label={false}
                      >
                        {donutData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(value, name) => [formatViews(Number(value)), name as string]}
                        wrapperStyle={{ overflow: "visible", zIndex: 50 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full flex flex-wrap justify-center gap-x-4 gap-y-1.5">
                  {donutData.map((p) => (
                    <div key={p.platform} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {p.name}
                      </span>
                      <span className="font-mono text-xs" style={{ color: "var(--text-primary)" }}>
                        {formatViews(p.value)}
                      </span>
                      <span className="font-mono text-[11px]" style={{ color: "var(--text-disabled)" }}>
                        {totalDonut > 0 ? `${Math.round((p.value / totalDonut) * 100)}%` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Top 5 videos */}
          <div
            className="rounded-xl p-5"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-default)",
            }}
          >
            <h2 className="text-sm font-medium mb-4" style={{ color: "var(--text-primary)" }}>
              Топ-5 роликов
            </h2>
            <div className="flex flex-col">
              {d.topVideos.slice(0, 5).map((v, i) => (
                <div
                  key={v.id}
                  className="flex items-center gap-3 py-2.5 last:border-0"
                  style={{ borderBottom: "1px solid var(--border-subtle)" }}
                >
                  <span className="text-xs font-mono w-4 shrink-0" style={{ color: "var(--text-disabled)" }}>
                    {i + 1}
                  </span>
                  <PlatformBadge platform={v.platform as Platform} size="sm" />
                  <div className="flex-1 min-w-0">
                    {isEmpty ? (
                      <span className="text-xs truncate block" style={{ color: "var(--text-muted)" }}>
                        🎬 ДЕМО
                      </span>
                    ) : (
                      <a
                        href={v.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs transition-colors truncate block"
                        style={{ color: "var(--text-muted)" }}
                        title={v.url}
                      >
                        {v.url.replace(/^https?:\/\//, "").slice(0, 36)}…
                      </a>
                    )}
                    <span className="text-[10px]" style={{ color: "var(--text-disabled)" }}>
                      {v.creatorName}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    <span className="font-mono text-xs" style={{ color: "var(--text-primary)" }}>
                      {formatViews(v.views)}
                    </span>
                    <span
                      className="font-mono text-[10px]"
                      style={{ color: "var(--text-disabled)" }}
                      title="Engagement Rate = (лайки + комменты) / просмотры"
                    >
                      {formatER(v.views, v.likes ?? 0, v.comments ?? 0)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardInner />
    </Suspense>
  );
}
