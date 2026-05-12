"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Radio, Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (res?.ok) {
      router.push("/");
      router.refresh();
    } else {
      setError("Неверный email или пароль");
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
            Вход в систему
          </h1>
          <p className="text-xs mb-6" style={{ color: "var(--text-muted)" }}>
            Аналитика контента для товарного бизнеса
          </p>

          <div
            className="text-xs rounded-lg px-3 py-2.5 mb-4"
            style={{
              background: "var(--accent-muted)",
              border: "1px solid var(--accent-border)",
              color: "var(--text-secondary)",
            }}
          >
            Доступ по приглашению.{" "}
            <a
              href="https://contentradar.app/#waitlist"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--accent-primary)" }}
              className="underline underline-offset-2 hover:no-underline"
            >
              Оставить заявку на waitlist
            </a>
          </div>

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
                style={inputStyle}
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>
                Пароль
              </label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="w-full rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none transition"
                  style={inputStyle}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition"
                  style={{ color: "var(--text-disabled)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-disabled)")}
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
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
              style={{
                background: "var(--accent-primary)",
                color: "#fff",
              }}
              onMouseEnter={(e) => { if (!loading) (e.currentTarget.style.background = "var(--accent-hover)"); }}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent-primary)")}
            >
              {loading ? "Вход..." : "Войти"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
