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

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium shadow-xl transition-all"
      style={{
        backgroundColor: toast.type === "success" ? "#052e16" : "#2d0a0a",
        border: `1px solid ${toast.type === "success" ? "#166534" : "#7f1d1d"}`,
        color: toast.type === "success" ? "#4ade80" : "#f87171",
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: toast.type === "success" ? "#4ade80" : "#f87171" }}
      />
      {toast.message}
    </div>
  );
}
