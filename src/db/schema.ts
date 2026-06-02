import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  timestamp,
  pgEnum,
  serial,
  index,
} from "drizzle-orm/pg-core";

export const platformEnum = pgEnum("platform", [
  "tiktok",
  "youtube",
  "instagram",
  "likee",
  "pinterest",
]);

export const tenantRoleEnum = pgEnum("tenant_role", ["owner", "creator"]);

// ── Tenants ─────────────────────────────────────────────────────────────────
// One tenant per paying account. All domain data is scoped to a tenant.

export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .references(() => tenants.id)
    .notNull(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: tenantRoleEnum("role").notNull().default("owner"),
  // Nullable FK to creators.id — set when a creator-role user is created via invite.
  // Null for owner accounts and creator accounts not yet linked.
  creatorId: uuid("creator_id"),
  // null = bootstrapped owner whose auth still goes through ADMIN_EMAIL/ADMIN_PASSWORD env var.
  // Set on first invite-accept or self-serve signup.
  passwordHash: text("password_hash"),
  // Tracks whether the user has completed or skipped the onboarding wizard.
  // NULL = not yet seen, 'skipped' = dismissed, 'completed' = finished all steps.
  onboardingState: text("onboarding_state"),
  onboardingUpdatedAt: timestamp("onboarding_updated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const creators = pgTable(
  "creators",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id)
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    name: text("name").notNull(),
    avatarUrl: text("avatar_url"),
    tiktokUsername: text("tiktok_username"),
    youtubeChannelId: text("youtube_channel_id"),
    // Raw YouTube input как ввёл юзер (handle, URL или UC). Для UI-отображения,
    // чтобы не показывать пользователю сырой UC, если он ввёл @handle.
    // youtube_channel_id всегда хранит резолвленный UC для скрапера.
    youtubeHandle: text("youtube_handle"),
    instagramUsername: text("instagram_username"),
    pinterestUsername: text("pinterest_username"),
    // Note: Likee discovery was intentionally removed in 2026-04 — see
    // docs/likee-research.md. Manual Likee URL add through Settings →
    // Videos still works and metrics still flow via the Apify actor.
    // Per-creator video limit (TU allocation). NULL = no personal cap; enforced at tenant-pool level.
    videoLimit: integer("video_limit"),
    // Soft-delete: set when "deleted" while videos still reference the creator.
    // active queries (UI list, scraper) must filter `archived_at IS NULL`.
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("idx_creators_tenant_id").on(t.tenantId)],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id)
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    name: text("name").notNull(),
    wbArticle: text("wb_article").notNull(),
    category: text("category"),
    needsReview: integer("needs_review").default(0).notNull(), // 1 = auto-discovered, needs name
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("idx_products_tenant_id").on(t.tenantId)],
);

export const videos = pgTable(
  "videos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id)
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    creatorId: uuid("creator_id")
      .references(() => creators.id)
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id)
      .notNull(),
    platform: platformEnum("platform").notNull(),
    url: text("url").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    // Consecutive failed scrape nights. Reset to 0 on each successful scrape.
    // When >= 3, run_daily skips the video and UI shows "недоступно".
    failStreak: integer("fail_streak").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("idx_videos_tenant_id").on(t.tenantId)],
);

export const videoMetrics = pgTable("video_metrics", {
  id: uuid("id").defaultRandom().primaryKey(),
  videoId: uuid("video_id")
    .references(() => videos.id)
    .notNull(),
  views: bigint("views", { mode: "number" }).default(0).notNull(),
  likes: integer("likes").default(0).notNull(),
  comments: integer("comments").default(0).notNull(),
  shares: integer("shares").default(0).notNull(),
  saves: integer("saves").default(0).notNull(),
  scrapedAt: timestamp("scraped_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// One row per scraper job (`auto_discover`, `run_daily`, `audit`). Lets the
// scraper compute a self-healing lookback window — if prod was down for a
// week, the next run back-fills that week instead of the hardcoded 168h.
export const scraperState = pgTable("scraper_state", {
  jobName: text("job_name").primaryKey(),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastStatus: text("last_status"), // 'ok' | 'fail' | 'partial'
  lastMessage: text("last_message"),
});

// Lead capture from the public landing page. Not linked to users — pre-signup.
// Append-only: one row per submission, duplicates by email are intentional
// (a prospect may re-submit with corrected data).
export const waitlistSignups = pgTable(
  "waitlist_signups",
  {
    id: serial("id").primaryKey(),
    name: text("name"),                     // beta-form: applicant name
    email: text("email").notNull(),
    phone: text("phone"),
    telegramHandle: text("telegram_handle"), // beta-form: required for screening
    brand: text("brand").notNull(),          // brand + WB niche
    creatorsRange: text("creators_range").notNull(), // "3-5" | "6-10" | "11-20" | "20+"
    videoVolume: text("video_volume"),       // approx videos/month
    marketplace: text("marketplace"),        // "WB" | "WB+Ozon" | "другие"
    excelHours: text("excel_hours"),         // hours/month on manual analytics
    feedbackCommitment: text("feedback_commitment"), // "yes" | "no" — hard-filter
    goal: text("goal"),                      // what applicant wants from system
    source: text("source"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    utmContent: text("utm_content"),
    utmTerm: text("utm_term"),
    referrer: text("referrer"),
    consentAcceptedAt: timestamp("consent_accepted_at", {
      withTimezone: true,
    }).notNull(),
    // status: "new" | "in_cohort" | "rejected" | "awaiting_call"
    // "rejected" also covers feedback_commitment="no" hard-filter rejections
    status: text("status").notNull().default("new"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("idx_waitlist_signups_created_at").on(t.createdAt),
    index("idx_waitlist_signups_status").on(t.status),
    index("idx_waitlist_signups_utm_campaign").on(t.utmCampaign),
  ],
);

// ── Billing ──────────────────────────────────────────────────────────────────

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .references(() => tenants.id)
    .notNull(),
  userId: uuid("user_id")
    .references(() => users.id)
    .notNull(),
  tier: text("tier").notNull(), // 'solo' | 'pro' | 'studio' | 'custom'
  status: text("status").notNull().default("pending"), // 'pending' | 'active' | 'past_due' | 'cancelled'
  creatorLimit: integer("creator_limit").notNull(),
  currentPeriodStart: timestamp("current_period_start", {
    withTimezone: true,
  }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id)
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    subscriptionId: uuid("subscription_id").references(
      () => subscriptions.id,
    ),
    yookassaPaymentId: text("yookassa_payment_id").unique(),
    type: text("type").notNull(), // 'subscription' | 'topup'
    tier: text("tier"),
    amountKopecks: integer("amount_kopecks").notNull(),
    currency: text("currency").notNull().default("RUB"),
    status: text("status").notNull().default("pending"), // 'pending' | 'succeeded' | 'cancelled' | 'refunded'
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("idx_payments_user_id").on(t.userId),
    index("idx_payments_yookassa_id").on(t.yookassaPaymentId),
    index("idx_payments_status").on(t.status),
  ],
);

// Inferred types for use in application code
export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type TenantRole = (typeof tenantRoleEnum.enumValues)[number];

export type Creator = typeof creators.$inferSelect;
export type NewCreator = typeof creators.$inferInsert;

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

export type Video = typeof videos.$inferSelect;
export type NewVideo = typeof videos.$inferInsert;

export type VideoMetric = typeof videoMetrics.$inferSelect;
export type NewVideoMetric = typeof videoMetrics.$inferInsert;

export type ScraperState = typeof scraperState.$inferSelect;
export type NewScraperState = typeof scraperState.$inferInsert;

export type Platform = (typeof platformEnum.enumValues)[number];

export type WaitlistSignup = typeof waitlistSignups.$inferSelect;
export type NewWaitlistSignup = typeof waitlistSignups.$inferInsert;

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;

// ── Admin settings ────────────────────────────────────────────────────────────
// Key-value store for admin configuration overrides (e.g. password_hash).
export const adminSettings = pgTable("admin_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Invite tokens ─────────────────────────────────────────────────────────────
// Owner generates a token to invite a creator. Token is single-use, 7-day TTL.
// email is optional — null means a shareable link (no specific recipient).
export const inviteTokens = pgTable(
  "invite_tokens",
  {
    token: text("token").primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id).notNull(),
    email: text("email"),
    // Which creator this invite is for. Required — invites must target a creator.
    creatorId: uuid("creator_id").references(() => creators.id, { onDelete: "cascade" }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_invite_tokens_tenant_id").on(t.tenantId)],
);

export type InviteToken = typeof inviteTokens.$inferSelect;
export type NewInviteToken = typeof inviteTokens.$inferInsert;

// ── Password reset tokens ─────────────────────────────────────────────────────
// Single-use tokens for resetting owner passwords. TTL: 1 hour.
// Global table — not per-tenant (password resets cross tenant context).
export const passwordResetTokens = pgTable("password_reset_tokens", {
  token: text("token").primaryKey(),
  email: text("email").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;
