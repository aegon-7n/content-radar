"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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

function detectPlatform(url: string): Platform | null {
  try {
    const hostname = new URL(url.trim()).hostname.replace(/^www\./, "");
    if (hostname.includes("tiktok.com")) return "tiktok";
    if (hostname.includes("youtube.com") || hostname === "youtu.be") return "youtube";
    if (hostname.includes("instagram.com")) return "instagram";
    // Likee + Pinterest detection отключены (не в ICP). Юзер вставивший URL
    // этих платформ получит null от detect → ошибка "не удалось определить".
    // PLATFORM_LABELS lookup для них сохранён — legacy записи в БД рендерятся
    // корректно, просто новые через UI не добавишь.
  } catch {
    // invalid URL
  }
  return null;
}

const PLATFORM_LABELS: Record<Platform, string> = {
  tiktok: "TikTok",
  youtube: "YouTube",
  instagram: "Instagram",
  likee: "Likee",
  pinterest: "Pinterest",
};

const inputStyle = {
  background: "var(--surface-2)",
  border: "1px solid var(--border-default)",
  color: "var(--text-primary)",
};

export default function VideosTab({ showToast }: VideosTabProps) {
  const [urlsText, setUrlsText] = useState("");
  const [creatorId, setCreatorId] = useState("");
  const [productId, setProductId] = useState("");
  const [adding, setAdding] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
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

  const parsedUrls = useMemo(() => {
    const seen = new Set<string>();
    return urlsText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .filter((line) => {
        if (seen.has(line)) return false;
        seen.add(line);
        return true;
      })
      .map((url) => ({ url, platform: detectPlatform(url) }));
  }, [urlsText]);

  const urlSummary = useMemo(() => {
    if (parsedUrls.length === 0) return null;
    const counts: Partial<Record<Platform, number>> = {};
    let unknown = 0;
    for (const { platform } of parsedUrls) {
      if (platform) counts[platform] = (counts[platform] ?? 0) + 1;
      else unknown++;
    }
    const parts = (Object.entries(counts) as [Platform, number][])
      .map(([p, n]) => `${n} ${PLATFORM_LABELS[p]}`);
    if (unknown > 0) parts.push(`${unknown} неизвестно`);
    return `${parsedUrls.length} ${parsedUrls.length === 1 ? "ссылка" : parsedUrls.length < 5 ? "ссылки" : "ссылок"}: ${parts.join(", ")}`;
  }, [parsedUrls]);

  const isValid = parsedUrls.length > 0 && creatorId && productId;

  async function handleAdd() {
    if (!isValid) return;
    setAdding(true);
    setProgress(null);

    const publishedAt = new Date().toISOString();
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < parsedUrls.length; i++) {
      const { url, platform } = parsedUrls[i];
      setProgress(`Добавляем ${i + 1}/${parsedUrls.length}...`);

      if (!platform) {
        errorCount++;
        continue;
      }

      try {
        const res = await fetch("/api/settings/videos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, platform, creatorId, productId, publishedAt }),
        });
        if (res.ok) successCount++;
        else errorCount++;
      } catch {
        errorCount++;
      }
    }

    setAdding(false);
    setProgress(null);

    if (errorCount === 0) {
      showToast(`Добавлено ${successCount} ${successCount === 1 ? "ролик" : successCount < 5 ? "ролика" : "роликов"}`, "success");
      setUrlsText("");
      setCreatorId("");
      setProductId("");
    } else if (successCount === 0) {
      showToast(`Ошибка: все ${errorCount} URL не удалось добавить`, "error");
    } else {
      showToast(`Добавлено ${successCount} из ${parsedUrls.length}, ${errorCount} ошибки`, "error");
      setUrlsText("");
    }

    loadVideos();
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

  const inputBase = "w-full rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors";

  return (
    <div className="flex flex-col gap-5">
      {/* Add form */}
      <div
        className="rounded-xl p-5"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-default)",
        }}
      >
        <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
          Добавить ролики
        </h2>
        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>
              URL роликов{" "}
              <span style={{ color: "var(--text-disabled)" }}>(по одному на строку)</span>
            </label>
            <textarea
              rows={5}
              value={urlsText}
              onChange={(e) => setUrlsText(e.target.value)}
              placeholder={"https://tiktok.com/@user/video/123\nhttps://youtube.com/shorts/abc\nhttps://instagram.com/reel/xyz"}
              className={`${inputBase} resize-none font-mono text-xs leading-relaxed`}
              style={inputStyle}
            />
            {urlSummary && (
              <p className="mt-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
                {urlSummary}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>
                Креатор
              </label>
              <select
                value={creatorId}
                onChange={(e) => setCreatorId(e.target.value)}
                className={inputBase}
                style={inputStyle}
              >
                <option value="">Выберите креатора</option>
                {creators.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>
                Товар
              </label>
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className={inputBase}
                style={inputStyle}
              >
                <option value="">Выберите товар</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} {p.wbArticle}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          {progress ? (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>{progress}</span>
          ) : (
            <span />
          )}
          <button
            onClick={handleAdd}
            disabled={adding || !isValid}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: "var(--accent-primary)",
              color: "#fff",
            }}
            onMouseEnter={(e) => { if (!adding && isValid) (e.currentTarget.style.background = "var(--accent-hover)"); }}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent-primary)")}
          >
            <Plus className="w-3.5 h-3.5" />
            {adding ? "Добавление..." : `Добавить${parsedUrls.length > 1 ? ` (${parsedUrls.length})` : ""}`}
          </button>
        </div>
      </div>

      {/* Recent videos table */}
      <div
        className="rounded-xl overflow-x-auto"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-default)",
        }}
      >
        <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border-default)" }}>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Последние ролики
          </h2>
        </div>
        {loadingVideos ? (
          <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            Загрузка...
          </div>
        ) : videos.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            Нет роликов
          </div>
        ) : (
          <table className="w-full min-w-[700px]">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-default)", background: "var(--bg-subtle)" }}>
                {["Платформа", "URL", "Креатор", "Товар", "Дата", ""].map((h, i) => (
                  <th
                    key={i}
                    className={`px-4 py-2.5 text-xs font-medium uppercase tracking-wide ${i === 5 ? "text-right" : "text-left"}`}
                    style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {videos.map((v) => (
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
                  <td className="px-4 py-3">
                    <a
                      href={v.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs transition-colors group"
                      style={{ color: "var(--text-muted)" }}
                      title={v.url}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent-primary)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                    >
                      <span className="truncate max-w-[200px]">
                        {v.url.replace(/^https?:\/\//, "").slice(0, 40)}
                      </span>
                      <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 shrink-0" />
                    </a>
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: "var(--text-muted)" }}>
                    {v.creatorName}
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: "var(--text-muted)" }}>
                    {v.productName}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono" style={{ color: "var(--text-disabled)" }}>
                    {formatDate(v.publishedAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(v)}
                      className="p-1.5 rounded transition-colors"
                      style={{ color: "var(--text-disabled)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--error-text)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-disabled)")}
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
