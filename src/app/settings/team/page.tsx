"use client";

import { useState, useEffect, useCallback } from "react";
import { Copy, UserMinus, UserPlus, Check, Video } from "lucide-react";
import { formatNumber } from "@/lib/format";

type Member = {
  id: string;
  name: string;
  email: string;
  role: "owner" | "creator";
  createdAt: string;
};

type PendingInvite = {
  token: string;
  email: string | null;
  expiresAt: string;
  createdAt: string;
};

type TeamData = {
  members: Member[];
  pendingInvites: PendingInvite[];
  me: Member | null;
};

type CreatorQuota = {
  id: string;
  name: string;
  videoLimit: number | null;
  videosUsed: number;
  nearLimit: boolean;
  atLimit: boolean;
};

type TuData = {
  pool: number;
  used: number;
  usedPct: number;
  byCreator: CreatorQuota[];
};

// Feature flag: TU quota UI is hidden until we collect 1-2 weeks of usage data
// post-launch (2026-05-25 decision). Backend cap is live regardless.
const SHOW_TU_QUOTA = false;

export default function TeamPage() {
  const [data, setData] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tuData, setTuData] = useState<TuData | null>(null);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Quota edit state
  const [editingQuota, setEditingQuota] = useState<string | null>(null);
  const [quotaInput, setQuotaInput] = useState("");
  const [savingQuota, setSavingQuota] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [teamRes, billingRes] = await Promise.all([
        fetch("/api/invites"),
        fetch("/api/billing/status"),
      ]);
      if (!teamRes.ok) throw new Error("Ошибка загрузки");
      setData(await teamRes.json() as TeamData);
      if (billingRes.ok) {
        const billing = await billingRes.json() as { tu?: TuData };
        if (billing.tu) setTuData(billing.tu);
      }
    } catch {
      setError("Не удалось загрузить данные команды.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setInviteResult(null);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail || undefined }),
      });
      const d = await res.json() as { inviteUrl?: string; error?: string };
      if (!res.ok) {
        setError(d.error ?? "Ошибка при создании приглашения.");
      } else {
        setInviteResult({ url: d.inviteUrl! });
        setInviteEmail("");
        void fetchData();
      }
    } catch {
      setError("Сетевая ошибка.");
    } finally {
      setInviting(false);
    }
  }

  async function handleRevoke(userId: string) {
    if (!confirm("Отозвать доступ этого создателя?")) return;
    const res = await fetch(`/api/invites/${userId}`, { method: "DELETE" });
    if (res.ok) {
      void fetchData();
    } else {
      const d = await res.json().catch(() => ({})) as { error?: string };
      setError(d.error ?? "Ошибка при отзыве доступа.");
    }
  }

  async function handleSaveQuota(creatorId: string) {
    setSavingQuota(true);
    const value = quotaInput.trim() === "" ? null : parseInt(quotaInput, 10);
    if (quotaInput.trim() !== "" && (isNaN(value as number) || (value as number) < 1)) {
      setError("Лимит должен быть положительным числом.");
      setSavingQuota(false);
      return;
    }
    try {
      const res = await fetch(`/api/settings/creators/${creatorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoLimit: value }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        setError(d.error ?? "Ошибка сохранения.");
      } else {
        setEditingQuota(null);
        void fetchData();
      }
    } catch {
      setError("Сетевая ошибка.");
    } finally {
      setSavingQuota(false);
    }
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  const cardStyle = {
    background: "var(--surface-1)",
    border: "1px solid var(--border-default)",
    boxShadow: "var(--shadow-card)",
  };

  if (loading) {
    return <div className="p-6 text-sm" style={{ color: "var(--text-muted)" }}>Загрузка...</div>;
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>Команда</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          Управляйте доступом создателей к вашему аккаунту.
        </p>
      </div>

      {error && (
        <div className="text-xs rounded-lg px-3 py-2" style={{ color: "var(--error-text)", background: "var(--error-bg)", border: "1px solid var(--error-border)" }}>
          {error}
        </div>
      )}

      {/* Invite form */}
      <div className="rounded-xl p-5" style={cardStyle}>
        <h2 className="text-sm font-medium mb-3" style={{ color: "var(--text-primary)" }}>
          <UserPlus className="inline w-4 h-4 mr-1.5" style={{ color: "var(--accent-primary)" }} />
          Пригласить создателя
        </h2>
        <form onSubmit={handleInvite} className="flex gap-2">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="email (необязательно)"
            className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none transition"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
          />
          <button
            type="submit"
            disabled={inviting}
            className="px-4 py-2 text-sm font-medium rounded-lg transition-colors duration-150 disabled:opacity-50"
            style={{ background: "var(--accent-primary)", color: "#fff" }}
          >
            {inviting ? "..." : "Создать ссылку"}
          </button>
        </form>
        <p className="text-xs mt-2" style={{ color: "var(--text-disabled)" }}>
          Email необязателен. Без email создаётся общая ссылка-приглашение.
        </p>

        {inviteResult && (
          <div className="mt-3 rounded-lg px-3 py-2.5 flex items-center gap-2" style={{ background: "var(--accent-muted)", border: "1px solid var(--accent-border)" }}>
            <span className="text-xs flex-1 truncate font-mono" style={{ color: "var(--text-primary)" }}>
              {inviteResult.url}
            </span>
            <button
              onClick={() => copyUrl(inviteResult.url)}
              className="shrink-0 text-xs flex items-center gap-1 px-2 py-1 rounded transition"
              style={{ color: "var(--accent-primary)" }}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Скопировано" : "Копировать"}
            </button>
          </div>
        )}
      </div>

      {/* Members */}
      <div className="rounded-xl p-5" style={cardStyle}>
        <h2 className="text-sm font-medium mb-3" style={{ color: "var(--text-primary)" }}>Участники команды</h2>
        {(!data?.members.length) ? (
          <p className="text-sm" style={{ color: "var(--text-disabled)" }}>Нет других участников.</p>
        ) : (
          <ul className="space-y-2">
            {data.members.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-1.5">
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{m.name}</p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>{m.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{
                    background: m.role === "owner" ? "var(--accent-muted)" : "var(--surface-2)",
                    color: m.role === "owner" ? "var(--accent-primary)" : "var(--text-muted)",
                    border: `1px solid ${m.role === "owner" ? "var(--accent-border)" : "var(--border-default)"}`,
                  }}>
                    {m.role === "owner" ? "владелец" : "создатель"}
                  </span>
                  {m.role === "creator" && (
                    <button
                      onClick={() => handleRevoke(m.id)}
                      className="text-xs flex items-center gap-1 transition"
                      style={{ color: "var(--error-text)" }}
                      title="Отозвать доступ"
                    >
                      <UserMinus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* TU quota panel — temporarily hidden until we collect 1-2 weeks of real
          usage data (см. договорённость 2026-05-25). Backend monthly cap живёт,
          просто не показываем юзеру счётчик чтобы не пугать раньше времени.
          Вернуть: поменять SHOW_TU_QUOTA на true (или удалить условие). */}
      {SHOW_TU_QUOTA && tuData && (
        <div className="rounded-xl p-5" style={cardStyle}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              <Video className="inline w-4 h-4 mr-1.5" style={{ color: "var(--accent-primary)" }} />
              Квоты видео
            </h2>
            <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
              {formatNumber(tuData.used)} / {formatNumber(tuData.pool)} роликов
            </span>
          </div>

          {/* Pool usage bar */}
          <div className="mb-4">
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(tuData.usedPct, 100)}%`,
                  background: tuData.usedPct >= 100
                    ? "var(--error-text)"
                    : tuData.usedPct >= 80
                    ? "var(--warning-text)"
                    : "var(--accent-primary)",
                }}
              />
            </div>
            <p className="text-[11px] mt-1" style={{ color: "var(--text-disabled)" }}>
              {tuData.usedPct}% тарифного пула использовано
            </p>
          </div>

          {/* Per-creator rows */}
          {tuData.byCreator.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-disabled)" }}>Нет креаторов.</p>
          ) : (
            <ul className="space-y-2">
              {tuData.byCreator.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-1">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate" style={{ color: "var(--text-primary)" }}>{c.name}</p>
                    <p className="text-xs font-mono" style={{ color: c.atLimit ? "var(--error-text)" : c.nearLimit ? "var(--warning-text)" : "var(--text-disabled)" }}>
                      {formatNumber(c.videosUsed)}{c.videoLimit !== null ? ` / ${formatNumber(c.videoLimit)}` : ""} роликов
                      {c.atLimit && " · лимит"}
                      {c.nearLimit && !c.atLimit && " · >80%"}
                    </p>
                  </div>
                  {editingQuota === c.id ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        min={1}
                        value={quotaInput}
                        onChange={(e) => setQuotaInput(e.target.value)}
                        placeholder="∞"
                        className="w-16 px-2 py-1 text-xs rounded-lg outline-none"
                        style={{ background: "var(--surface-2)", border: "1px solid var(--accent-primary)", color: "var(--text-primary)" }}
                        autoFocus
                      />
                      <button
                        onClick={() => handleSaveQuota(c.id)}
                        disabled={savingQuota}
                        className="text-xs px-2 py-1 rounded-lg transition disabled:opacity-50"
                        style={{ background: "var(--accent-primary)", color: "#fff" }}
                      >
                        {savingQuota ? "…" : "OK"}
                      </button>
                      <button
                        onClick={() => setEditingQuota(null)}
                        className="text-xs px-1.5 py-1 rounded-lg transition"
                        style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingQuota(c.id);
                        setQuotaInput(c.videoLimit !== null ? String(c.videoLimit) : "");
                      }}
                      className="text-xs shrink-0 transition"
                      style={{ color: "var(--text-disabled)" }}
                      title="Изменить лимит"
                    >
                      {c.videoLimit !== null ? `лимит: ${formatNumber(c.videoLimit)}` : "без лимита"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Pending invites */}
      {data?.pendingInvites.length ? (
        <div className="rounded-xl p-5" style={cardStyle}>
          <h2 className="text-sm font-medium mb-3" style={{ color: "var(--text-primary)" }}>Ожидающие приглашения</h2>
          <ul className="space-y-2">
            {data.pendingInvites.map((inv) => (
              <li key={inv.token} className="flex items-center justify-between">
                <div>
                  <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                    {inv.email ?? "Общая ссылка"}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-disabled)" }}>
                    Истекает: {new Date(inv.expiresAt).toLocaleDateString("ru-RU")}
                  </p>
                </div>
                <button
                  onClick={() => copyUrl(`${window.location.origin}/invite/${inv.token}`)}
                  className="text-xs flex items-center gap-1 transition"
                  style={{ color: "var(--accent-primary)" }}
                >
                  <Copy className="w-3.5 h-3.5" />
                  Скопировать
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
