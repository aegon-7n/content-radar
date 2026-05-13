"use client";

import { useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuth = pathname === "/login";
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
        <main
          className="flex-1 overflow-auto mt-14"
          style={{ background: "var(--bg-base)" }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
