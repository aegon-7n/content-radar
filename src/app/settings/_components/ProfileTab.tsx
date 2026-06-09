"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Lock } from "lucide-react";
import { ToastState } from "./Toast";

interface Props {
  showToast: (msg: string, type: ToastState["type"]) => void;
}

const inputStyle: React.CSSProperties = {
  background: "var(--surface-2)",
  border: "1px solid var(--border-default)",
  color: "var(--text-primary)",
};

export default function ProfileTab({ showToast }: Props) {
  const { data: session } = useSession();
  const user = session?.user as { name?: string; email?: string } | undefined;

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      showToast("Пароли не совпадают", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Ошибка смены пароля", "error");
        return;
      }
      showToast("Пароль изменён", "success");
      setCurrent(""); setNext(""); setConfirm("");
    } catch {
      showToast("Ошибка сети", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-md">
      {/* Account info */}
      <div
        className="rounded-xl p-4"
        style={{ background: "var(--surface-1)", border: "1px solid var(--border-default)" }}
      >
        <p className="text-xs font-medium uppercase tracking-wide mb-3" style={{ color: "var(--text-muted)" }}>
          Аккаунт
        </p>
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {user?.name ?? "—"}
          </p>
          <p className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
            {user?.email ?? "—"}
          </p>
        </div>
      </div>

      {/* Change password */}
      <form onSubmit={handleSubmit}>
        <div
          className="rounded-xl p-4 flex flex-col gap-4"
          style={{ background: "var(--surface-1)", border: "1px solid var(--border-default)" }}
        >
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
            <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Сменить пароль
            </p>
          </div>

          {[
            { label: "Текущий пароль", value: current, set: setCurrent },
            { label: "Новый пароль", value: next, set: setNext },
            { label: "Повтор нового пароля", value: confirm, set: setConfirm },
          ].map(({ label, value, set }) => (
            <div key={label} className="flex flex-col gap-1.5">
              <label className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</label>
              <input
                type="password"
                value={value}
                onChange={(e) => set(e.target.value)}
                required
                className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-1"
                style={{ ...inputStyle, focusRingColor: "var(--accent-primary)" } as React.CSSProperties}
                autoComplete="current-password"
              />
            </div>
          ))}

          <button
            type="submit"
            disabled={saving || !current || !next || !confirm}
            className="w-full py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-40"
            style={{ background: "var(--accent-primary)", color: "#fff" }}
          >
            {saving ? "Сохраняем..." : "Изменить пароль"}
          </button>
        </div>
      </form>
    </div>
  );
}
