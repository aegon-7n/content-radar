"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, ExternalLink } from "lucide-react";
import PlatformBadge from "@/components/ui/PlatformBadge";
import { formatDate } from "@/lib/format";
import { ToastState } from "./Toast";

type Platform = "tiktok" | "youtube" | "instagram" | "likee" | "pinterest";

interface Creator { id: string; name: string }
interface Product { id: string; name: string; wbArticle: string }
interface VideoRow {
  id: string;
  url: string;
  platform: string;
  creatorName: string;
  productName: string;
  publishedAt: string;
}

interface VideosTabProps {
  showToast: (msg: string, type: ToastState["type"]) => void;
}

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "instagram", label: "Instagram" },
  { value: "likee", label: "Likee" },
  { value: "pinterest", label: "Pinterest" },
];

const EMPTY_FORM = {
  url: "",
  platform: "tiktok" as Platform,
  creatorId: "",
  productId: "",
  publishedAt: "",
};

export default function VideosTab({ showToast }: VideosTabProps) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [adding, setAdding] = useState(false);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(true);

  const loadVideos = useCallback(async () => {
    setLoadingVideos(true);
    try {
      const res = await fetch("/api/videos?limit=20&sort=date");
      const data = await res.json();
      setVideos(data.videos ?? []);
    } catch {
      showToast("Не удалось загрузить ролики", "error");
    } finally {
      setLoadingVideos(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadVideos();
    fetch("/api/settings/creators")
      .then((r) => r.json())
      .then((d) => setCreators(d.creators ?? []));
    fetch("/api/settings/products")
      .then((r) => r.json())
      .then((d) => setProducts(d.products ?? []));
  }, [loadVideos]);

  const isValid =
    form.url.trim() &&
    form.creatorId &&
    form.productId &&
    form.publishedAt;

  async function handleAdd() {
    if (!isValid) return;
    setAdding(true);
    try {
      const publishedAt = new Date(form.publishedAt).toISOString();
      const res = await fetch("/api/settings/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: form.url.trim(),
          platform: form.platform,
          creatorId: form.creatorId,
          productId: form.productId,
          publishedAt,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Ошибка добавления", "error");
        return;
      }
      showToast("Ролик добавлен", "success");
      setForm(EMPTY_FORM);
      loadVideos();
    } catch {
      showToast("Ошибка сети", "error");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(v: VideoRow) {
    if (!window.confirm(`Удалить ролик "${v.url.slice(0, 50)}"?`)) return;
    try {
      const res = await fetch(`/api/settings/videos/${v.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Ошибка удаления", "error");
        return;
      }
      showToast("Ролик удалён", "success");
      loadVideos();
    } catch {
      showToast("Ошибка сети", "error");
    }
  }

  const inputClass =
    "w-full bg-[#1a1a1a] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#444] focus:outline-none focus:border-blue-500/50 transition-colors";

  return (
    <div className="flex flex-col gap-5">
      {/* Add form */}
      <div className="bg-[#111111] border border-white/[0.06] rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Добавить ролик</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-xs text-[#888] mb-1.5">URL ролика</label>
            <input
              type="url"
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              placeholder="https://tiktok.com/@user/video/..."
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-[#888] mb-1.5">Платформа</label>
            <select
              value={form.platform}
              onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value as Platform }))}
              className={inputClass}
            >
              {PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[#888] mb-1.5">Дата публикации</label>
            <input
              type="date"
              value={form.publishedAt}
              onChange={(e) => setForm((f) => ({ ...f, publishedAt: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-[#888] mb-1.5">Креатор</label>
            <select
              value={form.creatorId}
              onChange={(e) => setForm((f) => ({ ...f, creatorId: e.target.value }))}
              className={inputClass}
            >
              <option value="">Выберите креатора</option>
              {creators.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[#888] mb-1.5">Товар</label>
            <select
              value={form.productId}
              onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value }))}
              className={inputClass}
            >
              <option value="">Выберите товар</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name} {p.wbArticle}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleAdd}
            disabled={adding || !isValid}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {adding ? "Добавление..." : "Добавить ролик"}
          </button>
        </div>
      </div>

      {/* Recent videos table */}
      <div className="bg-[#111111] border border-white/[0.06] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <h2 className="text-sm font-semibold text-white">Последние ролики</h2>
        </div>
        {loadingVideos ? (
          <div className="px-4 py-8 text-center text-sm text-[#555]">Загрузка...</div>
        ) : videos.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-[#555]">Нет роликов</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-[#555]">Платформа</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-[#555]">URL</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-[#555]">Креатор</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-[#555]">Товар</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-[#555]">Дата</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-[#555]"></th>
              </tr>
            </thead>
            <tbody>
              {videos.map((v) => (
                <tr key={v.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <PlatformBadge platform={v.platform as Platform} size="sm" />
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={v.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-[#888] hover:text-blue-400 transition-colors group"
                      title={v.url}
                    >
                      <span className="truncate max-w-[200px]">
                        {v.url.replace(/^https?:\/\//, "").slice(0, 40)}
                      </span>
                      <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 shrink-0" />
                    </a>
                  </td>
                  <td className="px-4 py-3 text-sm text-[#888]">{v.creatorName}</td>
                  <td className="px-4 py-3 text-sm text-[#888]">{v.productName}</td>
                  <td className="px-4 py-3 text-xs font-mono text-[#666]">
                    {formatDate(v.publishedAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(v)}
                      className="p-1.5 text-[#555] hover:text-red-400 transition-colors rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
