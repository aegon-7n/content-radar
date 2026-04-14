"use client";

import { usePathname } from "next/navigation";
import { RefreshCw, LogOut } from "lucide-react";
import { useState } from "react";
import { useSession, signOut } from "next-auth/react";

const pageTitles: Record<string, string> = {
  "/": "Дашборд",
  "/creators": "Креаторы",
  "/products": "Товары",
  "/videos": "Ролики",
  "/settings": "Настройки",
};

export default function Header() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const title = Object.entries(pageTitles).find(([path]) =>
    path === "/" ? pathname === "/" : pathname.startsWith(path)
  )?.[1] ?? "ContentRadar";

  const [scraping, setScraping] = useState(false);
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  const [showUserMenu, setShowUserMenu] = useState(false);

  async function triggerScrape() {
    setScraping(true);
    setStatus("idle");
    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.NEXT_PUBLIC_SCRAPE_SECRET ?? "dev-secret"}` },
        body: JSON.stringify({ async: true }),
      });
      setStatus(res.ok ? "ok" : "error");
    } catch {
      setStatus("error");
    } finally {
      setScraping(false);
      setTimeout(() => setStatus("idle"), 3000);
    }
  }

  const initials = session?.user?.email
    ? session.user.email[0].toUpperCase()
    : "?";

  const scrapeButtonStyle =
    status === "ok"
      ? { color: "var(--success-text)", borderColor: "var(--success-border)", background: "var(--success-bg)" }
      : status === "error"
      ? { color: "var(--error-text)", borderColor: "var(--error-border)", background: "var(--error-bg)" }
      : { color: "var(--text-muted)", borderColor: "var(--border-default)", background: "var(--bg-muted)" };

  return (
    <header
      className="fixed top-0 left-60 right-0 h-14 flex items-center justify-between px-6 z-30 backdrop-blur"
      style={{
        background: "var(--surface-1)",
        borderBottom: "1px solid var(--border-default)",
      }}
    >
      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
        {title}
      </span>

      <div className="flex items-center gap-3">
        <button
          onClick={triggerScrape}
          disabled={scraping}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs border transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          style={scrapeButtonStyle}
          type="button"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${scraping ? "animate-spin" : ""}`} />
          {scraping ? "Запуск..." : status === "ok" ? "Запущено" : status === "error" ? "Ошибка" : "Обновить данные"}
        </button>

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
