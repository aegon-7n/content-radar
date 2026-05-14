"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Pencil, Trash2, AlertCircle, Search } from "lucide-react";
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

const inputStyle = {
  background: "var(--surface-2)",
  border: "1px solid var(--border-default)",
  color: "var(--text-primary)",
};

export default function ProductsTab({ showToast }: ProductsTabProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [categories, setCategories] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/products");
      const data = await res.json();
      const prods: Product[] = data.products ?? [];
      setProducts(prods);
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

  const filteredNormal = useMemo(() => {
    if (!search) return normal;
    const q = search.toLowerCase();
    return normal.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.wbArticle.includes(q) ||
        (p.category ?? "").toLowerCase().includes(q)
    );
  }, [normal, search]);

  return (
    <div className="flex flex-col gap-6">
      {/* Needs review block */}
      {needsReview.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4" style={{ color: "var(--warning-text)" }} />
            <h2 className="text-sm font-medium" style={{ color: "var(--warning-text)" }}>
              Требуют проверки — {needsReview.length}
            </h2>
          </div>
          <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
            Эти товары найдены автоматически по артикулу из описания ролика. Добавь название.
          </p>
          <div
            className="rounded-xl overflow-x-auto"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--warning-border)",
            }}
          >
            <table className="w-full min-w-[400px]">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-default)", background: "var(--bg-subtle)" }}>
                  {["Артикул WB", "Роликов", "Действие"].map((h, i) => (
                    <th
                      key={h}
                      className={`px-4 py-2.5 text-xs font-medium uppercase tracking-wide ${i === 2 ? "text-right" : "text-left"}`}
                      style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {needsReview.map((p) => (
                  <tr
                    key={p.id}
                    className="last:border-0"
                    style={{ borderBottom: "1px solid var(--border-subtle)" }}
                  >
                    <td className="px-4 py-3 font-mono text-sm" style={{ color: "var(--warning-text)" }}>
                      {p.wbArticle}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono" style={{ color: "var(--text-muted)" }}>
                      {p.videoCount}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openEdit(p)}
                        className="px-3 py-1 text-xs rounded-lg transition-colors"
                        style={{
                          background: "var(--warning-bg)",
                          color: "var(--warning-text)",
                          border: "1px solid var(--warning-border)",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
                        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
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

      {/* Normal products list */}
      <div>
        <div className="flex items-center justify-between mb-4 gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium shrink-0" style={{ color: "var(--text-muted)" }}>
              {loading ? "..." : `${filteredNormal.length} из ${normal.length} товаров`}
            </h2>
            <div className="relative">
              <Search
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3"
                style={{ color: "var(--text-disabled)" }}
              />
              <input
                type="text"
                placeholder="Поиск..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-7 pr-3 py-1.5 rounded-lg text-xs focus:outline-none"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-primary)",
                  width: "160px",
                }}
              />
            </div>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
            style={{
              background: "var(--accent-primary)",
              color: "#fff",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent-primary)")}
          >
            <Plus className="w-3.5 h-3.5" />
            Добавить товар
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
          ) : normal.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
              Нет товаров
            </div>
          ) : (
            <table className="w-full min-w-[600px]">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-default)", background: "var(--bg-subtle)" }}>
                  {["Название", "Артикул WB", "Категория", "Роликов", "Действия"].map((h, i) => (
                    <th
                      key={h}
                      className={`px-4 py-2.5 text-xs font-medium uppercase tracking-wide ${i === 4 ? "text-right" : "text-left"}`}
                      style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredNormal.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                      Товары не найдены
                    </td>
                  </tr>
                ) : filteredNormal.map((p) => (
                  <tr
                    key={p.id}
                    className="last:border-0 transition-colors"
                    style={{ borderBottom: "1px solid var(--border-subtle)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-muted)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td className="px-4 py-3 text-sm" style={{ color: "var(--text-primary)" }}>
                      {p.name}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono" style={{ color: "var(--text-muted)" }}>
                      {p.wbArticle}
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: "var(--text-muted)" }}>
                      {p.category ? (
                        <span
                          className="px-1.5 py-0.5 rounded text-xs"
                          style={{
                            background: "var(--neutral-bg)",
                            color: "var(--neutral-text)",
                          }}
                        >
                          {p.category}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-disabled)" }}>—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono" style={{ color: "var(--text-muted)" }}>
                      {p.videoCount}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(p)}
                          className="p-1.5 rounded transition-colors"
                          style={{ color: "var(--text-disabled)" }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent-primary)")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-disabled)")}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(p)}
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
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? (editing.needsReview ? "Добавить название товара" : "Редактировать товар") : "Добавить товар"}
      >
        <div className="flex flex-col gap-4">
          {editing?.needsReview ? (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{
                background: "var(--warning-bg)",
                border: "1px solid var(--warning-border)",
              }}
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--warning-text)" }} />
              <span className="text-xs" style={{ color: "var(--warning-text)" }}>
                Артикул <span className="font-mono">{editing.wbArticle}</span> — найден автоматически
              </span>
            </div>
          ) : null}

          <div>
            <label className="block text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>
              Название <span style={{ color: "var(--error-text)" }}>*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Кошка"
              autoFocus
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors"
              style={inputStyle}
            />
          </div>

          {!editing?.needsReview && (
            <div>
              <label className="block text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>
                Артикул WB <span style={{ color: "var(--error-text)" }}>*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={form.wbArticle}
                onChange={(e) => setForm((f) => ({ ...f, wbArticle: e.target.value.replace(/\D/g, "") }))}
                placeholder="248332917"
                className="w-full rounded-lg px-3 py-2 text-sm font-mono focus:outline-none transition-colors"
                style={inputStyle}
              />
            </div>
          )}

          <div>
            <label className="block text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>
              Категория
            </label>
            <input
              type="text"
              list="category-suggestions"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="Игрушки, Техника, Уход…"
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors"
              style={inputStyle}
            />
            <datalist id="category-suggestions">
              {categories.map((c) => <option key={c} value={c} />)}
            </datalist>
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
