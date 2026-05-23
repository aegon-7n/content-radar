"use client";

import { useState, useEffect } from "react";
import { X, HelpCircle } from "lucide-react";

interface Props {
  tenantId: string;
  userName: string;
  onComplete: () => void;
}

type Step = 1 | 2 | 3;

export default function OnboardingWizard({ tenantId, userName, onComplete }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [creatorAdded, setCreatorAdded] = useState(false);

  // Form fields for step 2
  const [name, setName] = useState("");
  const [tiktokUsername, setTiktokUsername] = useState("");
  const [instagramUsername, setInstagramUsername] = useState("");
  const [youtubeChannelId, setYoutubeChannelId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Escape key closes wizard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleComplete();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleComplete() {
    localStorage.setItem(`onboarding_done_${tenantId}`, "1");
    if (creatorAdded) {
      window.location.reload();
    } else {
      onComplete();
    }
  }

  async function handleSubmitCreator(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const hasHandle = tiktokUsername.trim() || instagramUsername.trim() || youtubeChannelId.trim();
    if (!name.trim()) {
      setError("Имя креатора обязательно.");
      return;
    }
    if (!hasHandle) {
      setError("Укажи хотя бы один handle.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/settings/creators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          tiktokUsername: tiktokUsername.trim() || null,
          instagramUsername: instagramUsername.trim() || null,
          youtubeChannelId: youtubeChannelId.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Ошибка ${res.status}`);
        return;
      }
      setCreatorAdded(true);
      setStep(3);
    } catch {
      setError("Сетевая ошибка. Попробуй ещё раз.");
    } finally {
      setSubmitting(false);
    }
  }

  const dots: Step[] = [1, 2, 3];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={handleComplete}
    >
      <div
        className="relative w-full max-w-md rounded-2xl shadow-2xl"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-default)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 pt-5 pb-4"
          style={{ borderBottom: "1px solid var(--border-default)" }}
        >
          {/* Step indicator */}
          <div className="flex items-center gap-1.5">
            {dots.map((n) => (
              <div
                key={n}
                className="rounded-full transition-all"
                style={{
                  width: step === n ? 20 : 8,
                  height: 8,
                  background: step >= n ? "var(--accent-primary)" : "var(--border-default)",
                }}
              />
            ))}
          </div>

          {/* Close button */}
          <button
            onClick={handleComplete}
            className="p-0.5 rounded transition-colors"
            style={{ color: "var(--text-disabled)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-disabled)")}
            aria-label="Закрыть"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 pt-5 pb-7">
          {/* ── Step 1: Welcome ── */}
          {step === 1 && (
            <div className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                Привет, {userName}!
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                ContentRadar собирает аналитику с TikTok, Instagram и YouTube раз в сутки.
              </p>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                Тут вы увидите эффективность каждого <strong>креатора</strong> и каждого <strong>товара</strong>:
                сколько просмотров, какие платформы лучше заходят, кто из креаторов растёт.
                Можно принимать решения — кому добавить бюджет, кого убрать, какой товар продвигать.
              </p>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                Подключим первого креатора?
              </p>
              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={() => setStep(2)}
                  className="w-full py-2.5 rounded-lg text-sm font-medium transition-colors"
                  style={{ background: "var(--accent-primary)", color: "#fff" }}
                >
                  Поехали →
                </button>
                <button
                  onClick={handleComplete}
                  className="w-full py-2.5 rounded-lg text-sm transition-colors"
                  style={{ color: "var(--text-muted)", background: "transparent" }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "var(--surface-2)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  Пропустить — посмотрю демо
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Add creator ── */}
          {step === 2 && (
            <form onSubmit={handleSubmitCreator} className="flex flex-col gap-4">
              <div>
                <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                  Добавь первого креатора
                </h2>
                <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                  Укажи хотя бы один handle — скрейпер подхватит его ночью (~04:00 Bali / 00:00 МСК).
                </p>
              </div>

              {/* Creator name */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                  Имя креатора <span style={{ color: "var(--accent-primary)" }}>*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Полина"
                  required
                  className="px-3 py-2 rounded-lg text-sm outline-none transition-colors"
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-primary)",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent-primary)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-default)")}
                />
              </div>

              {/* TikTok */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                  TikTok username
                </label>
                <input
                  type="text"
                  value={tiktokUsername}
                  onChange={(e) => setTiktokUsername(e.target.value)}
                  placeholder="@username"
                  className="px-3 py-2 rounded-lg text-sm outline-none transition-colors"
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-primary)",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent-primary)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-default)")}
                />
              </div>

              {/* Instagram */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                  Instagram username
                </label>
                <input
                  type="text"
                  value={instagramUsername}
                  onChange={(e) => setInstagramUsername(e.target.value)}
                  placeholder="@username"
                  className="px-3 py-2 rounded-lg text-sm outline-none transition-colors"
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-primary)",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent-primary)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-default)")}
                />
              </div>

              {/* YouTube Channel ID */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1">
                  <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                    YouTube Channel ID
                  </label>
                  <div className="relative group">
                    <HelpCircle className="w-4 h-4 cursor-help" style={{ color: "var(--accent-primary)" }} />
                    <div
                      className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 max-w-[240px] w-max rounded-lg px-3 py-2 text-xs leading-relaxed pointer-events-none"
                      style={{
                        background: "var(--surface-1)",
                        border: "1px solid var(--border-default)",
                        color: "var(--text-secondary)",
                        boxShadow: "var(--shadow-card)",
                      }}
                    >
                      Найди на странице канала: youtube.com/channel/<strong>UC…</strong>. Начинается с «UC».
                    </div>
                  </div>
                </div>
                <input
                  type="text"
                  value={youtubeChannelId}
                  onChange={(e) => setYoutubeChannelId(e.target.value)}
                  placeholder="UC..."
                  className="px-3 py-2 rounded-lg text-sm outline-none transition-colors"
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-primary)",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent-primary)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-default)")}
                />
              </div>

              {error && (
                <p className="text-xs rounded-lg px-3 py-2"
                  style={{ color: "var(--error-text)", background: "var(--error-bg)", border: "1px solid var(--error-border)" }}>
                  {error}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-2.5 rounded-lg text-sm transition-colors"
                  style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
                >
                  Назад
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
                  style={{ background: "var(--accent-primary)", color: "#fff" }}
                >
                  {submitting ? "Сохраняем…" : "Добавить →"}
                </button>
              </div>
            </form>
          )}

          {/* ── Step 3: Done ── */}
          {step === 3 && (
            <div className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                Готово! 🚀
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                Данные собираются раз в сутки около 04:00 Bali (00:00 МСК). Завтра утром увидишь прирост за сегодня.
                Пока можешь изучить интерфейс на демо-данных.
              </p>
              <button
                onClick={handleComplete}
                className="w-full py-2.5 rounded-lg text-sm font-medium transition-colors"
                style={{ background: "var(--accent-primary)", color: "#fff" }}
              >
                Закрыть
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
