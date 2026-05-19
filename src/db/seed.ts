import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import type { Platform } from "./schema";

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString, { prepare: false });
const db = drizzle(client, { schema });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const TODAY = new Date("2026-04-03T10:00:00Z");

function daysAgo(n: number): Date {
  const d = new Date(TODAY);
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(randInt(8, 22), randInt(0, 59), 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

// ---------------------------------------------------------------------------
// Realistic video archetypes
// ---------------------------------------------------------------------------

type Archetype = "viral" | "slow_burn" | "flop" | "spike_decay" | "steady" | "late_bloomer";

function getArchetype(): Archetype {
  const r = Math.random();
  if (r < 0.08) return "viral";        // 8%  — взрывной рост
  if (r < 0.20) return "spike_decay";  // 12% — взлетел и упал
  if (r < 0.38) return "steady";       // 18% — ровный рост
  if (r < 0.55) return "slow_burn";    // 17% — медленный рост
  if (r < 0.68) return "late_bloomer"; // 13% — разогрелся через неделю
  return "flop";                       // 32% — не зашло
}

// Final views по платформе и архетипу
function finalViewsByArchetype(platform: Platform, archetype: Archetype): number {
  const base: Record<Platform, [number, number]> = {
    tiktok:    [30_000,  2_500_000],
    youtube:   [8_000,    600_000],
    instagram: [15_000,   400_000],
    likee:     [3_000,    250_000],
    pinterest: [5_000,    500_000],
  };
  const [min, max] = base[platform];

  switch (archetype) {
    case "viral":       return randInt(max * 0.7, max * 1.5 | 0);
    case "spike_decay": return randInt(max * 0.3, max * 0.8 | 0);
    case "steady":      return randInt(max * 0.15, max * 0.5 | 0);
    case "slow_burn":   return randInt(max * 0.1, max * 0.35 | 0);
    case "late_bloomer":return randInt(max * 0.2, max * 0.6 | 0);
    case "flop":        return randInt(min, max * 0.06 | 0);
  }
}

// Growth curve: returns fraction (0..1) of final views on day `d` out of `total` days
function growthFraction(d: number, total: number, archetype: Archetype): number {
  if (total === 0) return 1;
  const t = d / total; // 0..1

  switch (archetype) {
    case "viral": {
      // Быстрый взрывной рост в первые 2-3 дня, потом плато
      if (t < 0.1) return t * 6;            // взлёт
      if (t < 0.2) return 0.6 + t * 1.5;   // пик
      return Math.min(1, 0.85 + t * 0.15);  // плато
    }
    case "spike_decay": {
      // Взлёт → падение → небольшое плато
      if (t < 0.15) return t * 5;
      if (t < 0.3)  return Math.max(0.3, 0.75 - (t - 0.15) * 2);
      return 0.3 + t * 0.1;
    }
    case "steady": {
      // Логистическая кривая — равномерный рост
      return 1 / (1 + Math.exp(-8 * (t - 0.4)));
    }
    case "slow_burn": {
      // Очень медленный старт, набирает к концу
      return Math.pow(t, 2.5);
    }
    case "late_bloomer": {
      // Тихо лежит первые 40%, потом взрыв
      if (t < 0.4) return t * 0.1;
      return 0.04 + Math.pow((t - 0.4) / 0.6, 1.5) * 0.96;
    }
    case "flop": {
      // Минимальный рост, почти сразу плато
      return Math.min(1, t * 3 + 0.1);
    }
  }
}

// Шум на кривой — реалистичные дневные колебания
function withNoise(value: number, noisePct: number = 0.12): number {
  const noise = 1 + randFloat(-noisePct, noisePct);
  return Math.max(0, Math.round(value * noise));
}

function engagement(views: number, platform: Platform) {
  const rates: Record<Platform, { like: number; comment: number; share: number; save: number }> = {
    tiktok:    { like: 0.065, comment: 0.006, share: 0.018, save: 0.035 },
    youtube:   { like: 0.042, comment: 0.009, share: 0.004, save: 0.002 },
    instagram: { like: 0.055, comment: 0.004, share: 0.012, save: 0.028 },
    likee:     { like: 0.075, comment: 0.007, share: 0.014, save: 0.012 },
    pinterest: { like: 0.025, comment: 0.002, share: 0.025, save: 0.065 },
  };
  const r = rates[platform];
  const j = () => randFloat(0.75, 1.3);
  return {
    likes:    Math.round(views * r.like    * j()),
    comments: Math.round(views * r.comment * j()),
    shares:   Math.round(views * r.share   * j()),
    saves:    Math.round(views * r.save    * j()),
  };
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function seed() {
  console.log("Seeding database...");

  // 1. Tenant + User
  const [tenant] = await db.insert(schema.tenants)
    .values({ name: "ContentRadar Demo", slug: "contentradar-demo", createdAt: daysAgo(90) })
    .returning();

  const [user] = await db.insert(schema.users)
    .values({ tenantId: tenant.id, email: "admin@content-radar.ru", name: "Администратор", role: "owner", createdAt: daysAgo(90) })
    .returning();

  // 2. Creators — разные профили активности
  const [polina, katyaE, katyaDDD] = await db.insert(schema.creators)
    .values([
      { tenantId: tenant.id, userId: user.id, name: "Полина",       createdAt: daysAgo(90) },
      { tenantId: tenant.id, userId: user.id, name: "Катя Ежикова", createdAt: daysAgo(90) },
      { tenantId: tenant.id, userId: user.id, name: "Катя ДДД",     createdAt: daysAgo(90) },
    ])
    .returning();

  // 3. Products — у каждого своя «популярность»
  const productDefs = [
    { name: "Снег",           wbArticle: "368387486", hotness: 0.9  },
    { name: "Кошка",          wbArticle: "248332917", hotness: 1.4  },
    { name: "Капибара",       wbArticle: "367665209", hotness: 0.5  },
    { name: "Выдра",          wbArticle: "215440193", hotness: 0.7  },
    { name: "Куб",            wbArticle: "237105180", hotness: 0.4  },
    { name: "Заяц",           wbArticle: "595648937", hotness: 0.6  },
    { name: "Стич",           wbArticle: "596897327", hotness: 1.1  },
    { name: "Рисовашка",      wbArticle: "197585688", hotness: 0.3  },
    { name: "Коала",          wbArticle: "293857227", hotness: 0.8  },
    { name: "Тюльпан облако", wbArticle: "229256333", hotness: 1.2  },
    { name: "Звездное небо",  wbArticle: "44074423",  hotness: 0.65 },
  ];

  const productRows = await db.insert(schema.products)
    .values(productDefs.map(p => ({ tenantId: tenant.id, userId: user.id, name: p.name, wbArticle: p.wbArticle, createdAt: daysAgo(90) })))
    .returning();

  // map wbArticle → { row, hotness }
  const productMap = new Map(
    productRows.map((r, i) => [r.wbArticle, { row: r, hotness: productDefs[i].hotness }])
  );
  const allProducts = productRows;

  // ---------------------------------------------------------------------------
  // 4. Генерация видео
  // ---------------------------------------------------------------------------

  type VideoSpec = {
    creatorId: string;
    productId: string;
    platform: Platform;
    url: string;
    publishedAt: Date;
    finalViews: number;
    archetype: Archetype;
  };

  const specs: VideoSpec[] = [];
  const platforms: Platform[] = ["tiktok", "youtube", "instagram", "likee", "pinterest"];

  // --- ПОЛИНА: главный контент-мейкер, 3-6 видео в день, иногда выходной ---
  // Сильная на TikTok и Instagram, средняя на остальных
  const polinaPlatformWeights: Record<Platform, number> = {
    tiktok: 0.40, instagram: 0.25, youtube: 0.15, likee: 0.12, pinterest: 0.08,
  };

  for (let day = 30; day >= 0; day--) {
    // Выходные (пн=0 в JS) — иногда меньше
    const date = daysAgo(day);
    const dow = date.getUTCDay(); // 0=Sun, 6=Sat
    const isWeekend = dow === 0 || dow === 6;

    // Иногда выходной совсем (10% вероятность)
    if (isWeekend && Math.random() < 0.15) continue;

    const count = isWeekend ? randInt(1, 3) : randInt(3, 6);

    for (let i = 0; i < count; i++) {
      // Выбираем платформу с весами
      const r = Math.random();
      let cumulative = 0;
      let platform: Platform = "tiktok";
      for (const [p, w] of Object.entries(polinaPlatformWeights)) {
        cumulative += w;
        if (r < cumulative) { platform = p as Platform; break; }
      }

      const productEntry = pick([...productMap.values()]);
      const archetype = getArchetype();
      const baseViews = finalViewsByArchetype(platform, archetype);
      // Умножаем на "популярность" товара
      const finalViews = Math.round(baseViews * productEntry.hotness);

      specs.push({
        creatorId: polina.id,
        productId: productEntry.row.id,
        platform,
        url: `https://${platform}.com/@polina/video/${day}_${i}_${Date.now() % 100000}`,
        publishedAt: daysAgo(day),
        finalViews,
        archetype,
      });
    }
  }

  // --- КАТЯ ЕЖИКОВА: специализируется на TikTok, 2-4 видео в день, нерегулярно ---
  // Иногда пропускает несколько дней подряд
  let katyaEDay = 30;
  while (katyaEDay >= 0) {
    // Иногда пропуск 1-3 дня
    if (Math.random() < 0.25) {
      katyaEDay -= randInt(1, 3);
      continue;
    }

    const count = randInt(2, 4);
    for (let i = 0; i < count; i++) {
      // 60% TikTok, 20% YouTube, 20% другие
      const r = Math.random();
      const platform: Platform = r < 0.60 ? "tiktok" : r < 0.80 ? "youtube" : pick(["instagram", "likee", "pinterest"] as Platform[]);
      const productEntry = pick([...productMap.values()]);
      const archetype = getArchetype();
      const finalViews = Math.round(finalViewsByArchetype(platform, archetype) * productEntry.hotness);

      specs.push({
        creatorId: katyaE.id,
        productId: productEntry.row.id,
        platform,
        url: `https://${platform}.com/@katyae/video/${katyaEDay}_${i}_${Date.now() % 100000}`,
        publishedAt: daysAgo(katyaEDay),
        finalViews,
        archetype,
      });
    }
    katyaEDay -= 1;
  }

  // Pinned TikTok data из брифа (Катя Ежикова, реальные данные)
  const katyaETikTokPinned = [
    { article: "368387486", views: 890_000 },
    { article: "248332917", views: 1_580_000 },
    { article: "367665209", views: 75_000 },
    { article: "215440193", views: 372_000 },
    { article: "596897327", views: 613_000 },
  ];
  for (const { article, views } of katyaETikTokPinned) {
    const product = productMap.get(article)!;
    specs.push({
      creatorId: katyaE.id,
      productId: product.row.id,
      platform: "tiktok",
      url: `https://tiktok.com/@katyae/video/pinned_${article}`,
      publishedAt: daysAgo(randInt(8, 22)),
      finalViews: views,
      archetype: views > 500_000 ? "viral" : "spike_decay",
    });
  }

  // --- КАТЯ ДДД: новичок, меньше опыта, 1-3 видео в день, часто флопает ---
  // Равномерно по всем платформам, больше флопов
  let katyaDDDDay = 28;
  while (katyaDDDDay >= 0) {
    if (Math.random() < 0.30) {
      katyaDDDDay -= randInt(1, 2);
      continue;
    }

    const count = randInt(1, 3);
    for (let i = 0; i < count; i++) {
      const platform = pick(platforms);
      const productEntry = pick(allProducts.slice(0, 7)); // только часть товаров
      const productHotness = productMap.get(productEntry.wbArticle)?.hotness ?? 0.5;

      // У новичка больше флопов — смещаем вероятности
      const r = Math.random();
      const archetype: Archetype = r < 0.50 ? "flop" : r < 0.65 ? "slow_burn" : r < 0.80 ? "steady" : r < 0.92 ? "spike_decay" : "viral";

      specs.push({
        creatorId: katyaDDD.id,
        productId: productEntry.id,
        platform,
        url: `https://${platform}.com/@katyaddd/video/${katyaDDDDay}_${i}_${Date.now() % 100000}`,
        publishedAt: daysAgo(katyaDDDDay),
        finalViews: Math.round(finalViewsByArchetype(platform, archetype) * productHotness * 0.7),
        archetype,
      });
    }
    katyaDDDDay -= 1;
  }

  // Вставляем видео
  const videoInserts: schema.NewVideo[] = specs.map(s => ({
    tenantId:   tenant.id,
    userId:     user.id,
    creatorId:  s.creatorId,
    productId:  s.productId,
    platform:   s.platform,
    url:        s.url,
    publishedAt: s.publishedAt,
  }));

  console.log(`  Inserting ${videoInserts.length} videos...`);
  const videoRows = await db.insert(schema.videos).values(videoInserts).returning();

  // ---------------------------------------------------------------------------
  // 5. Метрики — дневные снапшоты с реалистичными кривыми
  // ---------------------------------------------------------------------------
  console.log("  Building metric snapshots...");

  const metricInserts: schema.NewVideoMetric[] = [];

  for (let i = 0; i < videoRows.length; i++) {
    const video = videoRows[i];
    const spec  = specs[i];
    const published = spec.publishedAt;
    const daysSincePublish = Math.floor((TODAY.getTime() - published.getTime()) / 86_400_000);

    let prevViews = 0;
    for (let d = 0; d <= daysSincePublish; d++) {
      const scrapedAt = addDays(published, d);
      scrapedAt.setUTCHours(4 + (i % 5), randInt(0, 30), 0, 0);

      const fraction = growthFraction(d, daysSincePublish, spec.archetype);
      // Views must be monotonically non-decreasing — real views never go backwards
      const rawViews = withNoise(Math.round(spec.finalViews * fraction), 0.08);
      const views = Math.max(prevViews, rawViews);
      prevViews = views;
      const eng = engagement(views, spec.platform);

      metricInserts.push({
        videoId:   video.id,
        views:     Math.max(0, views),
        likes:     Math.max(0, eng.likes),
        comments:  Math.max(0, eng.comments),
        shares:    Math.max(0, eng.shares),
        saves:     Math.max(0, eng.saves),
        scrapedAt,
      });
    }
  }

  // Batch insert по 500
  const CHUNK = 500;
  let saved = 0;
  for (let i = 0; i < metricInserts.length; i += CHUNK) {
    await db.insert(schema.videoMetrics).values(metricInserts.slice(i, i + CHUNK));
    saved += Math.min(CHUNK, metricInserts.length - i);
    process.stdout.write(`\r  Metrics: ${saved}/${metricInserts.length}`);
  }
  console.log("");

  console.log("\nSeed complete.");
  console.log(`  Videos:       ${videoRows.length}`);
  console.log(`  Metrics:      ${metricInserts.length}`);
  console.log(`  Archetypes:   viral=${specs.filter(s=>s.archetype==="viral").length} spike=${specs.filter(s=>s.archetype==="spike_decay").length} steady=${specs.filter(s=>s.archetype==="steady").length} slow=${specs.filter(s=>s.archetype==="slow_burn").length} late=${specs.filter(s=>s.archetype==="late_bloomer").length} flop=${specs.filter(s=>s.archetype==="flop").length}`);
}

seed()
  .catch((err) => { console.error("Seed failed:", err); process.exit(1); })
  .finally(() => { void client.end(); process.exit(0); });
