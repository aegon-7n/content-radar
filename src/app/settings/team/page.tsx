"use client";

import { useState, useEffect, useCallback } from "react";
import { Copy, UserMinus, UserPlus, Check } from "lucide-react";
import Link from "next/link";

type Member = {
  id: string;
  name: string;
  email: string;
  role: "owner" | "creator";
  creatorId: string | null;
  createdAt: string;
};

type PendingInvite = {
  token: string;
  email: string | null;
  creatorId: string | null;
  creatorName: string | null;
  expiresAt: string;
  createdAt: string;
};

type TeamData = {
  members: Member[];
  pendingInvites: PendingInvite[];
  me: Member | null;
};

type Creator = {
  id: string;
  name: string;
  videoCount: number;
};

export default function TeamPage() {
  const [data, setData] = useState<TeamData | null>(null);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Invite form state
  const [selectedCreatorId, setSelectedCreatorId] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ url: string; creatorName: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [teamRes, creatorsRes] = await Promise.all([
        fetch("/api/invites"),
        fetch("/api/settings/creators"),
      ]);
      if (!teamRes.ok) throw new Error("Ошибка загрузки");
      setData(await teamRes.json() as TeamData);
      if (creatorsRes.ok) {
        const cd = await creatorsRes.json() as { creators: Creator[] };
        setCreators(cd.creators ?? []);
      }
    } catch {
      setError("Не удалось загрузить данные команды.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  // Derive which creators already have an active user or pending invite.
  const usedCreatorIds = new Set<string>([
    ...(data?.members.map((m) => m.creatorId).filter(Boolean) as string[] ?? []),
    ...(data?.pendingInvites.map((i) => i.creatorId).filter(Boolean) as string[] ?? []),
  ]);

  const availableCreators = creators.filter((c) => !usedCreatorIds.has(c.id));

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCreatorId) {
      setError("Выберите креатора из списка.");
      return;
    }
    setInviting(true);
    setInviteResult(null);
    setError("");
    try {
      const body: Record<string, string> = { creatorId: selectedCreatorId };
      if (inviteEmail.trim()) body.email = inviteEmail.trim();

      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json() as { inviteUrl?: string; error?: string };
      if (!res.ok) {
        setError(d.error ?? "Ошибка при создании приглашения.");
      } else {
        const creatorName = creators.find((c) => c.id === selectedCreatorId)?.name ?? "";
        setInviteResult({ url: d.inviteUrl!, creatorName });
        setSelectedCreatorId("");
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

        {creators.length === 0 ? (
          <div className="rounded-lg px-3 py-3 text-sm" style={{ background: "var(--bg-muted)", border: "1px solid var(--border-default)", color: "var(--text-muted)" }}>
            Сначала{" "}
            <Link href="/settings?tab=creators" className="underline underline-offset-2" style={{ color: "var(--accent-primary)" }}>
              добавьте креатора
            </Link>{" "}
            в настройках — приглашение привязывается к конкретному аккаунту креатора.
          </div>
        ) : availableCreators.length === 0 ? (
          <div className="rounded-lg px-3 py-3 text-sm" style={{ background: "var(--bg-muted)", border: "1px solid var(--border-default)", color: "var(--text-muted)" }}>
            Все добавленные креаторы уже имеют доступ или получили приглашение.
          </div>
        ) : (
          <form onSubmit={handleInvite} className="space-y-3">
            <div>
              <label className="block text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>
                Креатор <span style={{ color: "var(--error-text)" }}>*</span>
              </label>
              <select
                value={selectedCreatorId}
                onChange={(e) => setSelectedCreatorId(e.target.value)}
                required
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none transition"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)", color: selectedCreatorId ? "var(--text-primary)" : "var(--text-disabled)" }}
              >
                <option value="">— выберите креатора —</option>
                {availableCreators.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>
                Email <span style={{ color: "var(--text-disabled)" }}>(необязательно — для отправки письма)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="creator@example.com"
                  className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none transition"
                  style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                />
                <button
                  type="submit"
                  disabled={inviting || !selectedCreatorId}
                  className="px-4 py-2 text-sm font-medium rounded-lg transition-colors duration-150 disabled:opacity-50"
                  style={{ background: "var(--accent-primary)", color: "#fff" }}
                >
                  {inviting ? "..." : "Создать ссылку"}
                </button>
              </div>
            </div>
          </form>
        )}

        {inviteResult && (
          <div className="mt-3 rounded-lg px-3 py-2.5" style={{ background: "var(--accent-muted)", border: "1px solid var(--accent-border)" }}>
            {inviteResult.creatorName && (
              <p className="text-xs mb-1.5 font-medium" style={{ color: "var(--accent-primary)" }}>
                Ссылка для {inviteResult.creatorName}
              </p>
            )}
            <div className="flex items-center gap-2">
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

      {/* Pending invites */}
      {data?.pendingInvites.length ? (
        <div className="rounded-xl p-5" style={cardStyle}>
          <h2 className="text-sm font-medium mb-3" style={{ color: "var(--text-primary)" }}>Ожидающие приглашения</h2>
          <ul className="space-y-2">
            {data.pendingInvites.map((inv) => (
              <li key={inv.token} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {inv.creatorName ?? "Неизвестный креатор"}
                  </p>
                  {inv.email && (
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>{inv.email}</p>
                  )}
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
