"use client";

import { usePathname } from "next/navigation";
import { LogOut, Menu } from "lucide-react";
import { useState } from "react";
import { useSession, signOut } from "next-auth/react";

const pageTitles: Record<string, string> = {
  "/": "Дашборд",
  "/creators": "Креаторы",
  "/products": "Товары",
  "/videos": "Ролики",
  "/settings": "Настройки",
};

type HeaderProps = {
  onMenuToggle: () => void;
};

export default function Header({ onMenuToggle }: HeaderProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const title = Object.entries(pageTitles).find(([path]) =>
    path === "/" ? pathname === "/" : pathname.startsWith(path)
  )?.[1] ?? "ContentRadar";

  const [showUserMenu, setShowUserMenu] = useState(false);

  const initials = session?.user?.email
    ? session.user.email[0].toUpperCase()
    : "?";

  return (
    <header
      className="fixed top-0 right-0 left-0 md:left-60 h-14 flex items-center justify-between px-4 md:px-6 z-30 backdrop-blur"
      style={{
        background: "var(--surface-1)",
        borderBottom: "1px solid var(--border-default)",
      }}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuToggle}
          className="md:hidden p-3 -ml-1 rounded-md"
          style={{ color: "var(--text-muted)" }}
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {title}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {/* User avatar + dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(v => !v)}
            className="flex items-center gap-2 group"
            type="button"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-[10px] font-bold text-white">
              {initials}
            </div>
          </button>

          {showUserMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
              <div
                className="absolute right-0 top-9 z-50 w-48 rounded-xl py-1 overflow-hidden shadow-2xl"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-default)",
                }}
              >
                <div
                  className="px-3 py-2"
                  style={{ borderBottom: "1px solid var(--border-subtle)" }}
                >
                  <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
                    {session?.user?.name ?? "Администратор"}
                  </p>
                  <p className="text-[11px] truncate" style={{ color: "var(--text-disabled)" }}>
                    {session?.user?.email ?? ""}
                  </p>
                </div>
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
                    (e.currentTarget as HTMLElement).style.background = "var(--bg-muted)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                  type="button"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Выйти
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
