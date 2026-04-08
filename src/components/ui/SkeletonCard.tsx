import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-white/[0.04]",
        className
      )}
    />
  );
}

export function StatCardSkeleton() {
  return (
    <div className="bg-[#111111] border border-white/[0.06] rounded-xl p-5 flex flex-col gap-3">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-7 w-24" />
      <Skeleton className="h-3 w-40" />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-px">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 px-4 py-3 bg-[#111111] border border-white/[0.06] rounded-lg"
        >
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-20 ml-auto" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = 280 }: { height?: number }) {
  return (
    <div
      className="bg-[#111111] border border-white/[0.06] rounded-xl p-5 animate-pulse"
      style={{ height }}
    >
      <Skeleton className="h-4 w-40 mb-4" />
      <div className="flex items-end gap-2 h-[calc(100%-2rem)]">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 bg-white/[0.04] rounded-t-sm"
            style={{ height: `${Math.random() * 60 + 20}%` }}
          />
        ))}
      </div>
    </div>
  );
}
