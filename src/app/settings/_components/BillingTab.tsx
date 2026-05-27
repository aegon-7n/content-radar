"use client";

import { useState, useEffect } from "react";
import { Check, CreditCard, Clock, AlertTriangle } from "lucide-react";

const PLANS = [
  {
    id: "solo" as const,
    label: "Starter",
    price: "4 900",
    creators: 5,
    videos: "1 000",
    features: ["5 креаторов", "1 000 видео/мес", "3 платформы", "Ежедневные обновления"],
  },
  {
    id: "pro" as const,
    label: "Growth",
    price: "9 900",
    creators: 10,
    videos: "4 000",
    features: ["10 креаторов", "4 000 видео/мес", "3 платформы", "Приоритетная поддержка"],
    popular: true,
  },
  {
    id: "studio" as const,
    label: "Brand",
    price: "15 900",
    creators: 20,
    videos: "15 000",
    features: ["20 креаторов", "15 000 видео/мес", "3 платформы", "Выделенный менеджер"],
  },
];

interface BillingStatus {
  subscription: {
    tier: string;
    status: string;
    currentPeriodEnd?: string;
  } | null;
  payments: {
    id: string;
    tier?: string;
    amountKopecks: number;
    status: string;
    paidAt?: string;
    createdAt: string;
  }[];
  trial?: {
    active: boolean;
    expired: boolean;
    daysLeft: number;
    endsAt: string;
  };
}

function formatAmount(kopecks: number) {
  return new Intl.NumberFormat("ru-RU").format(Math.round(kopecks / 100)) + " ₽";
}

function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

function StatusBadge({ subscription, trial }: BillingStatus) {
  const sub = subscription;

  if (sub?.status === "active") {
    const plan = PLANS.find((p) => p.id === sub.tier);
    return (
      <div
        className="flex items-center gap-3 p-4 rounded-xl"
        style={{ background: "var(--success-bg, #0d2618)", border: "1px solid var(--success-border, #1a4731)" }}
      >
        <Check className="w-4 h-4 shrink-0" style={{ color: "var(--success-text, #4ade80)" }} />
        <div>
          <p className="text-sm font-medium" style={{ color: "var(--success-text, #4ade80)" }}>
            Активная подписка — {plan?.label ?? sub.tier}
          </p>
          {sub.currentPeriodEnd && (
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              Следующее списание: {formatDate(sub.currentPeriodEnd)}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (trial?.active) {
    const urgent = trial.daysLeft <= 3;
    return (
      <div
        className="flex items-center gap-3 p-4 rounded-xl"
        style={{
          background: urgent ? "var(--warning-bg, #1f1000)" : "var(--surface-2)",
          border: `1px solid ${urgent ? "var(--warning-border, #92400e)" : "var(--border-default)"}`,
        }}
      >
        <Clock className="w-4 h-4 shrink-0" style={{ color: urgent ? "var(--warning-text, #fbbf24)" : "var(--text-muted)" }} />
        <div>
          <p className="text-sm font-medium" style={{ color: urgent ? "var(--warning-text, #fbbf24)" : "var(--text-primary)" }}>
            Пробный период — осталось {trial.daysLeft} {trial.daysLeft === 1 ? "день" : trial.daysLeft < 5 ? "дня" : "дней"}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            Подпишитесь чтобы сохранить доступ после {formatDate(trial.endsAt)}
          </p>
        </div>
      </div>
    );
  }

  if (trial?.expired) {
    return (
      <div
        className="flex items-center gap-3 p-4 rounded-xl"
        style={{ background: "var(--error-bg)", border: "1px solid var(--error-border)" }}
      >
        <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: "var(--error-text)" }} />
        <div>
          <p className="text-sm font-medium" style={{ color: "var(--error-text)" }}>
            Пробный период завершён
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            Выберите план чтобы продолжить пользоваться ContentRadar
          </p>
        </div>
      </div>
    );
  }

  return null;
}

export default function BillingTab() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/billing/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setError("Не удалось загрузить данные подписки"))
      .finally(() => setLoading(false));
  }, []);

  async function subscribe(tier: "solo" | "pro" | "studio") {
    setSubscribing(tier);
    setError("");
    try {
      const res = await fetch("/api/billing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Ошибка создания платежа");
        return;
      }
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
      }
    } catch {
      setError("Ошибка сети. Попробуй ещё раз.");
    } finally {
      setSubscribing(null);
    }
  }

  const activeTier = status?.subscription?.status === "active" ? status.subscription.tier : null;

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: "var(--surface-1)" }} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {status && <StatusBadge {...status} />}

      {error && (
        <p className="text-xs px-3 py-2 rounded-lg" style={{ color: "var(--error-text)", background: "var(--error-bg)", border: "1px solid var(--error-border)" }}>
          {error}
        </p>
      )}

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PLANS.map((plan) => {
          const isActive = activeTier === plan.id;
          const isBusy = subscribing === plan.id;
          return (
            <div
              key={plan.id}
              className="flex flex-col p-5 rounded-2xl relative"
              style={{
                background: "var(--surface-1)",
                border: `1px solid ${isActive ? "var(--accent-primary)" : plan.popular ? "var(--accent-border)" : "var(--border-default)"}`,
                boxShadow: "var(--shadow-card)",
              }}
            >
              {plan.popular && !isActive && (
                <span
                  className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-xs font-medium px-2.5 py-0.5 rounded-full"
                  style={{ background: "var(--accent-primary)", color: "#fff" }}
                >
                  Популярный
                </span>
              )}
              {isActive && (
                <span
                  className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-xs font-medium px-2.5 py-0.5 rounded-full"
                  style={{ background: "var(--success-bg, #0d2618)", color: "var(--success-text, #4ade80)", border: "1px solid var(--success-border, #1a4731)" }}
                >
                  Текущий план
                </span>
              )}

              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{plan.label}</p>
              <p className="text-2xl font-bold mt-1" style={{ color: "var(--text-primary)" }}>
                {plan.price} <span className="text-sm font-normal" style={{ color: "var(--text-muted)" }}>₽/мес</span>
              </p>

              <ul className="flex flex-col gap-1.5 mt-4 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                    <Check className="w-3 h-3 shrink-0" style={{ color: "var(--accent-primary)" }} />
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => subscribe(plan.id)}
                disabled={isActive || isBusy || !!activeTier}
                className="mt-4 w-full py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: isActive ? "var(--surface-3)" : "var(--accent-primary)",
                  color: isActive ? "var(--text-muted)" : "#fff",
                }}
              >
                {isBusy ? "Создаём платёж..." : isActive ? "Текущий план" : "Подключить"}
              </button>
            </div>
          );
        })}
      </div>

      {/* Payment history */}
      {status?.payments && status.payments.length > 0 && (
        <div>
          <p className="text-xs font-medium mb-3" style={{ color: "var(--text-muted)" }}>История платежей</p>
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-default)" }}>
            {status.payments.map((p, idx) => (
              <div
                key={p.id}
                className="flex items-center justify-between px-4 py-3 text-xs"
                style={{
                  background: idx % 2 === 0 ? "var(--surface-1)" : "var(--surface-2)",
                  borderBottom: idx < status.payments.length - 1 ? "1px solid var(--border-default)" : undefined,
                }}
              >
                <div className="flex items-center gap-2">
                  <CreditCard className="w-3.5 h-3.5" style={{ color: "var(--text-disabled)" }} />
                  <span style={{ color: "var(--text-primary)" }}>
                    {PLANS.find((pl) => pl.id === p.tier)?.label ?? p.tier ?? "Платёж"}
                  </span>
                  <span style={{ color: "var(--text-disabled)" }}>{formatDate(p.paidAt ?? p.createdAt)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span style={{ color: "var(--text-primary)" }}>{formatAmount(p.amountKopecks)}</span>
                  <span
                    className="px-2 py-0.5 rounded-full"
                    style={{
                      background: p.status === "succeeded" ? "var(--success-bg, #0d2618)" : "var(--surface-3)",
                      color: p.status === "succeeded" ? "var(--success-text, #4ade80)" : "var(--text-muted)",
                    }}
                  >
                    {p.status === "succeeded" ? "оплачено" : p.status === "pending" ? "ожидание" : p.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
