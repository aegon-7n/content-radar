"use client";

import { useState, useCallback } from "react";
import { Users, Package, Film, Upload } from "lucide-react";
import Toast, { ToastState } from "./_components/Toast";
import CreatorsTab from "./_components/CreatorsTab";
import ProductsTab from "./_components/ProductsTab";
import VideosTab from "./_components/VideosTab";
import ImportTab from "./_components/ImportTab";

type TabId = "creators" | "products" | "videos" | "import";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "creators", label: "Креаторы", icon: <Users className="w-3.5 h-3.5" /> },
  { id: "products", label: "Товары", icon: <Package className="w-3.5 h-3.5" /> },
  { id: "videos", label: "Ролики", icon: <Film className="w-3.5 h-3.5" /> },
  { id: "import", label: "Импорт CSV", icon: <Upload className="w-3.5 h-3.5" /> },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("creators");
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((message: string, type: ToastState["type"]) => {
    setToast({ message, type, id: Date.now() });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  return (
    <div className="p-6 flex flex-col gap-6 min-h-full bg-[#0a0a0a]">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-white">Настройки</h1>
        <p className="text-xs text-[#555] mt-0.5">Управление креаторами, товарами и роликами</p>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 p-1 bg-[#111111] border border-white/[0.06] rounded-xl w-fit">
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                backgroundColor: active ? "#1e1e1e" : "transparent",
                color: active ? "#fff" : "#666",
                boxShadow: active ? "0 0 0 1px rgba(255,255,255,0.06)" : "none",
              }}
            >
              <span style={{ color: active ? "#3b82f6" : "#555" }}>{tab.icon}</span>
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "creators" && <CreatorsTab showToast={showToast} />}
        {activeTab === "products" && <ProductsTab showToast={showToast} />}
        {activeTab === "videos" && <VideosTab showToast={showToast} />}
        {activeTab === "import" && <ImportTab showToast={showToast} />}
      </div>

      {/* Toast */}
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
