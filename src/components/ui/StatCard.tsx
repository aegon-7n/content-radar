import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon?: React.ReactNode;
  subtitle?: string;
  mono?: boolean;
}

export default function StatCard({
  title,
  value,
  change,
  icon,
  subtitle,
  mono = true,
}: StatCardProps) {
  const isPositive = change !== undefined && change >= 0;
  const isNegative = change !== undefined && change < 0;

  return (
    <div className="bg-[#111111] border border-white/[0.06] rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-[#888]">{title}</span>
        {icon && (
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/[0.04]">
            {icon}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span
          className={cn(
            "text-2xl font-semibold text-white leading-none",
            mono && "font-mono"
          )}
        >
          {value}
        </span>
        {subtitle && (
          <span className="text-xs text-[#555]">{subtitle}</span>
        )}
      </div>

      {change !== undefined && (
        <div
          className={cn(
            "flex items-center gap-1 text-xs font-medium",
            isPositive && "text-emerald-400",
            isNegative && "text-red-400"
          )}
        >
          <span
            className={cn(
              "inline-flex items-center justify-center w-4 h-4 rounded text-[10px] font-bold",
              isPositive && "bg-emerald-400/10",
              isNegative && "bg-red-400/10"
            )}
          >
            {isPositive ? "↑" : "↓"}
          </span>
          <span>
            {isPositive ? "+" : ""}
            {change.toFixed(1)}% к прошлому периоду
          </span>
        </div>
      )}
    </div>
  );
}
