"use client";

import { useEffect } from "react";

// Persists across hard-reloads within the same session — prevents infinite reload loops
// if the error survives a reload (e.g. repeated Server Action mismatch after bad deploy).
const RELOAD_FLAG = "cr_stale_deploy_reload";

function isStaleDeploy(error: Error): boolean {
  const msg = error?.message ?? "";
  return (
    msg.includes("Failed to find Server Action") ||
    msg.includes("older or newer deployment") ||
    msg.includes("This request might be from")
  );
}

export default function GlobalError({
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
      // sessionStorage unavailable (private browsing quirk) — just reload once
      window.location.reload();
    }
  }, [stale]);

  const handleManualReload = () => {
    try {
      sessionStorage.removeItem(RELOAD_FLAG);
    } catch { /* ignore */ }
    window.location.reload();
  };

  return (
    <html lang="ru">
      <body
        style={{
          margin: 0,
          background: "#09090b",
          color: "#fafafa",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          fontFamily: "system-ui, sans-serif",
          gap: "12px",
        }}
      >
        {stale ? (
          <>
            <p style={{ margin: 0, fontSize: "15px" }}>
              Приложение обновляется, перезагрузка…
            </p>
            <button
              onClick={handleManualReload}
              style={{
                padding: "6px 16px",
                cursor: "pointer",
                borderRadius: "6px",
                border: "1px solid #3f3f46",
                background: "#18181b",
                color: "#fafafa",
                fontSize: "13px",
              }}
            >
              Обновить вручную
            </button>
          </>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: "15px" }}>Что-то пошло не так.</p>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={reset}
                style={{
                  padding: "6px 16px",
                  cursor: "pointer",
                  borderRadius: "6px",
                  border: "1px solid #3f3f46",
                  background: "#18181b",
                  color: "#fafafa",
                  fontSize: "13px",
                }}
              >
                Попробовать снова
              </button>
              <a
                href="/"
                style={{
                  padding: "6px 16px",
                  borderRadius: "6px",
                  border: "1px solid #3f3f46",
                  background: "#18181b",
                  color: "#fafafa",
                  fontSize: "13px",
                  textDecoration: "none",
                }}
              >
                На главную
              </a>
            </div>
          </>
        )}
      </body>
    </html>
  );
}
