"use client";

import { useState } from "react";
import Link from "next/link";
import { Radio } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError((d as { error?: string }).error ?? "Ошибка сервера. Попробуйте позже.");
      } else {
        setSubmitted(true);
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
          {submitted ? (
            <>
              <h1 className="text-base font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                Письмо отправлено
              </h1>
              <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
                Если этот email зарегистрирован, вы получите ссылку для сброса пароля. Проверьте почту.
              </p>
              <Link
                href="/login"
                className="block text-center text-sm mt-4 underline underline-offset-2"
                style={{ color: "var(--accent-primary)" }}
              >
                Вернуться к входу
              </Link>
            </>
          ) : (
            <>
              <h1 className="text-base font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                Восстановление пароля
              </h1>
              <p className="text-xs mb-6" style={{ color: "var(--text-muted)" }}>
                Укажите email, и мы пришлём ссылку для сброса пароля.
              </p>

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
                  className="w-full text-sm font-medium py-2.5 rounded-lg transition-colors duration-150 mt-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: "var(--accent-primary)", color: "#fff" }}
                  onMouseEnter={(e) => { if (!loading) (e.currentTarget.style.background = "var(--accent-hover)"); }}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent-primary)")}
                >
                  {loading ? "Отправка..." : "Отправить ссылку"}
                </button>

                <Link
                  href="/login"
                  className="text-center text-xs underline underline-offset-2"
                  style={{ color: "var(--text-muted)" }}
                >
                  Вернуться к входу
                </Link>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
