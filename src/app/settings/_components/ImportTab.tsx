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
      <div className="bg-[#111111] border border-white/[0.06] rounded-xl p-4 text-sm text-[#888] leading-relaxed">
        Загрузите CSV файл с роликами.{" "}
        <span className="text-white">Колонки:</span>{" "}
        <code className="font-mono text-xs text-blue-400 bg-blue-950/40 px-1.5 py-0.5 rounded">
          url, platform, creator, product, published_at
        </code>
        <div className="mt-2 text-xs text-[#555]">
          Пример: <span className="font-mono text-[#666]">https://tiktok.com/@polina/video/123,tiktok,Полина,Кошка 248332917,2026-03-15</span>
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
          borderColor: dragging ? "#3b82f6" : "rgba(255,255,255,0.1)",
          backgroundColor: dragging ? "rgba(59,130,246,0.04)" : "transparent",
        }}
      >
        <Upload className="w-8 h-8 text-[#444]" style={{ color: dragging ? "#3b82f6" : undefined }} />
        <p className="text-sm text-[#666]">
          Перетащите CSV файл или{" "}
          <span className="text-blue-400 hover:text-blue-300">нажмите для выбора</span>
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
        <div className="bg-[#111111] border border-white/[0.06] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#555]" />
            <span className="text-sm text-white font-medium">{fileName}</span>
            <span className="text-xs text-[#555] ml-auto">{parsedRows.length} строк</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {headers.map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-[#555] whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} className="border-b border-white/[0.04] last:border-0">
                    {row.map((cell, j) => (
                      <td key={j} className="px-4 py-2.5 text-xs text-[#888] font-mono whitespace-nowrap max-w-[200px] truncate">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsedRows.length > 5 && (
            <div className="px-4 py-2 text-xs text-[#555] border-t border-white/[0.04]">
              + ещё {parsedRows.length - 5} строк
            </div>
          )}
          <div className="px-4 py-3 border-t border-white/[0.06] flex justify-end">
            <button
              onClick={handleImport}
              disabled={importing}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors"
            >
              {importing ? "Импорт..." : "Импортировать"}
            </button>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="bg-[#111111] border border-white/[0.06] rounded-xl p-4 flex flex-col gap-2">
          <p className="text-sm text-emerald-400 font-medium">
            Импортировано: {result.imported} роликов
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-1 flex flex-col gap-1">
              {result.errors.map((err, i) => (
                <li key={i} className="text-xs text-red-400 font-mono">
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
