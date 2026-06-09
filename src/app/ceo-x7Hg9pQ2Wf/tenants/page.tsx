export const dynamic = "force-dynamic";

import { db } from "@/db";
import { tenants, users, videos, subscriptions } from "@/db/schema";
import { desc, count, eq, sql } from "drizzle-orm";
import { formatDate } from "@/lib/format";

const TRIAL_DAYS = 14;

function trialInfo(createdAt: Date, hasSub: boolean): { label: string; color: string; urgent: boolean; expired: boolean; active: boolean } {
  if (hasSub) return { label: "Подписка", color: "#10B981", urgent: false, expired: false, active: false };
  const now = Date.now();
  const endsAt = createdAt.getTime() + TRIAL_DAYS * 86400_000;
  const daysLeft = Math.max(0, Math.ceil((endsAt - now) / 86400_000));
  if (daysLeft === 0) return { label: "Истёк", color: "#EF4444", urgent: true, expired: true, active: false };
  if (daysLeft <= 3) return { label: `Триал: ${daysLeft}д`, color: "#F59E0B", urgent: true, expired: false, active: true };
  return { label: `Триал: ${daysLeft}д`, color: "#60A5FA", urgent: false, expired: false, active: true };
}

export default async function CeoTenantsPage({ searchParams }: { searchParams: { all?: string } }) {
  const showAll = searchParams.all === "1";

  // Join with owner email (role=owner, one per tenant)
  const rows = await db.execute(sql`
    SELECT
      t.id,
      t.name,
      t.slug,
      t.created_at AS "createdAt",
      COUNT(DISTINCT u.id)::int AS "userCount",
      (SELECT email FROM users WHERE tenant_id = t.id AND role = 'owner' LIMIT 1) AS "ownerEmail"
    FROM tenants t
    LEFT JOIN users u ON u.tenant_id = t.id
    GROUP BY t.id, t.name, t.slug, t.created_at
    ORDER BY t.created_at DESC
  `);

  const tenantRows = rows as unknown as Array<{
    id: string;
    name: string;
    slug: string;
    createdAt: Date;
    userCount: number;
    ownerEmail: string | null;
  }>;

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

  // By default hide QA/test tenants (those with 0 videos and no subscription).
  const displayRows = showAll
    ? tenantRows
    : tenantRows.filter((r) => (videoMap.get(r.id) ?? 0) > 0 || subSet.has(r.id));

  // Sort: urgent first, then by createdAt desc
  displayRows.sort((a, b) => {
    const ta = trialInfo(new Date(a.createdAt), subSet.has(a.id));
    const tb = trialInfo(new Date(b.createdAt), subSet.has(b.id));
    if (ta.urgent && !tb.urgent) return -1;
    if (!ta.urgent && tb.urgent) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const activeTrialCount = displayRows.filter((r) => {
    const t = trialInfo(new Date(r.createdAt), subSet.has(r.id));
    return t.active;
  }).length;

  const expiredCount = displayRows.filter((r) => {
    const t = trialInfo(new Date(r.createdAt), subSet.has(r.id));
    return t.expired;
  }).length;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", background: "#0F1117", minHeight: "100vh", color: "#E2E8F0", padding: "24px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, color: "#F8FAFC" }}>
              Тенанты — ContentRadar
            </h1>
            <p style={{ fontSize: 13, color: "#94A3B8", marginTop: 4 }}>
              Показано: <strong style={{ color: "#F8FAFC" }}>{displayRows.length}</strong>
              {!showAll && tenantRows.length !== displayRows.length && (
                <span style={{ color: "#475569" }}> из {tenantRows.length} (QA скрыты)</span>
              )}
              &nbsp;·&nbsp;
              Подписка: <strong style={{ color: "#10B981" }}>{activeSubs.length}</strong>
              &nbsp;·&nbsp;
              Триал: <strong style={{ color: "#60A5FA" }}>{activeTrialCount}</strong>
              {expiredCount > 0 && (
                <>&nbsp;·&nbsp;Истёк: <strong style={{ color: "#EF4444" }}>{expiredCount}</strong></>
              )}
            </p>
          </div>
          <a
            href={showAll ? "/ceo-x7Hg9pQ2Wf/tenants" : "/ceo-x7Hg9pQ2Wf/tenants?all=1"}
            style={{ fontSize: 12, color: "#818CF8", textDecoration: "none", whiteSpace: "nowrap", paddingTop: 4 }}
          >
            {showAll ? "Скрыть QA ↑" : "Показать всех ↓"}
          </a>
        </div>

        <div style={{ background: "#1E2433", borderRadius: 12, border: "1px solid #2D3748", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #2D3748" }}>
                {["Дата", "Тенант", "Владелец", "Видео", "Статус"].map((h, i) => (
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
              {displayRows.map((row, i) => {
                const hasSub = subSet.has(row.id);
                const trial = trialInfo(new Date(row.createdAt), hasSub);
                const vCnt = videoMap.get(row.id) ?? 0;
                return (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom: i < displayRows.length - 1 ? "1px solid #1A2030" : "none",
                      background: trial.urgent ? "rgba(239,68,68,0.04)" : "transparent",
                    }}
                  >
                    <td style={{ padding: "10px 16px", fontSize: 12, fontFamily: "monospace", color: "#64748B", whiteSpace: "nowrap" }}>
                      {formatDate(new Date(row.createdAt).toISOString())}
                    </td>
                    <td style={{ padding: "10px 16px", fontSize: 13, color: "#F8FAFC", fontWeight: 500, whiteSpace: "nowrap" }}>
                      {row.name}
                    </td>
                    <td style={{ padding: "10px 16px", fontSize: 12 }}>
                      {row.ownerEmail ? (
                        <a
                          href={`mailto:${row.ownerEmail}`}
                          style={{ color: "#94A3B8", textDecoration: "none" }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "#E2E8F0")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "#94A3B8")}
                        >
                          {row.ownerEmail}
                        </a>
                      ) : (
                        <span style={{ color: "#475569" }}>—</span>
                      )}
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
              {displayRows.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 48, textAlign: "center", color: "#64748B", fontSize: 13 }}>
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
