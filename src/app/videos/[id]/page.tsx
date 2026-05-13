"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import PlatformBadge from "@/components/ui/PlatformBadge";
import StatCard from "@/components/ui/StatCard";
import { Skeleton, StatCardSkeleton, ChartSkeleton } from "@/components/ui/SkeletonCard";
import { formatViews, formatDate, formatDateShort } from "@/lib/format";
import { MOCK_VIDEOS, type Platform } from "@/lib/mock-data";

interface MetricHistory {
  date: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
}

interface VideoDetail {
  video: {
    id: string;
    url: string;
    platform: string;
    publishedAt: string;
    creatorId: string;
    creatorName: string;
    productId: string;
    productName: string;
    wbArticle: string;
  };
  latest: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    scrapedAt: string;
  };
  history: MetricHistory[];
}

function generateHistory(base: Video): MetricHistory[] {
  const result: MetricHistory[] = [];
  const now = new Date("2026-04-02");
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const noise = 0.5 + Math.random() * 0.9;
    result.push({
      date: d.toISOString().split("T")[0],
      views: Math.round(base.views * noise * 0.08),
      likes: Math.round(base.likes * noise * 0.09),
      comments: Math.round(base.comments * noise * 0.1),
      shares: Math.round(base.shares * noise * 0.08),
      saves: Math.round(base.likes * noise * 0.05),
    });
  }
  return result;
}

type Video = (typeof MOCK_VIDEOS)[number];

function buildMock(id: string): VideoDetail | null {
  const found = MOCK_VIDEOS.find((v) => v.id === id);
  if (!found) return null;
  const history = generateHistory(found);
  return {
    video: {
      id: found.id,
      url: found.url,
      platform: found.platform,
      publishedAt: found.publishedAt,
      creatorId: found.platform === "tiktok" ? "1" : found.platform === "instagram" ? "2" : "3",
      creatorName: found.creatorName,
      productId: "p1",
      productName: found.productName,
      wbArticle: found.wbArticle,
    },
    latest: {
      views: found.views,
      likes: found.likes,
      comments: found.comments,
      shares: found.shares,
      saves: Math.round(found.likes * 0.4),
      scrapedAt: "2026-04-02T06:00:00Z",
    },
    history,
  };
}

const chartTooltipStyle = {
  backgroundColor: "var(--surface-1)",
  border: "1px solid var(--border-default)",
  borderRadius: "8px",
  fontSize: "11px",
  color: "var(--text-primary)",
};

function ViewsChart({ data }: { data: MetricHistory[] }) {
  return (
    <div
      className="rounded-xl p-5"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-default)",
      }}
    >
      <h3 className="text-sm font-medium mb-5" style={{ color: "var(--text-primary)" }}>
        Динамика просмотров
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
          <XAxis
            dataKey="date"
            tickFormatter={(v: string) => formatDateShort(v)}
            tick={{ fill: "var(--text-disabled)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval={4}
          />
          <YAxis
            tickFormatter={(v: number) => formatViews(v)}
            tick={{ fill: "var(--text-disabled)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip
            contentStyle={chartTooltipStyle}
            labelFormatter={(v) => formatDateShort(String(v))}
            formatter={(v) => [formatViews(Number(v)), "Просмотры"]}
          />
          <Line
            type="monotone"
            dataKey="views"
            stroke="var(--accent-primary)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "var(--accent-primary)" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function EngagementChart({ data }: { data: MetricHistory[] }) {
  return (
    <div
      className="rounded-xl p-5"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-default)",
      }}
    >
      <h3 className="text-sm font-medium mb-5" style={{ color: "var(--text-primary)" }}>
        Лайки / Комменты / Сохранения
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
          <XAxis
            dataKey="date"
            tickFormatter={(v: string) => formatDateShort(v)}
            tick={{ fill: "var(--text-disabled)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval={4}
          />
          <YAxis
            tickFormatter={(v: number) => formatViews(v)}
            tick={{ fill: "var(--text-disabled)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip
            contentStyle={chartTooltipStyle}
            labelFormatter={(v) => formatDateShort(String(v))}
            formatter={(v, name) => [
              formatViews(Number(v)),
              name === "likes" ? "Лайки" : name === "comments" ? "Комменты" : "Сохранения",
            ]}
          />
          <Line type="monotone" dataKey="likes" stroke="#F59E0B" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          <Line type="monotone" dataKey="comments" stroke="#8B5CF6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          <Line type="monotone" dataKey="saves" stroke="#10B981" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function MetaCard({ detail }: { detail: VideoDetail }) {
  const { video, latest } = detail;
  const shortUrl = video.url.replace(/^https?:\/\//, "").slice(0, 48);

  const rows: { label: string; value: React.ReactNode }[] = [
    {
      label: "Платформа",
      value: <PlatformBadge platform={video.platform as Platform} size="sm" />,
    },
    {
      label: "Креатор",
      value: (
        <Link
          href={`/creators/${video.creatorId}`}
          className="text-xs transition-colors"
          style={{ color: "var(--accent-text)" }}
        >
          {video.creatorName}
        </Link>
      ),
    },
    {
      label: "Товар",
      value: (
        <div className="flex flex-col gap-0.5 items-end">
          <Link
            href={`/products/${video.productId}`}
            className="text-xs text-right transition-colors"
            style={{ color: "var(--accent-text)" }}
          >
            {video.productName}
          </Link>
          <span className="font-mono text-[10px]" style={{ color: "var(--text-disabled)" }}>
            {video.wbArticle}
          </span>
        </div>
      ),
    },
    {
      label: "Опубликован",
      value: (
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {formatDate(video.publishedAt)}
        </span>
      ),
    },
    {
      label: "Обновлено",
      value: (
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {formatDate(latest.scrapedAt)}
        </span>
      ),
    },
  ];

  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-4"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-default)",
      }}
    >
      <h3 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
        Информация
      </h3>
      <div className="flex flex-col gap-3">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex items-start justify-between gap-3">
            <span className="text-xs shrink-0" style={{ color: "var(--text-disabled)" }}>
              {label}
            </span>
            <div className="text-right">{value}</div>
          </div>
        ))}
      </div>
      <div className="pt-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <a
          href={video.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs transition-colors group"
          style={{ color: "var(--text-muted)" }}
          title={video.url}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
        >
          <ExternalLink
            className="w-3.5 h-3.5 shrink-0 transition-colors"
            style={{ color: "var(--text-disabled)" }}
          />
          <span className="truncate">{shortUrl}</span>
        </a>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="p-4 md:p-4 md:p-6 flex flex-col gap-4 md:gap-6">
      <Skeleton className="h-5 w-36" />
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}
      </div>
      <ChartSkeleton height={340} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartSkeleton height={340} />
        <Skeleton className="h-[340px] rounded-xl" />
      </div>
    </div>
  );
}

export default function VideoDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [detail, setDetail] = useState<VideoDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/videos/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.video) setDetail(d);
        else setNotFound(true);
      })
      .catch(() => {
        const mock = buildMock(id);
        if (mock) setDetail(mock);
        else setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <LoadingSkeleton />;

  if (notFound || !detail) {
    return (
      <div className="p-4 md:p-6 flex flex-col gap-4">
        <Link
          href="/videos"
          className="flex items-center gap-2 text-xs transition-colors w-fit"
          style={{ color: "var(--text-muted)" }}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Назад к роликам
        </Link>
        <div className="flex items-center justify-center h-64">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Ролик не найден
          </p>
        </div>
      </div>
    );
  }

  const { video, latest, history } = detail;
  const shortTitle = video.url.replace(/^https?:\/\//, "").slice(0, 52);

  return (
    <div className="p-4 md:p-4 md:p-6 flex flex-col gap-4 md:gap-6">
      {/* Back */}
      <Link
        href="/videos"
        className="flex items-center gap-2 text-xs transition-colors w-fit"
        style={{ color: "var(--text-muted)" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Назад к роликам
      </Link>

      {/* Title */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <PlatformBadge platform={video.platform as Platform} size="md" />
          <span className="text-sm truncate font-mono" style={{ color: "var(--text-muted)" }}>
            {shortTitle}
          </span>
        </div>
        <a
          href={video.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors shrink-0"
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
          Открыть
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard title="Просмотры" value={formatViews(latest.views)} mono />
        <StatCard title="Лайки" value={formatViews(latest.likes)} mono />
        <StatCard title="Комменты" value={formatViews(latest.comments)} mono />
        <StatCard title="Сохранения" value={formatViews(latest.saves)} mono />
      </div>

      {/* Views history chart */}
      <ViewsChart data={history} />

      {/* Bottom row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <EngagementChart data={history} />
        <MetaCard detail={detail} />
      </div>
    </div>
  );
}
