"use client";

import { useState } from "react";
import { Radio } from "lucide-react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail]   = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (res.ok) {
        setStatus("sent");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

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
          {status === "sent" ? (
            <div className="text-center">
              <p className="text-base font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                Запрос отправлен
              </p>
              <p className="text-xs mb-6" style={{ color: "var(--text-muted)" }}>
                Если этот email зарегистрирован, вы получите уведомление с инструкциями по восстановлению доступа.
              </p>
              <Link
                href="/login"
                className="text-xs underline underline-offset-2 hover:no-underline transition"
                style={{ color: "var(--accent-primary)" }}
              >
                Вернуться на страницу входа
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-base font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                Восстановление доступа
              </h1>
              <p className="text-xs mb-6" style={{ color: "var(--text-muted)" }}>
                Введите email — мы вышлем инструкции по сбросу пароля.
              </p>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none transition"
                    style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--border-default)",
                      color: "var(--text-primary)",
                    }}
                    placeholder="you@example.com"
                  />
                </div>

                {status === "error" && (
                  <p
                    className="text-xs rounded-lg px-3 py-2"
                    style={{
                      color: "var(--error-text)",
                      background: "var(--error-bg)",
                      border: "1px solid var(--error-border)",
                    }}
                  >
                    Произошла ошибка. Попробуйте позже.
                  </p>
                )}

                <button
                  type="submit"
                  disabled={status === "loading"}
                  className="w-full text-sm font-medium py-2.5 rounded-lg transition-colors duration-150 mt-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: "var(--accent-primary)", color: "#fff" }}
                  onMouseEnter={(e) => { if (status !== "loading") (e.currentTarget.style.background = "var(--accent-hover)"); }}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent-primary)")}
                >
                  {status === "loading" ? "Отправка..." : "Отправить инструкции"}
                </button>
              </form>

              <div className="mt-4 text-center">
                <Link
                  href="/login"
                  className="text-xs underline underline-offset-2 hover:no-underline transition"
                  style={{ color: "var(--text-muted)" }}
                >
                  Вернуться на страницу входа
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
