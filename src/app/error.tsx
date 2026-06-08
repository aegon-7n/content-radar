"use client";

import { useEffect } from "react";

const RELOAD_FLAG = "cr_stale_deploy_reload";

function isStaleDeploy(error: Error): boolean {
  const msg = error?.message ?? "";
  return (
    msg.includes("Failed to find Server Action") ||
    msg.includes("older or newer deployment") ||
    msg.includes("This request might be from")
  );
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const stale = isStaleDeploy(error);

  useEffect(() => {
    if (!stale) return;
    try {
      const alreadyTried = sessionStorage.getItem(RELOAD_FLAG);
      if (!alreadyTried) {
        sessionStorage.setItem(RELOAD_FLAG, "1");
        window.location.reload();
      }
    } catch {
      window.location.reload();
    }
  }, [stale]);

  const handleManualReload = () => {
    try {
      sessionStorage.removeItem(RELOAD_FLAG);
    } catch { /* ignore */ }
    window.location.reload();
  };

  if (stale) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "60vh",
          gap: "12px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <p style={{ margin: 0, fontSize: "15px" }}>
          Приложение обновляется, перезагрузка…
        </p>
        <button onClick={handleManualReload} style={{ padding: "6px 16px", cursor: "pointer", borderRadius: "6px", fontSize: "13px" }}>
          Обновить вручную
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "60vh",
        gap: "12px",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <p style={{ margin: 0, fontSize: "15px" }}>Что-то пошло не так.</p>
      <div style={{ display: "flex", gap: "8px" }}>
        <button onClick={reset} style={{ padding: "6px 16px", cursor: "pointer", borderRadius: "6px", fontSize: "13px" }}>
          Попробовать снова
        </button>
        <a href="/" style={{ padding: "6px 16px", borderRadius: "6px", fontSize: "13px", textDecoration: "none" }}>
          На главную
        </a>
      </div>
    </div>
  );
}
