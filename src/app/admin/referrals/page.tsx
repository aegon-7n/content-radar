"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Copy, Check } from "lucide-react";
import { formatDate } from "@/lib/format";

interface ReferralCode {
  code: string;
  partnerName: string;
  usedCount: number;
  createdAt: string;
}

export default function ReferralsPage() {
  const [codes, setCodes] = useState<ReferralCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newPartner, setNewPartner] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    loadCodes();
  }, []);

  async function loadCodes() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/referral-codes");
      const data = (await res.json()) as { codes?: ReferralCode[]; error?: string };
      if (res.ok && data.codes) {
        setCodes(data.codes);
      } else {
        setError(data.error ?? "Ошибка загрузки");
      }
    } catch {
      setError("Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setCreating(true);
    try {
      const res = await fetch("/api/admin/referral-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: newCode.toUpperCase(), partnerName: newPartner }),
      });
      const data = (await res.json()) as { code?: ReferralCode; error?: string };
      if (res.ok && data.code) {
        setCodes((prev) => [data.code!, ...prev]);
        setNewCode("");
        setNewPartner("");
        setShowForm(false);
      } else {
        setFormError(data.error ?? "Ошибка создания");
      }
    } catch {
      setFormError("Ошибка создания");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(code: string) {
    if (!confirm(`Удалить промокод ${code}?`)) return;
    await fetch(`/api/admin/referral-codes?code=${encodeURIComponent(code)}`, {
      method: "DELETE",
    });
    setCodes((prev) => prev.filter((c) => c.code !== code));
  }

  async function handleCopy(code: string) {
    await navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  }

  const inputStyle = {
    background: "var(--surface-2)",
    border: "1px solid var(--border-default)",
    color: "var(--text-primary)",
  };

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 md:gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Реферальные коды
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            Промокоды для партнёров — атрибуция заявок с waitlist
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
          style={{ background: "var(--accent-primary)", color: "#fff" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "var(--accent-hover)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "var(--accent-primary)";
          }}
        >
          <Plus className="w-3.5 h-3.5" />
          Создать код
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div
          className="rounded-xl p-4"
          style={{ background: "var(--surface-1)", border: "1px solid var(--border-default)" }}
        >
          <h2 className="text-sm font-medium mb-3" style={{ color: "var(--text-primary)" }}>
            Новый промокод
          </h2>
          <form onSubmit={handleCreate} className="flex flex-col gap-3 max-w-sm">
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
                Код (только заглавные буквы, цифры, - и _)
              </label>
              <input
                type="text"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                required
                minLength={2}
                maxLength={64}
                pattern="[A-Z0-9_-]+"
                placeholder="TIMOFEY30"
                className="w-full rounded-lg px-3 py-2 text-sm font-mono focus:outline-none"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
                Имя партнёра
              </label>
              <input
                type="text"
                value={newPartner}
                onChange={(e) => setNewPartner(e.target.value)}
                required
                maxLength={200}
                placeholder="Тимофей"
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={inputStyle}
              />
            </div>
            {formError && (
              <p className="text-xs" style={{ color: "var(--error-text, #f87171)" }}>{formError}</p>
            )}
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={creating}
                className="px-4 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                style={{ background: "var(--accent-primary)", color: "#fff" }}
              >
                {creating ? "Создание..." : "Создать"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg text-xs border transition-colors"
                style={{
                  color: "var(--text-muted)",
                  borderColor: "var(--border-default)",
                  background: "var(--bg-muted)",
                }}
              >
                Отмена
              </button>
            </div>
          </form>
        </div>
      )}

      {error && (
        <p className="text-sm" style={{ color: "var(--error-text, #f87171)" }}>{error}</p>
      )}

      {/* Table */}
      <div
        className="rounded-xl overflow-x-auto"
        style={{ background: "var(--surface-1)", border: "1px solid var(--border-default)" }}
      >
        {loading ? (
          <div className="p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            Загрузка...
          </div>
        ) : codes.length === 0 ? (
          <div className="p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            Промокоды не созданы. Создайте первый код для партнёра.
          </div>
        ) : (
          <table className="w-full min-w-[500px]">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-default)", background: "var(--bg-subtle)" }}>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)" }}>Код</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)" }}>Партнёр</th>
                <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)" }}>Использований</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)" }}>Создан</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => (
                <tr
                  key={c.code}
                  className="last:border-0 transition-colors"
                  style={{ borderBottom: "1px solid var(--border-subtle)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-muted)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                        {c.code}
                      </span>
                      <button
                        onClick={() => handleCopy(c.code)}
                        className="transition-colors"
                        style={{ color: "var(--text-disabled)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-disabled)")}
                        title="Копировать код"
                      >
                        {copiedCode === c.code
                          ? <Check className="w-3.5 h-3.5" style={{ color: "var(--success-text, #4ade80)" }} />
                          : <Copy className="w-3.5 h-3.5" />
                        }
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: "var(--text-muted)" }}>
                    {c.partnerName}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className="font-mono text-sm font-semibold"
                      style={{ color: c.usedCount > 0 ? "var(--accent-primary)" : "var(--text-disabled)" }}
                    >
                      {c.usedCount}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--text-disabled)" }}>
                    {formatDate(c.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(c.code)}
                      className="transition-colors"
                      style={{ color: "var(--text-disabled)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--error-text, #f87171)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-disabled)")}
                      title="Удалить"
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
