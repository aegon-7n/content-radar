"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Package,
  Video,
  Settings,
  Radio,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Дашборд", icon: LayoutDashboard },
  { href: "/creators", label: "Креаторы", icon: Users },
  { href: "/products", label: "Товары", icon: Package },
  { href: "/videos", label: "Ролики", icon: Video },
  { href: "/settings", label: "Настройки", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 bg-[#111111] border-r border-white/[0.06] flex flex-col z-40">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-white/[0.06]">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-500/20">
          <Radio className="w-4 h-4 text-blue-400" />
        </div>
        <span className="text-sm font-semibold text-white tracking-tight">
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
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors duration-150",
                isActive
                  ? "bg-[#1f1f1f] text-white"
                  : "text-[#888] hover:text-white hover:bg-[#1a1a1a]"
              )}
            >
              <Icon
                className={cn(
                  "w-4 h-4 shrink-0",
                  isActive ? "text-white" : "text-[#666]"
                )}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom gradient fade */}
      <div className="relative">
        <div
          className="absolute -top-8 left-0 right-0 h-8 pointer-events-none"
          style={{
            background: "linear-gradient(to bottom, transparent, #111111)",
          }}
        />

        {/* Last updated */}
        <div className="px-3 pb-2 pt-1">
          <div className="flex items-center gap-2 px-2 py-2.5 rounded-md bg-white/[0.02] border border-white/[0.04]">
            <RefreshCw className="w-3.5 h-3.5 text-[#444] shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] text-[#555] font-medium">Последнее обновление</span>
              <span className="text-[11px] text-[#333] font-mono">02.04.2026, 06:00</span>
            </div>
          </div>
        </div>

        {/* Account */}
        <div className="px-3 pb-4 pt-1 border-t border-white/[0.06]">
          <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-md">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="text-xs text-white font-medium truncate">
                Аккаунт
              </span>
              <span className="text-[11px] text-[#555] truncate">
                content-radar
              </span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
