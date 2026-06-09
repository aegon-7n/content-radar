"use client";

import { useState } from "react";

interface Props {
  waitlistId: number;
  defaultName: string;
  defaultContact: string;
  defaultStore: string;
  authHeader: string; // base64 Basic Auth — already known to anyone who can view the page
}

interface Result {
  email: string;
  password: string;
  loginUrl: string;
}

export function OnboardButton({ waitlistId, defaultName, defaultContact, defaultStore, authHeader }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function buildMessage(r: Result): string {
    return `Привет! Доступ к ContentRadar готов.\n\nСсылка: ${r.loginUrl}\nEmail: ${r.email}\nПароль: ${r.password}\n\nЗайдите, добавьте первого креатора в Настройки → Креаторы — ночью всё подтянется автоматически.`;
  }

  function handleCopy() {
    if (!result) return;
    navigator.clipboard.writeText(buildMessage(result)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const [tenantName, setTenantName] = useState(defaultStore || defaultName || "");
  const [adminEmail, setAdminEmail] = useState(
    defaultContact?.includes("@") && !defaultContact.startsWith("@") ? defaultContact : ""
  );
  const [adminName, setAdminName] = useState(defaultName || "");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/ceo-x7Hg9pQ2Wf/onboard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify({ waitlistId, tenantName, adminEmail, adminName }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? `Ошибка ${res.status}`);
      } else {
        setResult({ email: data.email, password: data.password, loginUrl: data.loginUrl });
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "7px 10px",
    background: "#0F1117",
    border: "1px solid #2D3748",
    borderRadius: 6,
    color: "#E2E8F0",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 11,
    color: "#64748B",
    marginBottom: 4,
    fontWeight: 500,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: "3px 10px",
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 600,
          background: "#5b5bd622",
          color: "#818CF8",
          border: "1px solid #5b5bd644",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        Онбордить
      </button>

      {open && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) { setOpen(false); setResult(null); setError(null); } }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div style={{
            background: "#1E2433",
            border: "1px solid #2D3748",
            borderRadius: 12,
            padding: 28,
            width: 420,
            maxWidth: "95vw",
          }}>
            {result ? (
              <>
                <p style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600, color: "#10B981" }}>
                  ✓ Тенант создан
                </p>
                <div style={{ background: "#0F1117", borderRadius: 8, padding: 16, fontFamily: "monospace", fontSize: 13, lineHeight: 1.8 }}>
                  <div style={{ color: "#64748B" }}>Email:</div>
                  <div style={{ color: "#E2E8F0", userSelect: "all" }}>{result.email}</div>
                  <div style={{ color: "#64748B", marginTop: 8 }}>Пароль:</div>
                  <div style={{ color: "#F59E0B", userSelect: "all", fontWeight: 700 }}>{result.password}</div>
                  <div style={{ color: "#64748B", marginTop: 8 }}>Ссылка:</div>
                  <div style={{ color: "#818CF8", userSelect: "all" }}>{result.loginUrl}</div>
                </div>
                <p style={{ margin: "12px 0 0", fontSize: 11, color: "#64748B" }}>
                  Скопируй пароль сейчас — он не хранится в открытом виде.
                </p>
                <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                  <button
                    onClick={handleCopy}
                    style={{
                      flex: 1,
                      padding: "8px 0",
                      borderRadius: 6,
                      background: copied ? "#10B98122" : "#5b5bd622",
                      border: `1px solid ${copied ? "#10B98144" : "#5b5bd644"}`,
                      color: copied ? "#10B981" : "#818CF8",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {copied ? "✓ Скопировано" : "📋 Текст для отправки"}
                  </button>
                  <button
                    onClick={() => { setOpen(false); setResult(null); setCopied(false); }}
                    style={{ padding: "8px 20px", borderRadius: 6, background: "#2D3748", border: "none", color: "#E2E8F0", cursor: "pointer", fontSize: 13 }}
                  >
                    Закрыть
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={onSubmit}>
                <p style={{ margin: "0 0 20px", fontSize: 15, fontWeight: 600, color: "#F8FAFC" }}>
                  Онбординг клиента
                </p>

                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Название тенанта (магазин/бренд)</label>
                  <input
                    style={inputStyle}
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                    placeholder="Бренд X"
                    required
                  />
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Email для входа</label>
                  <input
                    style={inputStyle}
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="owner@brand.ru"
                    required
                  />
                </div>

                <div style={{ marginBottom: 20 }}>
                  <label style={labelStyle}>Имя контакта</label>
                  <input
                    style={inputStyle}
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    placeholder="Иван Петров"
                    required
                  />
                </div>

                {error && (
                  <p style={{ margin: "0 0 14px", fontSize: 12, color: "#F87171" }}>{error}</p>
                )}

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="submit"
                    disabled={loading}
                    style={{
                      flex: 1,
                      padding: "9px 0",
                      borderRadius: 6,
                      background: loading ? "#2D3748" : "#5b5bd6",
                      border: "none",
                      color: "#fff",
                      cursor: loading ? "default" : "pointer",
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    {loading ? "Создаём…" : "Создать тенант"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setOpen(false); setError(null); }}
                    style={{ padding: "9px 16px", borderRadius: 6, background: "#2D3748", border: "none", color: "#94A3B8", cursor: "pointer", fontSize: 13 }}
                  >
                    Отмена
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
