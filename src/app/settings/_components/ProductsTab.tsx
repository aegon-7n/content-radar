"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, AlertCircle } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { ToastState } from "./Toast";

interface Product {
  id: string;
  name: string;
  wbArticle: string;
  category: string | null;
  needsReview: number;
  videoCount: number;
}

interface ProductsTabProps {
  showToast: (msg: string, type: ToastState["type"]) => void;
}

const EMPTY_FORM = { name: "", wbArticle: "", category: "" };

export default function ProductsTab({ showToast }: ProductsTabProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [categories, setCategories] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/products");
      const data = await res.json();
      const prods: Product[] = data.products ?? [];
      setProducts(prods);
      // Collect unique categories from existing products
      const cats = Array.from(new Set(prods.map((p) => p.category).filter(Boolean) as string[])).sort();
      setCategories(cats);
    } catch {
      showToast("Не удалось загрузить список товаров", "error");
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

  function openEdit(p: Product) {
    setEditing(p);
    setForm({ name: p.needsReview ? "" : p.name, wbArticle: p.wbArticle, category: p.category ?? "" });
    setModalOpen(true);
  }

  const isValid = form.name.trim() && /^\d+$/.test(form.wbArticle.trim());

  async function handleSave() {
    if (!isValid) return;
    setSaving(true);
    try {
      const url = editing
        ? `/api/settings/products/${editing.id}`
        : "/api/settings/products";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name.trim(), wbArticle: form.wbArticle.trim(), category: form.category.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Ошибка сохранения", "error");
        return;
      }
      showToast(editing ? "Товар обновлён" : "Товар добавлен", "success");
      setModalOpen(false);
      load();
    } catch {
      showToast("Ошибка сети", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(p: Product) {
    if (!window.confirm(`Удалить "${p.name}"?`)) return;
    try {
      const res = await fetch(`/api/settings/products/${p.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Ошибка удаления", "error");
        return;
      }
      showToast("Товар удалён", "success");
      load();
    } catch {
      showToast("Ошибка сети", "error");
    }
  }

  const needsReview = products.filter((p) => p.needsReview);
  const normal = products.filter((p) => !p.needsReview);

  return (
    <div className="flex flex-col gap-6">
      {/* Блок товаров требующих проверки */}
      {needsReview.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-medium text-amber-400">
              Требуют проверки — {needsReview.length}
            </h2>
          </div>
          <p className="text-xs text-[#555] mb-3">
            Эти товары найдены автоматически по артикулу из описания ролика. Добавь название.
          </p>
          <div className="bg-[#111111] border border-amber-500/20 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-[#555]">Артикул WB</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-[#555]">Роликов</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-[#555]">Действие</th>
                </tr>
              </thead>
              <tbody>
                {needsReview.map((p) => (
                  <tr key={p.id} className="border-b border-white/[0.04] last:border-0">
                    <td className="px-4 py-3 font-mono text-sm text-amber-300">{p.wbArticle}</td>
                    <td className="px-4 py-3 text-sm font-mono text-[#888]">{p.videoCount}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openEdit(p)}
                        className="px-3 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs rounded-lg transition-colors"
                      >
                        Добавить название
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Обычный список товаров */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-[#888]">
            {loading ? "..." : `${normal.length} товаров`}
          </h2>
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Добавить товар
          </button>
        </div>

        <div className="bg-[#111111] border border-white/[0.06] rounded-xl overflow-hidden">
          {loading ? (
            <div className="px-4 py-8 text-center text-sm text-[#555]">Загрузка...</div>
          ) : normal.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-[#555]">Нет товаров</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-[#555]">Название</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-[#555]">Артикул WB</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-[#555]">Категория</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-[#555]">Роликов</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-[#555]">Действия</th>
                </tr>
              </thead>
              <tbody>
                {normal.map((p) => (
                  <tr key={p.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 text-sm text-white">{p.name}</td>
                    <td className="px-4 py-3 text-sm font-mono text-[#888]">{p.wbArticle}</td>
                    <td className="px-4 py-3 text-sm text-[#666]">
                      {p.category ? (
                        <span className="px-1.5 py-0.5 bg-white/[0.05] rounded text-xs">{p.category}</span>
                      ) : <span className="text-[#333]">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-[#888]">{p.videoCount}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(p)}
                          className="p-1.5 text-[#555] hover:text-blue-400 transition-colors rounded"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(p)}
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
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? (editing.needsReview ? "Добавить название товара" : "Редактировать товар") : "Добавить товар"}
      >
        <div className="flex flex-col gap-4">
          {editing?.needsReview ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-xs text-amber-300">Артикул <span className="font-mono">{editing.wbArticle}</span> — найден автоматически</span>
            </div>
          ) : null}
          <div>
            <label className="block text-xs text-[#888] mb-1.5">
              Название <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Кошка"
              autoFocus
              className="w-full bg-[#1a1a1a] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#444] focus:outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>
          {!editing?.needsReview && (
            <div>
              <label className="block text-xs text-[#888] mb-1.5">
                Артикул WB <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={form.wbArticle}
                onChange={(e) => setForm((f) => ({ ...f, wbArticle: e.target.value.replace(/\D/g, "") }))}
                placeholder="248332917"
                className="w-full bg-[#1a1a1a] border border-white/[0.08] rounded-lg px-3 py-2 text-sm font-mono text-white placeholder:text-[#444] focus:outline-none focus:border-blue-500/50 transition-colors"
              />
            </div>
          )}
          <div>
            <label className="block text-xs text-[#888] mb-1.5">Категория</label>
            <input
              type="text"
              list="category-suggestions"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="Игрушки, Техника, Уход…"
              className="w-full bg-[#1a1a1a] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#444] focus:outline-none focus:border-blue-500/50 transition-colors"
            />
            <datalist id="category-suggestions">
              {categories.map((c) => <option key={c} value={c} />)}
            </datalist>
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
