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

const CHART_TOOLTIP_STYLE = {
  backgroundColor: "#1a1a1a",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "8px",
  fontSize: "11px",
  color: "#ccc",
};

function ViewsChart({ data }: { data: MetricHistory[] }) {
  return (
    <div className="bg-[#111111] border border-white/[0.06] rounded-xl p-5">
      <h3 className="text-sm font-medium text-white mb-5">Динамика просмотров</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis
            dataKey="date"
            tickFormatter={(v: string) => formatDateShort(v)}
            tick={{ fill: "#555", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval={4}
          />
          <YAxis
            tickFormatter={(v: number) => formatViews(v)}
            tick={{ fill: "#555", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            labelFormatter={(v) => formatDateShort(String(v))}
            formatter={(v) => [formatViews(Number(v)), "Просмотры"]}
          />
          <Line
            type="monotone"
            dataKey="views"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "#3b82f6" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function EngagementChart({ data }: { data: MetricHistory[] }) {
  return (
    <div className="bg-[#111111] border border-white/[0.06] rounded-xl p-5">
      <h3 className="text-sm font-medium text-white mb-5">Лайки / Комменты / Сохранения</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis
            dataKey="date"
            tickFormatter={(v: string) => formatDateShort(v)}
            tick={{ fill: "#555", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval={4}
          />
          <YAxis
            tickFormatter={(v: number) => formatViews(v)}
            tick={{ fill: "#555", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            labelFormatter={(v) => formatDateShort(String(v))}
            formatter={(v, name) => [
              formatViews(Number(v)),
              name === "likes" ? "Лайки" : name === "comments" ? "Комменты" : "Сохранения",
            ]}
          />
          <Line type="monotone" dataKey="likes" stroke="#f59e0b" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          <Line type="monotone" dataKey="comments" stroke="#8b5cf6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          <Line type="monotone" dataKey="saves" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
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
        <Link href={`/creators/${video.creatorId}`} className="text-blue-400 hover:text-blue-300 transition-colors text-xs">
          {video.creatorName}
        </Link>
      ),
    },
    {
      label: "Товар",
      value: (
        <div className="flex flex-col gap-0.5 items-end">
          <Link href={`/products/${video.productId}`} className="text-blue-400 hover:text-blue-300 transition-colors text-xs text-right">
            {video.productName}
          </Link>
          <span className="font-mono text-[10px] text-[#444]">{video.wbArticle}</span>
        </div>
      ),
    },
    {
      label: "Опубликован",
      value: <span className="text-xs text-[#888]">{formatDate(video.publishedAt)}</span>,
    },
    {
      label: "Обновлено",
      value: <span className="text-xs text-[#888]">{formatDate(latest.scrapedAt)}</span>,
    },
  ];

  return (
    <div className="bg-[#111111] border border-white/[0.06] rounded-xl p-5 flex flex-col gap-4">
      <h3 className="text-sm font-medium text-white">Информация</h3>
      <div className="flex flex-col gap-3">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex items-start justify-between gap-3">
            <span className="text-xs text-[#555] shrink-0">{label}</span>
            <div className="text-right">{value}</div>
          </div>
        ))}
      </div>
      <div className="pt-2 border-t border-white/[0.06]">
        <a
          href={video.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs text-[#666] hover:text-white transition-colors group"
          title={video.url}
        >
          <ExternalLink className="w-3.5 h-3.5 shrink-0 text-[#444] group-hover:text-blue-400 transition-colors" />
          <span className="truncate">{shortUrl}</span>
        </a>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="p-6 flex flex-col gap-6">
      <Skeleton className="h-5 w-36" />
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}
      </div>
      <ChartSkeleton height={340} />
      <div className="grid grid-cols-2 gap-4">
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
      <div className="p-6 flex flex-col gap-4">
        <Link href="/videos" className="flex items-center gap-2 text-xs text-[#555] hover:text-white transition-colors w-fit">
          <ArrowLeft className="w-3.5 h-3.5" />
          Назад к роликам
        </Link>
        <div className="flex items-center justify-center h-64">
          <p className="text-sm text-[#555]">Ролик не найден</p>
        </div>
      </div>
    );
  }

  const { video, latest, history } = detail;
  const shortTitle = video.url.replace(/^https?:\/\//, "").slice(0, 52);

  return (
    <div className="p-6 flex flex-col gap-6">
      {/* Back */}
      <Link
        href="/videos"
        className="flex items-center gap-2 text-xs text-[#555] hover:text-white transition-colors w-fit"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Назад к роликам
      </Link>

      {/* Title */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <PlatformBadge platform={video.platform as Platform} size="md" />
          <span className="text-sm text-[#888] truncate font-mono">{shortTitle}</span>
        </div>
        <a
          href={video.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[#888] border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] hover:text-white transition-colors shrink-0"
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
