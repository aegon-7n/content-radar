"use client";

import { useState } from "react";
import Link from "next/link";
import { Radio } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      // Always show success regardless of result (anti-enumeration)
      setSent(true);
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
            Восстановление пароля
          </h1>
          <p className="text-xs mb-6" style={{ color: "var(--text-muted)" }}>
            Введите email, и мы пришлём ссылку для сброса пароля
          </p>

          {sent ? (
            <div>
              <p
                className="text-sm rounded-lg px-3 py-3 mb-4"
                style={{
                  color: "var(--success-text, #4ade80)",
                  background: "var(--success-bg, rgba(74,222,128,0.08))",
                  border: "1px solid var(--success-border, rgba(74,222,128,0.2))",
                }}
              >
                Если аккаунт с таким email найден, ссылка для сброса пароля уже отправлена. Проверьте почту.
              </p>
              <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
                <Link
                  href="/login"
                  className="underline underline-offset-2 hover:no-underline"
                  style={{ color: "var(--accent-primary)" }}
                >
                  Вернуться ко входу
                </Link>
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none transition"
                  style={inputStyle}
                  placeholder="you@example.com"
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
                {loading ? "Отправка..." : "Отправить ссылку"}
              </button>

              <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
                <Link
                  href="/login"
                  className="underline underline-offset-2 hover:no-underline"
                  style={{ color: "var(--text-disabled)" }}
                >
                  Вернуться ко входу
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
