"use client";

import { useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import TrialBanner from "@/components/ui/TrialBanner";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuth = pathname === "/login" || pathname === "/register" || pathname.startsWith("/invite/") || pathname === "/forgot-password" || pathname.startsWith("/reset-password") || pathname.startsWith("/admin");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  if (isAuth) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen" style={{ background: "var(--bg-base)" }}>
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />
      <div className="flex-1 flex flex-col md:ml-60">
        <Header onMenuToggle={toggleSidebar} />
        <div className="mt-14">
          <TrialBanner />
        </div>
        <main
          className="flex-1 overflow-auto"
          style={{ background: "var(--bg-base)" }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
