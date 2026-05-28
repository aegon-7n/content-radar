"use client";

import { Suspense, useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Users, Package, Film, Upload, CreditCard } from "lucide-react";
import Toast, { ToastState } from "./_components/Toast";
import CreatorsTab from "./_components/CreatorsTab";
import ProductsTab from "./_components/ProductsTab";
import VideosTab from "./_components/VideosTab";
import ImportTab from "./_components/ImportTab";
import BillingTab from "./_components/BillingTab";

type TabId = "creators" | "products" | "videos" | "import" | "billing";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "creators", label: "Креаторы", icon: <Users className="w-3.5 h-3.5" /> },
  { id: "products", label: "Товары", icon: <Package className="w-3.5 h-3.5" /> },
  { id: "videos", label: "Ролики", icon: <Film className="w-3.5 h-3.5" /> },
  { id: "import", label: "Импорт CSV", icon: <Upload className="w-3.5 h-3.5" /> },
  { id: "billing", label: "Подписка", icon: <CreditCard className="w-3.5 h-3.5" /> },
];

export default function SettingsPage() {
  // useSearchParams() must be wrapped in <Suspense> to avoid the CSR-bailout
  // prerender error in Next.js 14 App Router. Without this, the build fails
  // to emit .next/prerender-manifest.json and the prod app refuses to start.
  return (
    <Suspense fallback={null}>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const tab = searchParams.get("tab");
    return (tab === "billing" ? "billing" : "creators") as TabId;
  });
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((message: string, type: ToastState["type"]) => {
    setToast({ message, type, id: Date.now() });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  // Show payment success toast when redirected back from YooKassa
  useEffect(() => {
    if (searchParams.get("status") === "success") {
      showToast("Платёж получен — подписка будет активирована автоматически", "success");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="p-4 md:p-6 flex flex-col gap-4 md:gap-6 min-h-full"
      style={{ background: "var(--bg-base)" }}
    >
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Настройки
        </h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
          Управление креаторами, товарами и роликами
        </p>
      </div>

      {/* Tab bar */}
      <div
        className="flex items-center gap-1 p-1 rounded-xl w-full md:w-fit overflow-x-auto"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-default)",
        }}
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: active ? "var(--surface-3)" : "transparent",
                color: active ? "var(--text-primary)" : "var(--text-muted)",
              }}
            >
              <span style={{ color: active ? "var(--accent-primary)" : "var(--text-disabled)" }}>
                {tab.icon}
              </span>
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
        {activeTab === "billing" && <BillingTab />}
      </div>

      {/* Toast */}
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
