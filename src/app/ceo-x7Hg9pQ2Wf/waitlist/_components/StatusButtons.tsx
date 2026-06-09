"use client";

import { useState } from "react";

type LeadStatus = "new" | "awaiting_call" | "rejected" | "in_cohort";

interface Props {
  waitlistId: number;
  currentStatus: LeadStatus;
  authHeader: string;
}

export function StatusButtons({ waitlistId, currentStatus, authHeader }: Props) {
  const [status, setStatus] = useState<LeadStatus>(currentStatus);
  const [loading, setLoading] = useState(false);

  if (status === "in_cohort") return null;

  async function changeStatus(next: "awaiting_call" | "rejected" | "new") {
    setLoading(true);
    try {
      const res = await fetch("/ceo-x7Hg9pQ2Wf/waitlist/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({ waitlistId, status: next }),
      });
      if (res.ok) setStatus(next);
    } finally {
      setLoading(false);
    }
  }

  const btnBase: React.CSSProperties = {
    padding: "3px 8px",
    borderRadius: 5,
    fontSize: 10,
    fontWeight: 600,
    border: "none",
    cursor: loading ? "default" : "pointer",
    opacity: loading ? 0.5 : 1,
    whiteSpace: "nowrap",
  };

  return (
    <div style={{ display: "flex", gap: 4 }}>
      {status !== "awaiting_call" && (
        <button
          disabled={loading}
          onClick={() => changeStatus("awaiting_call")}
          style={{ ...btnBase, background: "#F59E0B22", color: "#F59E0B", border: "1px solid #F59E0B44" }}
        >
          Созвон
        </button>
      )}
      {status !== "new" && status !== "in_cohort" && (
        <button
          disabled={loading}
          onClick={() => changeStatus("new")}
          style={{ ...btnBase, background: "#3B82F622", color: "#3B82F6", border: "1px solid #3B82F644" }}
        >
          Новая
        </button>
      )}
      {status !== "rejected" && (
        <button
          disabled={loading}
          onClick={() => changeStatus("rejected")}
          style={{ ...btnBase, background: "#6B728022", color: "#6B7280", border: "1px solid #6B728044" }}
        >
          Откл.
        </button>
      )}
    </div>
  );
}
