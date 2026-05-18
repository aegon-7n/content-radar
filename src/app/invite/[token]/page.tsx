"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Radio, Eye, EyeOff } from "lucide-react";
import { Suspense } from "react";

type TokenMeta = {
  tenantName: string;
  inviterName: string;
  email: string | null;
};

function InviteForm() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params.token;

  const [meta, setMeta] = useState<TokenMeta | null>(null);
  const [metaError, setMetaError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/auth/invite/${token}`)
      .then((r) => r.json())
      .then((d: TokenMeta & { error?: string }) => {
        if (d.error) {
          setMetaError(d.error);
        } else {
          setMeta(d);
          if (d.email) setEmail(d.email);
        }
      })
      .catch(() => setMetaError("Не удалось загрузить приглашение."));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Пароли не совпадают.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const body: Record<string, string> = { name, password };
      if (!meta?.email) body.email = email;
      const res = await fetch(`/api/auth/invite/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((d as { error?: string }).error ?? "Ошибка сервера.");
      } else {
        setDone(true);
        setTimeout(() => router.push("/login"), 2000);
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

  if (metaError) {
    return (
      <div className="text-center">
        <p className="text-sm" style={{ color: "var(--error-text)" }}>{metaError}</p>
        <Link href="/login" className="block mt-4 text-xs underline underline-offset-2" style={{ color: "var(--text-muted)" }}>
          Вернуться ко входу
        </Link>
      </div>
    );
  }

  if (!meta) {
    return <p className="text-sm text-center" style={{ color: "var(--text-muted)" }}>Загрузка...</p>;
  }

  if (done) {
    return (
      <>
        <h1 className="text-base font-medium mb-1" style={{ color: "var(--text-primary)" }}>
          Аккаунт создан!
        </h1>
        <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
          Перенаправляем на страницу входа…
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="text-base font-medium mb-1" style={{ color: "var(--text-primary)" }}>
        Приглашение в ContentRadar
      </h1>
      <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
        {meta.inviterName} приглашает вас в команду <strong style={{ color: "var(--text-primary)" }}>{meta.tenantName}</strong>.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {!meta.email && (
          <div>
            <label className="block text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>Email</label>
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
        )}

        <div>
          <label className="block text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>Ваше имя</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none transition"
            style={inputStyle}
            placeholder="Имя Фамилия"
          />
        </div>

        <div>
          <label className="block text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>Пароль</label>
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
          <label className="block text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>Повторите пароль</label>
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
          <p className="text-xs rounded-lg px-3 py-2" style={{ color: "var(--error-text)", background: "var(--error-bg)", border: "1px solid var(--error-border)" }}>
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
          {loading ? "Создание аккаунта..." : "Создать аккаунт"}
        </button>
      </form>
    </>
  );
}

export default function InvitePage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "var(--bg-base)" }}>
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 justify-center mb-8">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--accent-muted)", border: "1px solid var(--accent-border)" }}>
            <Radio className="w-4 h-4" style={{ color: "var(--accent-primary)" }} />
          </div>
          <span className="text-lg font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>ContentRadar</span>
        </div>
        <div className="rounded-2xl p-6" style={{ background: "var(--surface-1)", border: "1px solid var(--border-default)", boxShadow: "var(--shadow-card)" }}>
          <Suspense fallback={<p className="text-sm" style={{ color: "var(--text-muted)" }}>Загрузка...</p>}>
            <InviteForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
