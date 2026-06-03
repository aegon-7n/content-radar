import { db } from "@/db";
import { waitlistSignups } from "@/db/schema";
import { desc, count, eq } from "drizzle-orm";
import { formatDate } from "@/lib/format";

type SignupStatus = "new" | "in_cohort" | "rejected" | "awaiting_call";

const STATUS_LABELS: Record<SignupStatus, string> = {
  new: "Новая",
  in_cohort: "В когорте",
  awaiting_call: "Ждёт созвона",
  rejected: "Отклонена",
};

const STATUS_COLORS: Record<SignupStatus, string> = {
  new: "#3B82F6",
  in_cohort: "#10B981",
  awaiting_call: "#F59E0B",
  rejected: "#6B7280",
};

function isValidStatus(s: string): s is SignupStatus {
  return ["new", "in_cohort", "rejected", "awaiting_call"].includes(s);
}

export default async function CeoWaitlistPage() {
  const rows = await db
    .select()
    .from(waitlistSignups)
    .orderBy(desc(waitlistSignups.createdAt))
    .limit(500);

  const [totals] = await db.select({ total: count() }).from(waitlistSignups);
  const [newCount] = await db
    .select({ total: count() })
    .from(waitlistSignups)
    .where(eq(waitlistSignups.status, "new"));

  const statusCounts = await db
    .select({ status: waitlistSignups.status, total: count() })
    .from(waitlistSignups)
    .groupBy(waitlistSignups.status);

  const total = totals?.total ?? 0;
  const newTotal = newCount?.total ?? 0;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", background: "#0F1117", minHeight: "100vh", color: "#E2E8F0", padding: "24px" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, color: "#F8FAFC" }}>
            Waitlist — ContentRadar
          </h1>
          <p style={{ fontSize: 13, color: "#94A3B8", marginTop: 4 }}>
            Всего заявок: <strong style={{ color: "#F8FAFC" }}>{total}</strong>
            {" "}&nbsp;·&nbsp;{" "}
            Новых: <strong style={{ color: newTotal > 0 ? "#60A5FA" : "#F8FAFC" }}>{newTotal}</strong>
          </p>
        </div>

        {/* Status summary chips */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
          {statusCounts.map((sc) => {
            const s = isValidStatus(sc.status) ? sc.status : "new";
            return (
              <span
                key={sc.status}
                style={{
                  padding: "4px 12px",
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 500,
                  background: STATUS_COLORS[s] + "22",
                  color: STATUS_COLORS[s],
                  border: `1px solid ${STATUS_COLORS[s]}44`,
                }}
              >
                {STATUS_LABELS[s]}: {sc.total}
              </span>
            );
          })}
        </div>

        {/* Table */}
        <div style={{ background: "#1E2433", borderRadius: 12, border: "1px solid #2D3748", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #2D3748" }}>
                {["Дата", "Имя", "Контакт", "Магазин WB", "Команда", "Цель / боль", "Статус"].map((h, i) => (
                  <th
                    key={i}
                    style={{
                      padding: "10px 16px",
                      textAlign: "left",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#64748B",
                      whiteSpace: "nowrap",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 48, textAlign: "center", color: "#64748B", fontSize: 13 }}>
                    Заявок нет
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => {
                  const s = isValidStatus(row.status) ? row.status : "new";
                  const contactDisplay = row.contact ?? row.email ?? row.telegramHandle ?? "—";
                  const storeDisplay = row.storeUrl ?? row.brand ?? "—";
                  return (
                    <tr
                      key={row.id}
                      style={{
                        borderBottom: i < rows.length - 1 ? "1px solid #1A2030" : "none",
                        transition: "background 0.1s",
                      }}
                    >
                      <td style={{ padding: "10px 16px", fontSize: 12, fontFamily: "monospace", color: "#64748B", whiteSpace: "nowrap" }}>
                        {formatDate(row.createdAt.toISOString())}
                      </td>
                      <td style={{ padding: "10px 16px", fontSize: 12, color: "#E2E8F0", whiteSpace: "nowrap" }}>
                        {row.name ?? "—"}
                      </td>
                      <td style={{ padding: "10px 16px", fontSize: 12, color: "#CBD5E1", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={contactDisplay}>
                        {contactDisplay}
                      </td>
                      <td style={{ padding: "10px 16px", fontSize: 12, color: "#94A3B8", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={storeDisplay}>
                        {storeDisplay}
                      </td>
                      <td style={{ padding: "10px 16px", fontSize: 12, color: "#94A3B8", whiteSpace: "nowrap" }}>
                        {row.creatorsRange ?? "—"}
                      </td>
                      <td style={{ padding: "10px 16px", fontSize: 12, color: "#94A3B8", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.goal ?? ""}>
                        {row.goal ?? "—"}
                      </td>
                      <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "3px 10px",
                            borderRadius: 12,
                            fontSize: 11,
                            fontWeight: 500,
                            background: STATUS_COLORS[s] + "22",
                            color: STATUS_COLORS[s],
                            border: `1px solid ${STATUS_COLORS[s]}44`,
                          }}
                        >
                          {STATUS_LABELS[s]}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <p style={{ fontSize: 11, color: "#334155", marginTop: 12, textAlign: "right" }}>
          Показано {rows.length} из {total} · Только для внутреннего использования
        </p>
      </div>
    </div>
  );
}
