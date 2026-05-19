import { db } from "@/db";
import { waitlistSignups } from "@/db/schema";
import type { WaitlistSignup } from "@/db/schema";
import { eq, and, desc, count, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getToken } from "next-auth/jwt";
import { formatDate } from "@/lib/format";

// Defence-in-depth: middleware уже защищает /admin/*, но Server Action
// валидирует токен явно — на случай если matcher изменится и кто-то
// дёрнет действие напрямую с подделанным cookie.
async function requireSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const token = await getToken({
    req: { headers: { cookie: cookieHeader } } as Parameters<typeof getToken>[0]["req"],
    secret: process.env.NEXTAUTH_SECRET ?? "dev-secret-change-in-production",
  });
  return token !== null;
}

// ─── Types ────────────────────────────────────────────────────────────────────
type SignupStatus = "new" | "contacted" | "onboarded" | "rejected";

const STATUS_LABELS: Record<SignupStatus, string> = {
  new: "Новая",
  contacted: "В работе",
  onboarded: "Онбордены",
  rejected: "Отклонена",
};

const STATUS_COLORS: Record<
  SignupStatus,
  { bg: string; text: string; border: string }
> = {
  new: {
    bg: "var(--accent-muted)",
    text: "var(--accent-text)",
    border: "var(--accent-border)",
  },
  contacted: {
    bg: "var(--warning-bg)",
    text: "var(--warning-text)",
    border: "var(--warning-border)",
  },
  onboarded: {
    bg: "var(--success-bg)",
    text: "var(--success-text)",
    border: "var(--success-border)",
  },
  rejected: {
    bg: "var(--neutral-bg)",
    text: "var(--neutral-text)",
    border: "var(--neutral-border)",
  },
};

function isValidStatus(s: string): s is SignupStatus {
  return ["new", "contacted", "onboarded", "rejected"].includes(s);
}

// ─── Server Action ────────────────────────────────────────────────────────────
async function updateStatus(formData: FormData) {
  "use server";

  if (!(await requireSession())) return;

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

  revalidatePath("/admin/waitlist");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const s = isValidStatus(status) ? status : "new";
  const c = STATUS_COLORS[s];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
      style={{
        background: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
      }}
    >
      {STATUS_LABELS[s]}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
interface PageProps {
  searchParams: Promise<{ status?: string; campaign?: string }>;
}

export default async function WaitlistPage({ searchParams }: PageProps) {
  const { status: statusFilter, campaign: campaignFilter } = await searchParams;

  // Build query — filter by status and/or utm_campaign
  const conditions = [];
  if (statusFilter && isValidStatus(statusFilter)) {
    conditions.push(eq(waitlistSignups.status, statusFilter));
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
        .limit(100)
    : await db
        .select()
        .from(waitlistSignups)
        .orderBy(desc(waitlistSignups.createdAt))
        .limit(100);

  // Counts for header
  const [totals] = await db
    .select({ total: count() })
    .from(waitlistSignups);
  const [newCount] = await db
    .select({ total: count() })
    .from(waitlistSignups)
    .where(eq(waitlistSignups.status, "new"));

  // Distinct campaigns for filter
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
    { value: "", label: "Все" },
    { value: "new", label: "Новые" },
    { value: "contacted", label: "В работе" },
    { value: "onboarded", label: "Онбордены" },
    { value: "rejected", label: "Отклонены" },
  ];

  return (
    <div
      className="p-4 md:p-6 flex flex-col gap-4 md:gap-6 min-h-full"
      style={{ background: "var(--bg-base)" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1
            className="text-xl font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Заявки waitlist
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            Всего:{" "}
            <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
              {total}
            </span>{" "}
            &bull; Новых:{" "}
            <span
              style={{
                color:
                  newTotal > 0 ? "var(--accent-primary)" : "var(--text-muted)",
                fontWeight: 600,
              }}
            >
              {newTotal}
            </span>
          </p>
        </div>
      </div>

      {/* Filters row */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Status filter tab-bar */}
        <div
          className="flex items-center gap-1 p-1 rounded-xl w-fit"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
          }}
        >
          {FILTER_TABS.map((tab) => {
            const isActive = (statusFilter ?? "") === tab.value;
            const params = new URLSearchParams();
            if (tab.value) params.set("status", tab.value);
            if (campaignFilter) params.set("campaign", campaignFilter);
            const qs = params.toString();
            const href = `/admin/waitlist${qs ? `?${qs}` : ""}`;
            return (
              <a
                key={tab.value}
                href={href}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: isActive ? "var(--surface-3)" : "transparent",
                  color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                  textDecoration: "none",
                }}
              >
                {tab.label}
              </a>
            );
          })}
        </div>

        {/* Campaign filter */}
        {campaigns.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              Кампания:
            </span>
            <div
              className="flex items-center gap-1 p-1 rounded-xl w-fit"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-default)",
              }}
            >
              {[{ value: "", label: "Все" }, ...campaigns.map((c) => ({ value: c, label: c }))].map(
                (tab) => {
                  const isActive = (campaignFilter ?? "") === tab.value;
                  const params = new URLSearchParams();
                  if (statusFilter) params.set("status", statusFilter);
                  if (tab.value) params.set("campaign", tab.value);
                  const qs = params.toString();
                  const href = `/admin/waitlist${qs ? `?${qs}` : ""}`;
                  return (
                    <a
                      key={tab.value}
                      href={href}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{
                        background: isActive ? "var(--surface-3)" : "transparent",
                        color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                        textDecoration: "none",
                      }}
                    >
                      {tab.label}
                    </a>
                  );
                },
              )}
            </div>
          </div>
        )}
      </div>

      {/* Table / empty state */}
      {rows.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-20 rounded-xl"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <p
            className="text-sm font-medium mb-1"
            style={{ color: "var(--text-primary)" }}
          >
            Заявок нет
          </p>
          <p
            className="text-xs text-center max-w-xs"
            style={{ color: "var(--text-muted)" }}
          >
            {statusFilter
              ? `По фильтру «${STATUS_LABELS[statusFilter as SignupStatus] ?? statusFilter}» ничего не найдено.`
              : "Когда лендинг будет в проде, заявки появятся здесь."}
          </p>
        </div>
      ) : (
        <div
          className="rounded-xl overflow-x-auto"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm border-collapse">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-default)" }}>
                  {[
                    "Дата",
                    "Email",
                    "Телефон",
                    "Бренд",
                    "Креаторов",
                    "Источник",
                    "Кампания",
                    "Статус",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold whitespace-nowrap"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {h}
                    </th>
                  ))}
                  {/* Actions column — no header label */}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom:
                        i < rows.length - 1
                          ? "1px solid var(--border-subtle)"
                          : "none",
                    }}
                  >
                    {/* Date */}
                    <td
                      className="px-4 py-3 whitespace-nowrap font-mono text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {formatDate(row.createdAt.toISOString())}
                    </td>

                    {/* Email */}
                    <td
                      className="px-4 py-3 whitespace-nowrap text-xs"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {row.email}
                    </td>

                    {/* Phone */}
                    <td
                      className="px-4 py-3 whitespace-nowrap text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {row.phone ?? "—"}
                    </td>

                    {/* Brand */}
                    <td
                      className="px-4 py-3 text-xs font-medium max-w-[160px] truncate"
                      style={{ color: "var(--text-primary)" }}
                      title={row.brand}
                    >
                      {row.brand}
                    </td>

                    {/* Creators range */}
                    <td
                      className="px-4 py-3 whitespace-nowrap text-xs"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {row.creatorsRange}
                    </td>

                    {/* Source */}
                    <td
                      className="px-4 py-3 whitespace-nowrap text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {row.source ?? "—"}
                    </td>

                    {/* UTM Campaign */}
                    <td
                      className="px-4 py-3 whitespace-nowrap text-xs"
                      style={{ color: "var(--text-muted)" }}
                      title={[row.utmSource, row.utmMedium, row.utmCampaign].filter(Boolean).join(" / ") || undefined}
                    >
                      {row.utmCampaign ?? "—"}
                    </td>

                    {/* Status badge */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge status={row.status} />
                    </td>

                    {/* Status change form */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <form action={updateStatus} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={row.id} />
                        <select
                          name="status"
                          defaultValue={row.status}
                          className="text-xs rounded-md px-2 py-1.5 outline-none"
                          style={{
                            background: "var(--bg-muted)",
                            color: "var(--text-secondary)",
                            border: "1px solid var(--border-default)",
                          }}
                        >
                          <option value="new">Новая</option>
                          <option value="contacted">В работе</option>
                          <option value="onboarded">Онбордены</option>
                          <option value="rejected">Отклонена</option>
                        </select>
                        <button
                          type="submit"
                          className="text-xs px-2.5 py-1.5 rounded-md transition-colors"
                          style={{
                            background: "var(--accent-muted)",
                            color: "var(--accent-text)",
                            border: "1px solid var(--accent-border)",
                          }}
                        >
                          Сохранить
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TODO: добавить поле notes — модалку для записи комментариев по лиду */}
    </div>
  );
}
