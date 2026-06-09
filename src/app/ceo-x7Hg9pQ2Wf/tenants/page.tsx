export const dynamic = "force-dynamic";

import { db } from "@/db";
import { tenants, users, videos, subscriptions } from "@/db/schema";
import { desc, count, eq } from "drizzle-orm";
import { formatDate } from "@/lib/format";

const TRIAL_DAYS = 14;

function trialInfo(createdAt: Date, hasSub: boolean): { label: string; color: string; urgent: boolean } {
  if (hasSub) return { label: "Подписка", color: "#10B981", urgent: false };
  const now = Date.now();
  const endsAt = createdAt.getTime() + TRIAL_DAYS * 86400_000;
  const daysLeft = Math.max(0, Math.ceil((endsAt - now) / 86400_000));
  if (daysLeft === 0) return { label: "Истёк триал", color: "#EF4444", urgent: true };
  if (daysLeft <= 3) return { label: `Триал: ${daysLeft}д`, color: "#F59E0B", urgent: true };
  return { label: `Триал: ${daysLeft}д`, color: "#60A5FA", urgent: false };
}

export default async function CeoTenantsPage() {
  const rows = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      createdAt: tenants.createdAt,
      userCount: count(users.id),
    })
    .from(tenants)
    .leftJoin(users, eq(users.tenantId, tenants.id))
    .groupBy(tenants.id, tenants.name, tenants.slug, tenants.createdAt)
    .orderBy(desc(tenants.createdAt));

  const activeSubs = await db
    .select({ tenantId: subscriptions.tenantId })
    .from(subscriptions)
    .where(eq(subscriptions.status, "active"));
  const subSet = new Set(activeSubs.map((s) => s.tenantId));

  const videoCounts = await db
    .select({ tenantId: videos.tenantId, cnt: count(videos.id) })
    .from(videos)
    .groupBy(videos.tenantId);
  const videoMap = new Map(videoCounts.map((v) => [v.tenantId, v.cnt]));

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", background: "#0F1117", minHeight: "100vh", color: "#E2E8F0", padding: "24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, color: "#F8FAFC" }}>
            Тенанты — ContentRadar
          </h1>
          <p style={{ fontSize: 13, color: "#94A3B8", marginTop: 4 }}>
            Всего: <strong style={{ color: "#F8FAFC" }}>{rows.length}</strong>
            &nbsp;·&nbsp;
            С подпиской: <strong style={{ color: "#10B981" }}>{activeSubs.length}</strong>
            &nbsp;·&nbsp;
            На триале: <strong style={{ color: "#60A5FA" }}>{rows.length - activeSubs.length}</strong>
          </p>
        </div>

        <div style={{ background: "#1E2433", borderRadius: 12, border: "1px solid #2D3748", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #2D3748" }}>
                {["Дата", "Тенант", "Slug", "Пользователи", "Видео", "Статус"].map((h, i) => (
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
              {rows.map((row, i) => {
                const hasSub = subSet.has(row.id);
                const trial = trialInfo(row.createdAt, hasSub);
                const vCnt = videoMap.get(row.id) ?? 0;
                return (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom: i < rows.length - 1 ? "1px solid #1A2030" : "none",
                      background: trial.urgent ? "rgba(239,68,68,0.04)" : "transparent",
                    }}
                  >
                    <td style={{ padding: "10px 16px", fontSize: 12, fontFamily: "monospace", color: "#64748B", whiteSpace: "nowrap" }}>
                      {formatDate(row.createdAt.toISOString())}
                    </td>
                    <td style={{ padding: "10px 16px", fontSize: 13, color: "#F8FAFC", fontWeight: 500, whiteSpace: "nowrap" }}>
                      {row.name}
                    </td>
                    <td style={{ padding: "10px 16px", fontSize: 12, fontFamily: "monospace", color: "#64748B" }}>
                      {row.slug}
                    </td>
                    <td style={{ padding: "10px 16px", fontSize: 13, color: "#E2E8F0", textAlign: "center" }}>
                      {row.userCount}
                    </td>
                    <td style={{ padding: "10px 16px", fontSize: 13, color: vCnt > 0 ? "#E2E8F0" : "#475569", textAlign: "center" }}>
                      {vCnt}
                    </td>
                    <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "3px 10px",
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 600,
                          background: trial.color + "22",
                          color: trial.color,
                          border: `1px solid ${trial.color}44`,
                        }}
                      >
                        {trial.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 48, textAlign: "center", color: "#64748B", fontSize: 13 }}>
                    Тенантов нет
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
          <a
            href="/ceo-x7Hg9pQ2Wf/waitlist"
            style={{ fontSize: 12, color: "#818CF8", textDecoration: "none" }}
          >
            ← Вейтлист
          </a>
        </div>
      </div>
    </div>
  );
}
