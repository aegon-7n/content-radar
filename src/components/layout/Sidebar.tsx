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
  RefreshCw,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Дашборд", icon: LayoutDashboard },
  { href: "/creators", label: "Креаторы", icon: Users },
  { href: "/products", label: "Товары", icon: Package },
  { href: "/videos", label: "Ролики", icon: Video },
  { href: "/settings", label: "Настройки", icon: Settings },
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

export default function Sidebar() {
  const pathname = usePathname();
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/last-sync")
      .then(r => r.json())
      .then(d => setLastSync(d.lastSync ?? null))
      .catch(() => {});
  }, []);

  return (
    <aside
      className="fixed left-0 top-0 h-screen w-60 flex flex-col z-40"
      style={{
        background: "var(--surface-1)",
        borderRight: "1px solid var(--border-default)",
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-2.5 px-4 h-14"
        style={{ borderBottom: "1px solid var(--border-default)" }}
      >
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
                height: "36px",
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

      {/* Last sync */}
      <div
        className="px-3 pb-4 pt-2"
        style={{ borderTop: "1px solid var(--border-default)" }}
      >
        <div
          className="flex items-center gap-2 px-2 py-2 rounded-md"
          style={{
            background: "var(--bg-muted)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <RefreshCw className="w-3 h-3 shrink-0" style={{ color: "var(--text-disabled)" }} />
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
  );
}
