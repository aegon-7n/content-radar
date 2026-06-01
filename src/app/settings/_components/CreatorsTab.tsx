"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Pencil, Trash2, Search, HelpCircle } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { ToastState } from "./Toast";

interface Creator {
  id: string;
  name: string;
  tiktokUsername: string | null;
  youtubeChannelId: string | null;
  youtubeHandle: string | null;
  instagramUsername: string | null;
  videoCount: number;
}

interface CreatorsTabProps {
  showToast: (msg: string, type: ToastState["type"]) => void;
}

const EMPTY_FORM = {
  name: "",
  tiktokUsername: "",
  youtubeChannelId: "",
  instagramUsername: "",
};

const inputClass = "w-full rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors";

export default function CreatorsTab({ showToast }: CreatorsTabProps) {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Creator | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [showYtTip, setShowYtTip] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/creators");
      const data = await res.json();
      setCreators(data.creators ?? []);
    } catch {
      showToast("Не удалось загрузить список креаторов", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const filteredCreators = useMemo(() => {
    if (!search) return creators;
    const q = search.toLowerCase();
    return creators.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.tiktokUsername ?? "").toLowerCase().includes(q) ||
        (c.instagramUsername ?? "").toLowerCase().includes(q)
    );
  }, [creators, search]);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(c: Creator) {
    setEditing(c);
    setForm({
      name: c.name,
      tiktokUsername: c.tiktokUsername ?? "",
      // Показываем handle если есть (то что юзер ввёл), иначе сырой UC.
      youtubeChannelId: c.youtubeHandle ?? c.youtubeChannelId ?? "",
      instagramUsername: c.instagramUsername ?? "",
    });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const url = editing
        ? `/api/settings/creators/${editing.id}`
        : "/api/settings/creators";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          tiktokUsername: form.tiktokUsername.trim().replace(/^@/, "") || null,
          youtubeChannelId: form.youtubeChannelId.trim() || null,
          instagramUsername: form.instagramUsername.trim().replace(/^@/, "") || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Ошибка сохранения", "error");
        return;
      }
      showToast(editing ? "Креатор обновлён" : "Креатор добавлен", "success");
      setModalOpen(false);
      load();
    } catch {
      showToast("Ошибка сети", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(c: Creator) {
    const hasVideos = (c.videoCount ?? 0) > 0;
    const prompt = hasVideos
      ? `У "${c.name}" уже есть ролики в истории — они останутся для аналитики, но креатор уйдёт из активного списка и со скрейпера. Продолжить?`
      : `Удалить "${c.name}"?`;
    if (!window.confirm(prompt)) return;
    try {
      const res = await fetch(`/api/settings/creators/${c.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Ошибка удаления", "error");
        return;
      }
      showToast(data.archived ? "Креатор архивирован (история сохранена)" : "Креатор удалён", "success");
      load();
    } catch {
      showToast("Ошибка сети", "error");
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-sm font-medium shrink-0" style={{ color: "var(--text-muted)" }}>
            {loading ? "..." : `${filteredCreators.length} из ${creators.length} креаторов`}
          </h2>
          <div className="relative flex-1 sm:flex-initial min-w-0">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3"
              style={{ color: "var(--text-disabled)" }}
            />
            <input
              type="text"
              placeholder="Поиск..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7 pr-3 py-1.5 rounded-lg text-xs focus:outline-none w-full sm:w-40"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
              }}
            />
          </div>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 text-xs font-medium rounded-lg transition-colors w-full sm:w-auto"
          style={{
            background: "var(--accent-primary)",
            color: "#fff",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent-primary)")}
        >
          <Plus className="w-3.5 h-3.5" />
          Добавить креатора
        </button>
      </div>

      <div
        className="rounded-xl overflow-x-auto"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-default)",
        }}
      >
        {loading ? (
          <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            Загрузка...
          </div>
        ) : creators.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            Нет креаторов
          </div>
        ) : (
          <table className="w-full min-w-[800px]">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-default)", background: "var(--bg-subtle)" }}>
                {["Имя", "TikTok", "YouTube", "Instagram", "Роликов", "Действия"].map((h, i) => (
                  <th
                    key={h}
                    className={`px-4 py-2.5 text-xs font-medium uppercase tracking-wide ${i === 5 ? "text-right" : "text-left"}`}
                    style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredCreators.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                    Креаторы не найдены
                  </td>
                </tr>
              ) : filteredCreators.map((c) => (
                <tr
                  key={c.id}
                  className="last:border-0 transition-colors"
                  style={{ borderBottom: "1px solid var(--border-subtle)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-muted)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td className="px-4 py-3 text-sm" style={{ color: "var(--text-primary)" }}>
                    {c.name}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                    {c.tiktokUsername ? `@${c.tiktokUsername}` : <span style={{ color: "var(--text-disabled)" }}>—</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                    {(c.youtubeHandle || c.youtubeChannelId) ? (
                      <span className="truncate block max-w-[120px]" title={c.youtubeChannelId ?? undefined}>{c.youtubeHandle ?? c.youtubeChannelId}</span>
                    ) : <span style={{ color: "var(--text-disabled)" }}>—</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                    {c.instagramUsername ? `@${c.instagramUsername}` : <span style={{ color: "var(--text-disabled)" }}>—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm font-mono" style={{ color: "var(--text-muted)" }}>
                    {c.videoCount}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(c)}
                        className="p-1.5 rounded transition-colors"
                        style={{ color: "var(--text-disabled)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent-primary)")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-disabled)")}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(c)}
                        className="p-1.5 rounded transition-colors"
                        style={{ color: "var(--text-disabled)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--error-text)")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-disabled)")}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Редактировать креатора" : "Добавить креатора"}
      >
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>
              Имя <span style={{ color: "var(--error-text)" }}>*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Имя креатора"
              className={inputClass}
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
              }}
            />
          </div>

          <div style={{ borderTop: "1px solid var(--border-default)", paddingTop: "1rem" }}>
            <p className="text-xs mb-3" style={{ color: "var(--text-disabled)" }}>
              Аккаунты для авто-обнаружения роликов
            </p>
            <div className="flex flex-col gap-3">
              {[
                {
                  key: "tiktokUsername",
                  label: "TikTok",
                  placeholder: "@username",
                  help: "Скопируй ник из ссылки tiktok.com/@username",
                  hasTooltip: false,
                },
                {
                  key: "youtubeChannelId",
                  label: "YouTube канал",
                  placeholder: "UC...",
                  help: "Channel ID канала — формат UC… Найти: YouTube Studio → Настройки → Сведения о канале.",
                  hasTooltip: true,
                },
                {
                  key: "instagramUsername",
                  label: "Instagram",
                  placeholder: "@username",
                  help: "Скопируй ник из ссылки instagram.com/username",
                  hasTooltip: false,
                },
              ].map(({ key, label, placeholder, help, hasTooltip }) => (
                <div key={key}>
                  <div className="flex items-center gap-1 mb-1.5">
                    <label className="block text-xs" style={{ color: "var(--text-muted)" }}>
                      {label}
                    </label>
                    {hasTooltip && (
                      <button
                        type="button"
                        aria-label="Подсказка по YouTube каналу"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowYtTip((v) => !v);
                        }}
                        onMouseEnter={() => setShowYtTip(true)}
                        onMouseLeave={() => setShowYtTip(false)}
                        className="relative inline-flex items-center justify-center"
                      >
                        <HelpCircle className="w-3.5 h-3.5 cursor-help" style={{ color: "var(--accent-primary)" }} />
                        {showYtTip && (
                          <span
                            role="tooltip"
                            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 max-w-[260px] w-max rounded-lg px-3 py-2 text-xs leading-relaxed pointer-events-none text-left"
                            style={{
                              background: "var(--surface-1)",
                              border: "1px solid var(--border-default)",
                              color: "var(--text-secondary)",
                              boxShadow: "var(--shadow-card)",
                            }}
                          >
                            Подойдёт <strong>@handle</strong>, ссылка на канал <strong>youtube.com/@…</strong> или Channel&nbsp;ID&nbsp;<strong>UC…</strong>. Мы сами найдём правильный ID.
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={form[key as keyof typeof form]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className={`${inputClass} font-mono`}
                    style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--border-default)",
                      color: "var(--text-primary)",
                    }}
                  />
                  {help && (
                    <p className="text-[10px] mt-1" style={{ color: "var(--text-disabled)" }}>
                      {help}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => setModalOpen(false)}
              className="px-3 py-1.5 text-xs transition-colors"
              style={{ color: "var(--text-muted)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
            >
              Отмена
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.name.trim()}
              className="px-4 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: "var(--accent-primary)",
                color: "#fff",
              }}
              onMouseEnter={(e) => { if (!saving && form.name.trim()) (e.currentTarget.style.background = "var(--accent-hover)"); }}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent-primary)")}
            >
              {saving ? "Сохранение..." : "Сохранить"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
