# src/db/ — Drizzle-схема и подключение к PostgreSQL

`schema.ts` — единственный источник правды для структуры БД. И TypeScript-код, и Python-скрейпер ходят в одни и те же таблицы; колонки нужно держать синхронно.

## Таблицы

```
tenants (1) ─┬─→ users (N)
             ├─→ creators (N) ──┐
             ├─→ products (N) ──┤
             │                   ↓
             │                videos (N) ──→ video_metrics (M)
             │                  │
             │                  └─ fail_streak ≥ 3 → "недоступно"
             ├─→ subscriptions (1)
             └─→ payments (N)

scraper_state    — отдельная таблица для метаданных трёх крон-джобов.
waitlist_signups — лиды с публичного лендинга. Не связана с users.
referral_codes   — промокоды партнёров. Не привязана к тенанту.
```

**`tenants`** — организация (бренд/магазин). `id` (uuid PK), `name` (text), `slug` (text UNIQUE), `created_at`. Все пользовательские данные привязаны к тенанту.

**`tenant_role`** — enum: `'owner'` | `'creator'`. Определяет права пользователя внутри тенанта.

**`users`** — пользователь системы. Принадлежит тенанту (`tenant_id` FK NOT NULL). Поле `role` (tenant_role, default `'owner'`) определяет уровень доступа. `password_hash` (nullable) — bcrypt-хэш пароля creator-пользователей, созданных через invite flow. Owner-аккаунт может иметь `null` здесь (его пароль хранится в `admin_settings`).

**`creators`** — имя + handles на каждой платформе (`tiktok_username`, `youtube_channel_id`, `instagram_username`, `pinterest_username`). `tenant_id` FK NOT NULL — креатор принадлежит конкретному тенанту. Заполнен handle → `auto_discover` пойдёт за роликами этой платформы.
- Likee handle тут **намеренно нет** — discovery невозможен (см. [docs/likee-research.md](../../docs/likee-research.md)). Likee ролики добавляются вручную через `/settings` → Videos.

**`products`** — товар на Wildberries. `wb_article` — артикул, `needs_review = 1` означает что товар создан автоматически из артикула в описании ролика (`auto_discover`) и менеджер должен поставить нормальное имя. `tenant_id` FK NOT NULL.

**`videos`** — конкретный ролик. Связь `1 ролик = 1 креатор + 1 товар + 1 платформа`. `tenant_id` FK NOT NULL. URL ролика — уникальная сущность (используется для дедупликации в `auto_discover`).
- **`fail_streak`** инкрементится при каждой неудачной попытке скрейпинга подряд, обнуляется при успехе. `>= 3` → ролик пропускается всеми будущими прогонами `run_daily`, в UI показывается тегом "недоступно". Это защищает от траты квоты API на удалённые/приватные ролики.

**`video_metrics`** — снимок метрик. **Append-only**: каждый успешный скрейп добавляет новую строку с `scraped_at`. Не UPDATE, не UPSERT — иначе сломается аналитика динамики. Все агрегаты считаются как разница между `MAX(views) WHERE scraped_at <= to` и `MAX(views) WHERE scraped_at <= from` для каждого ролика.

**`scraper_state`** — одна строка на джоб (`'auto_discover'`, `'run_daily'`, `'audit'`). Хранит `last_success_at`, `last_run_at`, `last_status`, `last_message`. Используется:
- скрейпером — для self-healing lookback (`compute_lookback_hours`),
- API `/api/health` — для светофора в UI и health-check'ов.

**`waitlist_signups`** — лиды с публичного лендинга. Не связана с `users` — это pre-signup записи. Поля:

| Колонка | Тип | Назначение |
|---|---|---|
| `id` | serial | PK, auto-increment |
| `email` | text NOT NULL | Контактный email заявителя |
| `phone` | text | Телефон (опционально) |
| `brand` | text NOT NULL | Название бренда/магазина |
| `creators_range` | text NOT NULL | Кол-во креаторов: `"1-5"` / `"6-20"` / `"20+"` |
| `source` | text | Идентификатор формы (legacy, для обратной совместимости) |
| `utm_source` | text | UTM-параметр: источник трафика (`partner`, `founder`, …) |
| `utm_medium` | text | UTM-параметр: канал (`telegram`, `email`, …) |
| `utm_campaign` | text | UTM-параметр: кампания (`cohort_a_teaser`, …) |
| `utm_content` | text | UTM-параметр: вариант креатива |
| `utm_term` | text | UTM-параметр: ключевое слово |
| `referrer` | text | HTTP Referer на момент отправки формы |
| `consent_accepted_at` | timestamptz NOT NULL | Момент согласия с политикой (GDPR-трекинг) |
| `status` | text DEFAULT `'new'` | Этап воронки: `"new"` / `"contacted"` / `"onboarded"` / `"rejected"` |
| `notes` | text | Внутренние заметки менеджера |
| `created_at` | timestamptz DEFAULT now() | Время создания записи |

Как наполняется: через POST `/api/waitlist` (endpoint — вторая фаза). Лендинг (`content-radar-landing/`) делает server-to-server запрос на основной VPS.

Инварианты `waitlist_signups`:
- **Append-only по смыслу лида.** Один email может появиться дважды — это валидно (человек исправил данные, отправил снова). Поэтому `UNIQUE` на `email` **не ставится**.
- Не апсертим — каждая отправка формы = новая строка.
- `consent_accepted_at` заполняет лендинг в момент клика «Отправить» — не `DEFAULT NOW()`, чтобы зафиксировать реальный момент согласия, а не момент записи в БД.

Индексы:
- `idx_waitlist_signups_created_at` ON `created_at` — основная сортировка в админ-странице (`ORDER BY created_at DESC`).
- `idx_waitlist_signups_status` ON `status` — фильтрация по этапу воронки.
- `idx_waitlist_signups_utm_campaign` ON `utm_campaign` — фильтрация по кампании в `/admin/waitlist`.

**`subscriptions`** — текущая подписка тенанта. Одна строка на тенант. `tenant_id` FK NOT NULL. Поля:
- `tier` — `'solo'` / `'pro'` / `'studio'` / `'custom'`
- `status` — `'pending'` / `'active'` / `'past_due'` / `'cancelled'`
- `creator_limit` — максимум креаторов на тарифе (5/10/20)
- `current_period_start` / `current_period_end` — границы оплаченного периода (30 дней)

При успешной оплате webhook обновляет или создаёт строку с `status = 'active'`, ставит `creator_limit` из `TIER_CONFIG`, ставит новый период.

**`payments`** — лог всех платёжных операций. `tenant_id` FK NOT NULL. Append-only по смыслу (статусы обновляются через webhook). Поля:
- `yookassa_payment_id` — ID платежа в ЮKassa (UNIQUE, для дедупликации webhook)
- `type` — `'subscription'`
- `tier` — какой тариф оплачивался (nullable)
- `amount_kopecks` — сумма в копейках (4900₽ = 490000)
- `status` — `'pending'` / `'succeeded'` / `'cancelled'` / `'refunded'`
- `paid_at` — момент подтверждения оплаты (из webhook)

Индексы: `user_id`, `yookassa_payment_id`, `status`.

**`invite_tokens`** — однократные токены для приглашения creator-пользователей. `tenant_id` FK NOT NULL, `invited_by_user_id` FK NOT NULL. `email` nullable (null = sharable link без конкретного адресата). TTL 7 дней, `used_at` помечает использование.

**`admin_settings`** — KV-хранилище для настроек admin-аккаунта. Используется для хранения bcrypt-хэша пароля owner-а после сброса через forgot-password flow. `key = 'password_hash'`, `value = bcrypt hash`. Нет FK — глобальная таблица (не per-tenant).

**`password_reset_tokens`** — одноразовые токены сброса пароля для owner-аккаунта. TTL 1 час, `used_at` помечает использование. Нет FK — глобальная таблица.

## Enums

```ts
platformEnum = ["tiktok", "youtube", "instagram", "likee", "pinterest"]
tenantRoleEnum = ["owner", "creator"]
```

**`platformEnum`** — платформа ролика.

Любое добавление платформы — это: миграция enum + новый scraper в `scraper/scrapers/` + UI-цвет в `lib/format.ts:getPlatformColor` + лейбл в `getPlatformLabel`. Не меньше четырёх мест.

## Файлы

- `schema.ts` — определения таблиц + inferred-типы (`Tenant`, `TenantRole`, `User`, `Creator`, `Product`, `Video`, `VideoMetric`, `ScraperState`, `Platform`, `WaitlistSignup`, `Subscription`, `Payment`).
- `index.ts` — drizzle-клиент (используется в API-роутах).
- `seed.ts` — реальные данные клиента (3 креатора, ~13 товаров с артикулами WB). Сначала создаёт тенант, затем использует его ID во всех INSERT'ах. Запускается через `npm run db:seed`.

## Правила

- **Все timestamps `withTimezone: true`** и хранятся в UTC. Форматирование локали — на UI.
- **`video_metrics` append-only.** Никогда не делать `UPDATE views = ...`. Если нужно «исправить» прошлый снимок — добавь новый.
- **Внешние ключи строго `notNull()`** для `tenantId`/`userId`/`creatorId`/`productId`. Сирот в проекте быть не должно.
- **`tenant_id` обязателен в каждом INSERT и WHERE.** Все таблицы с пользовательскими данными (creators, products, videos, subscriptions, payments) скоупятся по `tenant_id`. Пропущенный `tenant_id` — дыра в изоляции данных между тенантами.
- **`bigint` для views** — у TikTok бывают ролики >2.1 млрд просмотров (out of int32 range). Лайки/комменты `int` — границу не трогали.
- **Миграции через `drizzle-kit`.** Локально используется `db:push` (применяет изменения схемы напрямую без файла миграции — ок для single-dev), на проде — `db:generate` + `db:migrate`.
- **Аналитика динамики** ("% к прошлой неделе") — оконные функции `LAG()` или подзапрос с двумя `MAX(scraped_at)`. См. реализацию delta-модели в `app/api/dashboard/route.ts`.

## Контракт со скрейпером

Python-код в `scraper/db.py` пишет напрямую в `video_metrics` через `psycopg2`. Колонки и их типы должны **совпадать с тем, что видит drizzle**. Если меняешь схему — пройдись по `scraper/db.py`, `scraper/run_daily.py`, `scraper/auto_discover.py`, `scraper/audit.py` и проверь все INSERT/UPDATE-запросы. CI на это не ловит — драйвер просто упадёт в проде.

Таблицы `creators`, `products`, `videos` теперь имеют `tenant_id`. Python-код в `scraper/db.py` **обязан** включать `tenant_id` во все INSERT-запросы в эти таблицы, иначе NOT NULL constraint упадёт.
