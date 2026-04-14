"use client";

import { useState, useRef, DragEvent } from "react";
import { Upload, FileText } from "lucide-react";
import { ToastState } from "./Toast";

interface CsvRow {
  url: string;
  platform: string;
  creator: string;
  product: string;
  published_at: string;
}

interface ImportPayloadRow {
  url: string;
  platform: string;
  creatorName: string;
  productName: string;
  publishedAt: string;
}

interface ImportResult {
  imported: number;
  errors: string[];
}

interface ImportTabProps {
  showToast: (msg: string, type: ToastState["type"]) => void;
}

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1).map((line) => line.split(",").map((c) => c.trim()));
  return { headers, rows };
}

function rowToObject(headers: string[], row: string[]): CsvRow {
  const obj: Record<string, string> = {};
  headers.forEach((h, i) => { obj[h] = row[i] ?? ""; });
  return obj as unknown as CsvRow;
}

export default function ImportTab({ showToast }: ImportTabProps) {
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [preview, setPreview] = useState<string[][]>([]);
  const [parsedRows, setParsedRows] = useState<CsvRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function readFile(file: File) {
    if (!file.name.endsWith(".csv")) {
      showToast("Загрузите файл в формате .csv", "error");
      return;
    }
    setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers: h, rows } = parseCsv(text);
      setFileName(file.name);
      setHeaders(h);
      setPreview(rows.slice(0, 5));
      setParsedRows(rows.map((r) => rowToObject(h, r)));
    };
    reader.readAsText(file, "utf-8");
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) readFile(file);
    e.target.value = "";
  }

  async function handleImport() {
    if (!parsedRows.length) return;
    setImporting(true);
    setResult(null);
    try {
      const payload: ImportPayloadRow[] = parsedRows.map((row) => ({
        url: row.url,
        platform: row.platform,
        creatorName: row.creator,
        productName: row.product,
        publishedAt: row.published_at
          ? new Date(row.published_at).toISOString()
          : new Date().toISOString(),
      }));
      const res = await fetch("/api/settings/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Ошибка импорта", "error");
        return;
      }
      setResult(data);
      if (data.errors?.length) {
        showToast(`Импортировано ${data.imported}, ошибок: ${data.errors.length}`, "error");
      } else {
        showToast(`Импортировано ${data.imported} роликов`, "success");
      }
    } catch {
      showToast("Ошибка сети", "error");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      {/* Instruction */}
      <div
        className="rounded-xl p-4 text-sm leading-relaxed"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-default)",
          color: "var(--text-muted)",
        }}
      >
        Загрузите CSV файл с роликами.{" "}
        <span style={{ color: "var(--text-primary)" }}>Колонки:</span>{" "}
        <code
          className="font-mono text-xs px-1.5 py-0.5 rounded"
          style={{
            color: "var(--accent-text)",
            background: "var(--accent-muted)",
          }}
        >
          url, platform, creator, product, published_at
        </code>
        <div className="mt-2 text-xs" style={{ color: "var(--text-disabled)" }}>
          Пример:{" "}
          <span className="font-mono" style={{ color: "var(--text-muted)" }}>
            https://tiktok.com/@polina/video/123,tiktok,Полина,Кошка 248332917,2026-03-15
          </span>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className="cursor-pointer rounded-xl border-2 border-dashed transition-colors flex flex-col items-center justify-center gap-3 py-12"
        style={{
          borderColor: dragging ? "var(--accent-primary)" : "var(--border-strong)",
          backgroundColor: dragging ? "var(--accent-muted)" : "transparent",
        }}
      >
        <Upload
          className="w-8 h-8"
          style={{ color: dragging ? "var(--accent-primary)" : "var(--text-disabled)" }}
        />
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Перетащите CSV файл или{" "}
          <span style={{ color: "var(--accent-text)" }}>нажмите для выбора</span>
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* Preview */}
      {fileName && headers.length > 0 && (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
          }}
        >
          <div
            className="px-4 py-3 flex items-center gap-2"
            style={{ borderBottom: "1px solid var(--border-default)" }}
          >
            <FileText className="w-4 h-4" style={{ color: "var(--text-disabled)" }} />
            <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              {fileName}
            </span>
            <span className="text-xs ml-auto" style={{ color: "var(--text-disabled)" }}>
              {parsedRows.length} строк
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-default)", background: "var(--bg-subtle)" }}>
                  {headers.map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-2.5 text-xs font-medium uppercase tracking-wide whitespace-nowrap"
                      style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr
                    key={i}
                    className="last:border-0"
                    style={{ borderBottom: "1px solid var(--border-subtle)" }}
                  >
                    {row.map((cell, j) => (
                      <td
                        key={j}
                        className="px-4 py-2.5 text-xs font-mono whitespace-nowrap max-w-[200px] truncate"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsedRows.length > 5 && (
            <div
              className="px-4 py-2 text-xs"
              style={{
                color: "var(--text-disabled)",
                borderTop: "1px solid var(--border-subtle)",
              }}
            >
              + ещё {parsedRows.length - 5} строк
            </div>
          )}
          <div
            className="px-4 py-3 flex justify-end"
            style={{ borderTop: "1px solid var(--border-default)" }}
          >
            <button
              onClick={handleImport}
              disabled={importing}
              className="px-4 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: "var(--accent-primary)",
                color: "#fff",
              }}
              onMouseEnter={(e) => { if (!importing) (e.currentTarget.style.background = "var(--accent-hover)"); }}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent-primary)")}
            >
              {importing ? "Импорт..." : "Импортировать"}
            </button>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div
          className="rounded-xl p-4 flex flex-col gap-2"
          style={{
            background: "var(--success-bg)",
            border: "1px solid var(--success-border)",
          }}
        >
          <p className="text-sm font-medium" style={{ color: "var(--success-text)" }}>
            Импортировано: {result.imported} роликов
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-1 flex flex-col gap-1">
              {result.errors.map((err, i) => (
                <li key={i} className="text-xs font-mono" style={{ color: "var(--error-text)" }}>
                  {err}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
