import Link from "next/link";
import { Radio } from "lucide-react";

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "var(--bg-base)" }}
    >
      <div className="w-full max-w-sm text-center">
        <div className="flex items-center gap-2.5 justify-center mb-8">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{
              background: "var(--accent-muted)",
              border: "1px solid var(--accent-border)",
            }}
          >
            <Radio className="w-4 h-4" style={{ color: "var(--accent-primary)" }} />
          </div>
          <span
            className="text-lg font-semibold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            ContentRadar
          </span>
        </div>

        <div
          className="rounded-2xl p-6"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <p
            className="text-5xl font-bold mb-2"
            style={{ color: "var(--text-primary)" }}
          >
            404
          </p>
          <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
            Страница не найдена
          </p>
          <Link
            href="/"
            className="inline-block text-sm font-medium py-2.5 px-6 rounded-lg transition-colors duration-150"
            style={{
              background: "var(--accent-primary)",
              color: "#fff",
            }}
          >
            На главную
          </Link>
        </div>
      </div>
    </div>
  );
}
