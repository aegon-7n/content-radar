import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";

export const platformEnum = pgEnum("platform", [
  "tiktok",
  "youtube",
  "instagram",
  "likee",
  "pinterest",
]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const creators = pgTable("creators", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id)
    .notNull(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  tiktokUsername: text("tiktok_username"),
  youtubeChannelId: text("youtube_channel_id"),
  instagramUsername: text("instagram_username"),
  likeeUsername: text("likee_username"),
  // Likee has no public username→uid lookup that survives their bot
  // protection. The seller pastes the numeric uid manually from devtools
  // and we use it directly in fetch_likee_videos.
  likeeUid: text("likee_uid"),
  pinterestUsername: text("pinterest_username"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
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
});

export const videos = pgTable("videos", {
  id: uuid("id").defaultRandom().primaryKey(),
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
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

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

// Inferred types for use in application code
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

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
