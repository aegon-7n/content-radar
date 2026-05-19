"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Users,
  Package,
  Video,
  Settings,
  Radio,
  Inbox,
  X,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Дашборд", icon: LayoutDashboard },
  { href: "/creators", label: "Креаторы", icon: Users },
  { href: "/products", label: "Товары", icon: Package },
  { href: "/videos", label: "Ролики", icon: Video },
  { href: "/settings", label: "Настройки", icon: Settings },
  { href: "/admin/waitlist", label: "Waitlist", icon: Inbox },
];

function formatLastSync(iso: string | null): string {
  if (!iso) return "нет данных";
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
    timeZone: "Europe/Moscow",
  });
}

type HealthJob = {
  name: string;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  status: string;
  stale: boolean;
};
type HealthPayload = {
  status: "ok" | "degraded" | "error";
  lastMetricAt: string | null;
  jobs: HealthJob[];
};

type SidebarProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const [health, setHealth] = useState<HealthPayload | null>(null);

  useEffect(() => {
    const load = () =>
      fetch("/api/health")
        .then((r) => r.json())
        .then((d) => setHealth(d))
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    onClose();
  }, [pathname, onClose]);

  const lastSync = health?.lastMetricAt ?? null;
  const overallOk = health?.status === "ok";
  const overallDegraded = health?.status === "degraded";

  return (
    <>
      {/* Overlay — mobile only */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed left-0 top-0 h-screen w-60 flex flex-col z-50
          transition-transform duration-200 ease-in-out
          md:translate-x-0
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
        `}
        style={{
          background: "var(--surface-1)",
          borderRight: "1px solid var(--border-default)",
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center justify-between px-4 h-14"
          style={{ borderBottom: "1px solid var(--border-default)" }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="flex items-center justify-center w-7 h-7 rounded-lg"
              style={{ background: "var(--accent-muted)" }}
            >
              <Radio className="w-4 h-4" style={{ color: "var(--accent-primary)" }} />
            </div>
            <span
              className="text-sm tracking-tight"
              style={{ color: "var(--text-primary)", fontWeight: 600 }}
            >
              ContentRadar
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="md:hidden p-1 rounded-md"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 flex flex-col gap-0.5 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 rounded-md text-sm transition-colors duration-150"
                style={{
                  height: "44px",
                  padding: "0 12px",
                  color: isActive ? "var(--accent-primary)" : "var(--text-muted)",
                  background: isActive ? "var(--accent-muted)" : "transparent",
                  borderLeft: isActive ? "2px solid var(--accent-primary)" : "2px solid transparent",
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
                <Icon
                  className="w-4 h-4 shrink-0"
                  style={{ color: isActive ? "var(--accent-primary)" : "var(--text-disabled)" }}
                />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Health / last sync */}
        <div
          className="px-3 pb-4 pt-2"
          style={{ borderTop: "1px solid var(--border-default)" }}
        >
          <div
            className="flex items-center gap-2 px-2 py-2 rounded-md"
            style={{
              background: "var(--bg-muted)",
              border: `1px solid ${overallDegraded ? "var(--warning-border)" : "var(--border-subtle)"}`,
            }}
            title={
              health?.jobs
                ?.map(
                  (j) =>
                    `${j.name}: ${j.status}${j.stale ? " (stale)" : ""}`
                )
                .join("\n") ?? "Загрузка..."
            }
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{
                background: overallOk
                  ? "var(--success-text)"
                  : overallDegraded
                    ? "var(--warning-text)"
                    : "var(--text-disabled)",
              }}
            />
            <div className="flex flex-col min-w-0">
              <span className="text-[10px]" style={{ color: "var(--text-disabled)" }}>
                Последнее обновление
              </span>
              <span
                className="text-[11px] font-mono"
                style={{ color: "var(--text-muted)" }}
              >
                {formatLastSync(lastSync)}
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
