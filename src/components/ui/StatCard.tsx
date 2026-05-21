"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/format";

interface StatCardProps {
  title: string;
  value: string | number;
  /** Period-over-period delta in percent. `null` = no comparable prior period. */
  change?: number | null;
  icon?: React.ReactNode;
  subtitle?: string;
  /** Tooltip text shown via info-icon popover — explains what the number means. */
  help?: string;
  mono?: boolean;
}

export default function StatCard({
  title,
  value,
  change,
  icon,
  subtitle,
  help,
  mono = true,
}: StatCardProps) {
  const [tipVisible, setTipVisible] = useState(false);
  const hasChange = change !== undefined && change !== null;
  const isPositive = hasChange && (change as number) >= 0;

  return (
    <div
      className="flex flex-col gap-3 rounded-lg"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-default)",
        boxShadow: "var(--shadow-card)",
        padding: "24px",
        borderRadius: "8px",
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span
            className="text-[13px]"
            style={{ color: "var(--text-muted)" }}
          >
            {title}
          </span>
          {help && (
            <div className="relative">
              <button
                type="button"
                onMouseEnter={(e) => {
                  setTipVisible(true);
                  (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
                }}
                onMouseLeave={(e) => {
                  setTipVisible(false);
                  (e.currentTarget as HTMLElement).style.color = "var(--text-disabled)";
                }}
                onFocus={() => setTipVisible(true)}
                onBlur={() => setTipVisible(false)}
                className="flex items-center justify-center rounded transition-colors"
                style={{ color: "var(--text-disabled)" }}
                aria-label={`Подсказка: ${title}`}
              >
                <HelpCircle className="w-3 h-3" />
              </button>
              {tipVisible && (
                <div
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 rounded-lg px-3 py-2 text-xs z-30 pointer-events-none"
                  style={{
                    background: "var(--surface-1)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-secondary)",
                    boxShadow: "var(--shadow-card)",
                    lineHeight: 1.5,
                  }}
                >
                  {help}
                  <div
                    className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0"
                    style={{
                      borderLeft: "5px solid transparent",
                      borderRight: "5px solid transparent",
                      borderTop: "5px solid var(--border-default)",
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
        {icon && (
          <div
            className="flex items-center justify-center w-8 h-8 rounded-lg"
            style={{ background: "var(--bg-muted)" }}
          >
            {icon}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span
          className={cn("leading-none", mono && "font-mono")}
          style={{
            fontSize: "30px",
            fontWeight: 700,
            color: "var(--text-primary)",
          }}
        >
          {value}
        </span>
        {subtitle && (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {subtitle}
          </span>
        )}
      </div>

      {change !== undefined && (
        hasChange ? (
          <div className="flex items-center gap-1 text-xs font-medium">
            <span
              className="inline-flex items-center justify-center w-4 h-4 rounded text-[10px] font-bold"
              style={{
                color: isPositive ? "var(--success-text)" : "var(--error-text)",
                background: isPositive ? "var(--success-bg)" : "var(--error-bg)",
              }}
            >
              {isPositive ? "↑" : "↓"}
            </span>
            <span style={{ color: isPositive ? "var(--success-text)" : "var(--error-text)" }}>
              {formatPercent(change as number)}
            </span>
          </div>
        ) : (
          <div
            className="text-xs"
            style={{ color: "var(--text-disabled)" }}
            title="За предыдущий период нет данных для сравнения"
          >
            Нет данных за прошлый период
          </div>
        )
      )}
    </div>
  );
}
