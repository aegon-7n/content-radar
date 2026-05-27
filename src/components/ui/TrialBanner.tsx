"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X, Zap } from "lucide-react";

interface TrialInfo {
  active: boolean;
  expired: boolean;
  daysLeft: number;
  endsAt: string;
}

// Only show the banner when ≤ 7 days left, or after expiry.
const SHOW_THRESHOLD_DAYS = 7;

export default function TrialBanner() {
  const [trial, setTrial] = useState<TrialInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch("/api/billing/status")
      .then((r) => r.json())
      .then((d) => {
        if (d?.trial) setTrial(d.trial as TrialInfo);
      })
      .catch(() => {});
  }, []);

  if (!trial) return null;
  if (dismissed) return null;

  // Don't show if user is on a paid subscription (trial.active === false, trial.expired === false)
  if (!trial.active && !trial.expired) return null;

  // Only show when ≤ 7 days left or expired
  if (trial.active && trial.daysLeft > SHOW_THRESHOLD_DAYS) return null;

  const urgent = trial.expired || trial.daysLeft <= 2;

  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-2 text-sm"
      style={{
        background: urgent ? "var(--warning-bg, #fef3c7)" : "var(--accent-muted)",
        borderBottom: `1px solid ${urgent ? "var(--warning-border, #fcd34d)" : "var(--accent-border)"}`,
        color: urgent ? "var(--warning-text, #92400e)" : "var(--accent-primary)",
      }}
    >
      <span className="flex items-center gap-2">
        {urgent ? (
          <AlertTriangle className="w-4 h-4 shrink-0" />
        ) : (
          <Zap className="w-4 h-4 shrink-0" />
        )}
        {trial.expired ? (
          <span>
            Пробный период закончился.{" "}
            <a
              href="/settings?tab=billing"
              className="font-medium underline underline-offset-2"
            >
              Выбрать тариф →
            </a>
          </span>
        ) : (
          <span>
            {trial.daysLeft === 1
              ? "Последний день пробного периода."
              : `Пробный период заканчивается через ${trial.daysLeft} дн.`}{" "}
            <a
              href="/settings?tab=billing"
              className="font-medium underline underline-offset-2"
            >
              Выбрать тариф →
            </a>
          </span>
        )}
      </span>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Закрыть"
        className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
