"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Radio, Eye, EyeOff } from "lucide-react";

function ResetPasswordInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => router.push("/login"), 3000);
      return () => clearTimeout(timer);
    }
  }, [success, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Пароли не совпадают");
      return;
    }
    if (password.length < 8) {
      setError("Пароль минимум 8 символов");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        setSuccess(true);
      } else {
        setError(data.error ?? "Произошла ошибка. Попробуйте позже.");
      }
    } catch {
      setError("Произошла ошибка. Попробуйте позже.");
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    background: "var(--surface-2)",
    border: "1px solid var(--border-default)",
    color: "var(--text-primary)",
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "var(--bg-base)" }}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
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
          <span
            className="text-lg font-semibold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            ContentRadar
          </span>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-6"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <h1 className="text-base font-medium mb-1" style={{ color: "var(--text-primary)" }}>
            Новый пароль
          </h1>
          <p className="text-xs mb-6" style={{ color: "var(--text-muted)" }}>
            Введите новый пароль для вашего аккаунта
          </p>

          {!token ? (
            <div>
              <p
                className="text-sm rounded-lg px-3 py-3 mb-4"
                style={{
                  color: "var(--error-text)",
                  background: "var(--error-bg)",
                  border: "1px solid var(--error-border)",
                }}
              >
                Ссылка недействительна. Запросите новую ссылку для сброса пароля.
              </p>
              <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
                <Link
                  href="/forgot-password"
                  className="underline underline-offset-2 hover:no-underline"
                  style={{ color: "var(--accent-primary)" }}
                >
                  Запросить снова
                </Link>
              </p>
            </div>
          ) : success ? (
            <div>
              <p
                className="text-sm rounded-lg px-3 py-3 mb-4"
                style={{
                  color: "var(--success-text, #4ade80)",
                  background: "var(--success-bg, rgba(74,222,128,0.08))",
                  border: "1px solid var(--success-border, rgba(74,222,128,0.2))",
                }}
              >
                Пароль успешно изменён. Перенаправляем на страницу входа...
              </p>
              <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
                <Link
                  href="/login"
                  className="underline underline-offset-2 hover:no-underline"
                  style={{ color: "var(--accent-primary)" }}
                >
                  Войти сейчас
                </Link>
              </p>
            </div>
          ) : (
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
                    placeholder="Минимум 8 символов"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    aria-label={showPass ? "Скрыть пароль" : "Показать пароль"}
                    className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center justify-center w-11 h-11 transition"
                    style={{ color: "var(--text-disabled)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-disabled)")}
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>
                  Подтвердите пароль
                </label>
                <input
                  type={showPass ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none transition"
                  style={inputStyle}
                  placeholder="Повторите пароль"
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
                className="w-full text-sm font-medium py-3 rounded-lg transition-colors duration-150 mt-1 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: "var(--accent-primary)",
                  color: "#fff",
                }}
                onMouseEnter={(e) => {
                  if (!loading) (e.currentTarget.style.background = "var(--accent-hover)");
                }}
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "var(--accent-primary)")
                }
              >
                {loading ? "Сохранение..." : "Сохранить пароль"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}
