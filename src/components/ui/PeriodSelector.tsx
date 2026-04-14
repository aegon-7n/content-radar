"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Calendar, ChevronDown } from "lucide-react";

export type Period = "today" | "yesterday" | "7d" | "30d" | "90d" | "custom";

interface PeriodSelectorProps {
  value: Period;
  onChange: (period: Period) => void;
  customFrom?: string;
  customTo?: string;
  onCustomChange?: (from: string, to: string) => void;
}

const presets: { value: Period; label: string }[] = [
  { value: "today", label: "Сегодня" },
  { value: "yesterday", label: "Вчера" },
  { value: "7d", label: "7 дней" },
  { value: "30d", label: "30 дней" },
  { value: "90d", label: "90 дней" },
];

function presetLabel(period: Period, customFrom?: string, customTo?: string) {
  if (period === "custom" && customFrom && customTo) {
    return `${customFrom} — ${customTo}`;
  }
  return presets.find((p) => p.value === period)?.label ?? "Период";
}

export default function PeriodSelector({
  value,
  onChange,
  customFrom = "",
  customTo = "",
  onCustomChange,
}: PeriodSelectorProps) {
  const [open, setOpen] = useState(false);
  const [localFrom, setLocalFrom] = useState(customFrom);
  const [localTo, setLocalTo] = useState(customTo);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function applyCustom() {
    if (!localFrom || !localTo) return;
    onCustomChange?.(localFrom, localTo);
    onChange("custom");
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-default)",
          color: "var(--text-muted)",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
      >
        <Calendar className="w-3.5 h-3.5" />
        {presetLabel(value, customFrom, customTo)}
        <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 w-52 rounded-xl shadow-2xl z-50 p-1.5"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
          }}
        >
          {presets.map((opt) => {
            const isActive = value === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className="w-full text-left px-3 py-2 rounded-lg text-xs transition-colors"
                style={{
                  background: isActive ? "var(--surface-3)" : "transparent",
                  color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = "var(--bg-muted)";
                    (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                    (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
                  }
                }}
              >
                {opt.label}
              </button>
            );
          })}

          <div
            className="mt-1.5 pt-1.5 px-1"
            style={{ borderTop: "1px solid var(--border-default)" }}
          >
            <p className="text-[10px] mb-1.5 px-2" style={{ color: "var(--text-disabled)" }}>
              Произвольный период
            </p>
            <div className="flex flex-col gap-1">
              <input
                type="date"
                value={localFrom}
                max={localTo || undefined}
                onChange={(e) => setLocalFrom(e.target.value)}
                className="w-full rounded-md px-2 py-1.5 text-xs focus:outline-none transition-colors"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-primary)",
                }}
              />
              <input
                type="date"
                value={localTo}
                min={localFrom || undefined}
                onChange={(e) => setLocalTo(e.target.value)}
                className="w-full rounded-md px-2 py-1.5 text-xs focus:outline-none transition-colors"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-primary)",
                }}
              />
              <button
                disabled={!localFrom || !localTo}
                onClick={applyCustom}
                className="w-full mt-0.5 px-2 py-1.5 text-white text-xs rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "var(--accent-primary)" }}
                onMouseEnter={(e) => { if (localFrom && localTo) (e.currentTarget.style.background = "var(--accent-hover)"); }}
                onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent-primary)")}
              >
                Применить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function getPeriodDates(
  period: Period,
  customFrom?: string,
  customTo?: string
): { from: string; to: string } {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().split("T")[0];

  if (period === "custom" && customFrom && customTo) {
    return { from: customFrom, to: customTo };
  }
  if (period === "today") {
    return { from: fmt(today), to: fmt(today) };
  }
  if (period === "yesterday") {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    return { from: fmt(y), to: fmt(y) };
  }

  const from = new Date(today);
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  from.setDate(from.getDate() - days);
  return { from: fmt(from), to: fmt(today) };
}
