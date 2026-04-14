"use client";

import { useEffect } from "react";

export type ToastType = "success" | "error";

export interface ToastState {
  message: string;
  type: ToastType;
  id: number;
}

interface ToastProps {
  toast: ToastState | null;
  onDismiss: () => void;
}

export default function Toast({ toast, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, 3000);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  if (!toast) return null;

  const isSuccess = toast.type === "success";

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium shadow-xl transition-all"
      style={{
        backgroundColor: isSuccess ? "var(--success-bg)" : "var(--error-bg)",
        border: `1px solid ${isSuccess ? "var(--success-border)" : "var(--error-border)"}`,
        color: isSuccess ? "var(--success-text)" : "var(--error-text)",
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{
          backgroundColor: isSuccess ? "var(--success-text)" : "var(--error-text)",
        }}
      />
      {toast.message}
    </div>
  );
}
