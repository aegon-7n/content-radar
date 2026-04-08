"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { ToastState } from "./Toast";

interface Creator {
  id: string;
  name: string;
  tiktokUsername: string | null;
  youtubeChannelId: string | null;
  videoCount: number;
}

interface CreatorsTabProps {
  showToast: (msg: string, type: ToastState["type"]) => void;
}

const EMPTY_FORM = { name: "", tiktokUsername: "", youtubeChannelId: "" };

export default function CreatorsTab({ showToast }: CreatorsTabProps) {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Creator | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

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
      youtubeChannelId: c.youtubeChannelId ?? "",
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
    if (!window.confirm(`Удалить "${c.name}"?`)) return;
    try {
      const res = await fetch(`/api/settings/creators/${c.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Ошибка удаления", "error");
        return;
      }
      showToast("Креатор удалён", "success");
      load();
    } catch {
      showToast("Ошибка сети", "error");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-[#888]">
          {loading ? "..." : `${creators.length} креаторов`}
        </h2>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Добавить креатора
        </button>
      </div>

      <div className="bg-[#111111] border border-white/[0.06] rounded-xl overflow-hidden">
        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-[#555]">Загрузка...</div>
        ) : creators.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-[#555]">Нет креаторов</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-[#555]">Имя</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-[#555]">TikTok</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-[#555]">YouTube</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-[#555]">Роликов</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-[#555]">Действия</th>
              </tr>
            </thead>
            <tbody>
              {creators.map((c) => (
                <tr key={c.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 text-sm text-white">{c.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[#555]">
                    {c.tiktokUsername ? `@${c.tiktokUsername}` : <span className="text-[#333]">—</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[#555]">
                    {c.youtubeChannelId ? (
                      <span className="truncate block max-w-[140px]">{c.youtubeChannelId}</span>
                    ) : <span className="text-[#333]">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-[#888]">{c.videoCount}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(c)}
                        className="p-1.5 text-[#555] hover:text-blue-400 transition-colors rounded"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(c)}
                        className="p-1.5 text-[#555] hover:text-red-400 transition-colors rounded"
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
            <label className="block text-xs text-[#888] mb-1.5">
              Имя <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Имя креатора"
              className="w-full bg-[#1a1a1a] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#444] focus:outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>

          <div className="border-t border-white/[0.06] pt-4">
            <p className="text-xs text-[#555] mb-3">Аккаунты для авто-обнаружения роликов</p>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-xs text-[#888] mb-1.5">TikTok</label>
                <input
                  type="text"
                  value={form.tiktokUsername}
                  onChange={(e) => setForm((f) => ({ ...f, tiktokUsername: e.target.value }))}
                  placeholder="@username"
                  className="w-full bg-[#1a1a1a] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#444] focus:outline-none focus:border-blue-500/50 transition-colors font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-[#888] mb-1.5">YouTube</label>
                <input
                  type="text"
                  value={form.youtubeChannelId}
                  onChange={(e) => setForm((f) => ({ ...f, youtubeChannelId: e.target.value }))}
                  placeholder="@username"
                  className="w-full bg-[#1a1a1a] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#444] focus:outline-none focus:border-blue-500/50 transition-colors font-mono"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => setModalOpen(false)}
              className="px-3 py-1.5 text-xs text-[#888] hover:text-white transition-colors"
            >
              Отмена
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.name.trim()}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors"
            >
              {saving ? "Сохранение..." : "Сохранить"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
