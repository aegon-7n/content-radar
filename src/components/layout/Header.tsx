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

  const initials = session?.user?.name
    ? session.user.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
    : "A";

  return (
    <header className="fixed top-0 left-60 right-0 h-14 bg-[#0a0a0a] border-b border-white/[0.06] flex items-center justify-between px-6 z-30">
      <span className="text-sm font-medium text-white">{title}</span>

      <div className="flex items-center gap-3">
        <button
          onClick={triggerScrape}
          disabled={scraping}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs border transition-colors duration-150 ${
            status === "ok"   ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
            : status === "error" ? "text-red-400 border-red-500/30 bg-red-500/10"
            : "text-[#888] border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] hover:text-white"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
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
              <div className="absolute right-0 top-9 z-50 w-48 bg-[#161616] border border-white/[0.08] rounded-xl shadow-2xl py-1 overflow-hidden">
                <div className="px-3 py-2 border-b border-white/[0.06]">
                  <p className="text-xs font-medium text-white truncate">{session?.user?.name ?? "Администратор"}</p>
                  <p className="text-[11px] text-[#555] truncate">{session?.user?.email ?? ""}</p>
                </div>
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[#888] hover:text-white hover:bg-white/[0.04] transition-colors"
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
