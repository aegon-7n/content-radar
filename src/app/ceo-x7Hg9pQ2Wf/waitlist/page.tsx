import { db } from "@/db";
import { waitlistSignups } from "@/db/schema";
import type { WaitlistSignup } from "@/db/schema";
import { eq, and, ne, desc, count, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { formatDate } from "@/lib/format";

// ─── Types ────────────────────────────────────────────────────────────────────

type SignupStatus = "new" | "in_cohort" | "rejected" | "awaiting_call";

const STATUS_LABELS: Record<SignupStatus, string> = {
  new: "Новая",
  in_cohort: "В когорте",
  awaiting_call: "Ждёт созвона",
  rejected: "Отклонена",
};

function isValidStatus(s: string): s is SignupStatus {
  return ["new", "in_cohort", "rejected", "awaiting_call"].includes(s);
}

// ─── Server Actions ───────────────────────────────────────────────────────────

async function updateStatus(formData: FormData) {
  "use server";

  const rawId = formData.get("id");
  const rawStatus = formData.get("status");

  if (typeof rawId !== "string" || typeof rawStatus !== "string") return;

  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return;
  if (!isValidStatus(rawStatus)) return;

  await db
    .update(waitlistSignups)
    .set({ status: rawStatus })
    .where(eq(waitlistSignups.id, id));

  revalidatePath("/ceo-x7Hg9pQ2Wf/waitlist");
}

async function updateNotes(formData: FormData) {
  "use server";

  const rawId = formData.get("id");
  const rawNotes = formData.get("notes");

  if (typeof rawId !== "string") return;

  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return;

  const notes = typeof rawNotes === "string" ? rawNotes.slice(0, 4000) : null;

  await db
    .update(waitlistSignups)
    .set({ notes: notes || null })
    .where(eq(waitlistSignups.id, id));

  revalidatePath("/ceo-x7Hg9pQ2Wf/waitlist");
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ status?: string; campaign?: string; show_rejected?: string }>;
}

export default async function CeoWaitlistPage({ searchParams }: PageProps) {
  const { status: statusFilter, campaign: campaignFilter, show_rejected } = await searchParams;
  const showRejected = show_rejected === "1";

  const conditions = [];
  if (statusFilter && isValidStatus(statusFilter)) {
    conditions.push(eq(waitlistSignups.status, statusFilter));
  } else if (!showRejected) {
    conditions.push(ne(waitlistSignups.feedbackCommitment, "no"));
  }
  if (campaignFilter) {
    conditions.push(eq(waitlistSignups.utmCampaign, campaignFilter));
  }

  const rows: WaitlistSignup[] = conditions.length > 0
    ? await db
        .select()
        .from(waitlistSignups)
        .where(conditions.length === 1 ? conditions[0] : and(...conditions))
        .orderBy(desc(waitlistSignups.createdAt))
        .limit(200)
    : await db
        .select()
        .from(waitlistSignups)
        .orderBy(desc(waitlistSignups.createdAt))
        .limit(200);

  const [totals] = await db.select({ total: count() }).from(waitlistSignups);
  const [newCount] = await db
    .select({ total: count() })
    .from(waitlistSignups)
    .where(eq(waitlistSignups.status, "new"));

  const campaignRows = await db
    .selectDistinct({ campaign: waitlistSignups.utmCampaign })
    .from(waitlistSignups)
    .where(isNotNull(waitlistSignups.utmCampaign))
    .orderBy(waitlistSignups.utmCampaign);
  const campaigns = campaignRows
    .map((r) => r.campaign)
    .filter((c): c is string => c !== null);

  const total = totals?.total ?? 0;
  const newTotal = newCount?.total ?? 0;

  const FILTER_TABS: { value: string; label: string }[] = [
    { value: "", label: "Кандидаты" },
    { value: "new", label: "Новые" },
    { value: "awaiting_call", label: "Ждут созвона" },
    { value: "in_cohort", label: "В когорте" },
    { value: "rejected", label: "Отклонены" },
  ];

  const BASE = "/ceo-x7Hg9pQ2Wf/waitlist";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f1117",
        color: "#e2e8f0",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: "13px",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          borderBottom: "1px solid #1e2535",
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          gap: "16px",
          background: "#0a0d14",
        }}
      >
        <span style={{ color: "#64748b", fontSize: "11px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          ContentRadar · CEO
        </span>
        <span style={{ color: "#1e2535" }}>|</span>
        <span style={{ color: "#94a3b8", fontWeight: 600 }}>Waitlist</span>
        <span style={{ marginLeft: "auto", color: "#475569", fontSize: "11px" }}>
          Всего: <b style={{ color: "#94a3b8" }}>{total}</b>
          &nbsp;·&nbsp;
          Новых: <b style={{ color: newTotal > 0 ? "#60a5fa" : "#475569" }}>{newTotal}</b>
        </span>
      </div>

      <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Filters */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: "4px", background: "#141923", border: "1px solid #1e2535", borderRadius: "8px", padding: "4px" }}>
            {FILTER_TABS.map((tab) => {
              const isActive = (statusFilter ?? "") === tab.value;
              const params = new URLSearchParams();
              if (tab.value) params.set("status", tab.value);
              if (campaignFilter) params.set("campaign", campaignFilter);
              const qs = params.toString();
              return (
                <a
                  key={tab.value}
                  href={`${BASE}${qs ? `?${qs}` : ""}`}
                  style={{
                    padding: "5px 12px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: 500,
                    textDecoration: "none",
                    background: isActive ? "#1e2d4a" : "transparent",
                    color: isActive ? "#93c5fd" : "#64748b",
                    border: isActive ? "1px solid #2d4a7a" : "1px solid transparent",
                  }}
                >
                  {tab.label}
                </a>
              );
            })}
          </div>

          {campaigns.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ color: "#475569", fontSize: "11px" }}>utm:</span>
              <div style={{ display: "flex", gap: "4px", background: "#141923", border: "1px solid #1e2535", borderRadius: "8px", padding: "4px" }}>
                {[{ value: "", label: "Все" }, ...campaigns.map((c) => ({ value: c, label: c }))].map((tab) => {
                  const isActive = (campaignFilter ?? "") === tab.value;
                  const params = new URLSearchParams();
                  if (statusFilter) params.set("status", statusFilter);
                  if (tab.value) params.set("campaign", tab.value);
                  const qs = params.toString();
                  return (
                    <a
                      key={tab.value}
                      href={`${BASE}${qs ? `?${qs}` : ""}`}
                      style={{
                        padding: "4px 10px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        textDecoration: "none",
                        background: isActive ? "#1e2d4a" : "transparent",
                        color: isActive ? "#93c5fd" : "#64748b",
                      }}
                    >
                      {tab.label}
                    </a>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Table */}
        {rows.length === 0 ? (
          <div style={{ padding: "48px", textAlign: "center", color: "#475569", border: "1px solid #1e2535", borderRadius: "8px" }}>
            Заявок нет
          </div>
        ) : (
          <div style={{ overflowX: "auto", border: "1px solid #1e2535", borderRadius: "8px" }}>
            <table style={{ width: "100%", minWidth: "1100px", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #1e2535", background: "#0a0d14" }}>
                  {["Дата", "Имя", "Email", "Telegram", "Бренд", "Кол-во крт", "МП", "Цель", "Статус", "Заметки", ""].map((h, i) => (
                    <th
                      key={i}
                      style={{
                        padding: "8px 12px",
                        textAlign: "left",
                        fontSize: "11px",
                        fontWeight: 600,
                        letterSpacing: "0.05em",
                        color: "#475569",
                        whiteSpace: "nowrap",
                        textTransform: "uppercase",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom: i < rows.length - 1 ? "1px solid #141923" : "none",
                      background: i % 2 === 0 ? "transparent" : "#0c101a",
                    }}
                  >
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap", color: "#475569", fontSize: "11px" }}>
                      {formatDate(row.createdAt.toISOString())}
                    </td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap", color: "#cbd5e1" }}>
                      {row.name ?? "—"}
                    </td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap", color: "#93c5fd" }}>
                      {row.email}
                    </td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap", color: "#94a3b8" }}>
                      {row.telegramHandle ?? "—"}
                    </td>
                    <td style={{ padding: "8px 12px", color: "#e2e8f0", maxWidth: "140px" }}>
                      <span title={row.brand} style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {row.brand}
                      </span>
                    </td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap", color: "#94a3b8" }}>
                      {row.creatorsRange}
                    </td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap", color: "#64748b" }}>
                      {row.marketplace ?? "—"}
                    </td>
                    <td style={{ padding: "8px 12px", maxWidth: "180px", color: "#94a3b8" }}>
                      {row.goal ? (
                        <span title={row.goal} style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {row.goal}
                        </span>
                      ) : "—"}
                    </td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          fontSize: "11px",
                          fontWeight: 600,
                          background: row.status === "new" ? "#1e3a5f" : row.status === "in_cohort" ? "#14532d" : row.status === "awaiting_call" ? "#451a03" : "#1e1e1e",
                          color: row.status === "new" ? "#93c5fd" : row.status === "in_cohort" ? "#86efac" : row.status === "awaiting_call" ? "#fbbf24" : "#6b7280",
                        }}
                      >
                        {STATUS_LABELS[isValidStatus(row.status) ? row.status : "new"]}
                      </span>
                    </td>
                    <td style={{ padding: "8px 12px", minWidth: "200px" }}>
                      <form action={updateNotes} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <input type="hidden" name="id" value={row.id} />
                        <textarea
                          name="notes"
                          defaultValue={row.notes ?? ""}
                          rows={2}
                          placeholder="Заметки..."
                          style={{
                            width: "100%",
                            background: "#141923",
                            color: "#94a3b8",
                            border: "1px solid #1e2535",
                            borderRadius: "4px",
                            padding: "4px 8px",
                            fontSize: "12px",
                            resize: "vertical",
                            fontFamily: "inherit",
                            outline: "none",
                            minWidth: "160px",
                          }}
                        />
                        <button
                          type="submit"
                          style={{
                            alignSelf: "flex-end",
                            fontSize: "11px",
                            padding: "3px 8px",
                            background: "transparent",
                            color: "#475569",
                            border: "1px solid #1e2535",
                            borderRadius: "4px",
                            cursor: "pointer",
                          }}
                        >
                          Сохранить
                        </button>
                      </form>
                    </td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                      <form action={updateStatus} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <input type="hidden" name="id" value={row.id} />
                        <select
                          name="status"
                          defaultValue={row.status}
                          style={{
                            background: "#141923",
                            color: "#94a3b8",
                            border: "1px solid #1e2535",
                            borderRadius: "4px",
                            padding: "4px 6px",
                            fontSize: "12px",
                            fontFamily: "inherit",
                            outline: "none",
                          }}
                        >
                          <option value="new">Новая</option>
                          <option value="awaiting_call">Ждёт созвона</option>
                          <option value="in_cohort">В когорте</option>
                          <option value="rejected">Отклонена</option>
                        </select>
                        <button
                          type="submit"
                          style={{
                            fontSize: "11px",
                            padding: "4px 10px",
                            background: "#1e2d4a",
                            color: "#93c5fd",
                            border: "1px solid #2d4a7a",
                            borderRadius: "4px",
                            cursor: "pointer",
                          }}
                        >
                          ✓
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
