"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Radio, Eye, EyeOff } from "lucide-react";
import { Suspense } from "react";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Пароли не совпадают.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((d as { error?: string }).error ?? "Ошибка сервера. Попробуйте позже.");
      } else {
        setDone(true);
      }
    } catch {
      setError("Сетевая ошибка. Проверьте соединение.");
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    background: "var(--surface-2)",
    border: "1px solid var(--border-default)",
    color: "var(--text-primary)",
  };

  if (!token) {
    return (
      <p className="text-sm text-center" style={{ color: "var(--error-text)" }}>
        Недействительная ссылка. Запросите сброс пароля снова.
      </p>
    );
  }

  return done ? (
    <>
      <h1 className="text-base font-medium mb-1" style={{ color: "var(--text-primary)" }}>
        Пароль изменён
      </h1>
      <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
        Новый пароль сохранён. Теперь вы можете войти.
      </p>
      <Link
        href="/login"
        className="block text-center text-sm mt-4 font-medium py-2.5 rounded-lg transition-colors duration-150"
        style={{ background: "var(--accent-primary)", color: "#fff" }}
      >
        Войти
      </Link>
    </>
  ) : (
    <>
      <h1 className="text-base font-medium mb-1" style={{ color: "var(--text-primary)" }}>
        Новый пароль
      </h1>
      <p className="text-xs mb-6" style={{ color: "var(--text-muted)" }}>
        Введите новый пароль (не менее 8 символов).
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="block text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>
            Новый пароль
          </label>
          <div className="relative">
            <input
              type={showPass ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none transition"
              style={inputStyle}
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 transition"
              style={{ color: "var(--text-disabled)" }}
            >
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>
            Повторите пароль
          </label>
          <input
            type={showPass ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none transition"
            style={inputStyle}
            placeholder="••••••••"
          />
        </div>

        {error && (
          <p
            className="text-xs rounded-lg px-3 py-2"
            style={{
              color: "var(--error-text)",
              background: "var(--error-bg)",
              border: "1px solid var(--error-border)",
            }}
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full text-sm font-medium py-2.5 rounded-lg transition-colors duration-150 mt-1 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: "var(--accent-primary)", color: "#fff" }}
          onMouseEnter={(e) => { if (!loading) (e.currentTarget.style.background = "var(--accent-hover)"); }}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent-primary)")}
        >
          {loading ? "Сохранение..." : "Сохранить пароль"}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "var(--bg-base)" }}
    >
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 justify-center mb-8">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{
              background: "var(--accent-muted)",
              border: "1px solid var(--accent-border)",
            }}
          >
            <Radio className="w-4 h-4" style={{ color: "var(--accent-primary)" }} />
          </div>
          <span className="text-lg font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
            ContentRadar
          </span>
        </div>

        <div
          className="rounded-2xl p-6"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <Suspense fallback={<p className="text-sm" style={{ color: "var(--text-muted)" }}>Загрузка...</p>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
