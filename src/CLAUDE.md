# src/ — Next.js 14 App Router (фронт + API)

Next.js 14, App Router, TypeScript strict, Tailwind, Drizzle ORM. Тёмная тема по умолчанию, шрифт Geist Sans/Mono.

## Карта папок

```
app/         маршруты (страницы + API)
components/  переиспользуемая UI (layout, ui-kit, providers)
db/          drizzle-схема и подключение (см. src/db/CLAUDE.md)
lib/         утилиты форматирования, моки, helpers
middleware.ts  next-auth guard на все маршруты кроме /login, /api/auth, /api/forgot-password, /api/reset-password, /api/scrape, /api/waitlist, /api/billing/webhooks, статика
types/       глобальные .d.ts
```

## Маршруты `app/`

- **`/`** — главный дашборд: KPI-карточки, line-chart по дням, donut по платформам, топ-5 роликов. Использует `getPeriodDates()` из `PeriodSelector`.
- **`/creators`**, **`/creators/[id]`** — список и детальная.
- **`/products`**, **`/products/[id]`** — список и детальная.
- **`/videos`**, **`/videos/[id]`** — список с фильтрами/сортировкой/пагинацией и детальная.
- **`/settings`** — пять табов: `CreatorsTab`, `ProductsTab`, `VideosTab`, `ImportTab`, `BillingTab`. Сабкомпоненты — в `app/settings/_components/`. `?tab=billing` открывает сразу вкладку подписки; `?status=success` показывает тост после редиректа из ЮKassa.
- **`/settings/team`** — список пользователей тенанта (owner + creators), кнопка «Пригласить», отзыв доступа. Только для owner.
- **`/login`** — форма, NextAuth `signIn("credentials")`, редирект на `/`.
- **`/invite/[token]`** — публичная страница принятия инвайта. Creator вводит имя/пароль и создаёт аккаунт в тенанте owner-а. Исключена из middleware guard.
- **`/forgot-password`** — форма запроса письма для сброса пароля. Публичная.
- **`/reset-password`** — форма ввода нового пароля по токену из письма. Публичная.

## API-эндпоинты `app/api/`

**Аутентификация**
- `auth/[...nextauth]` — NextAuth handler. CredentialsProvider, JWT-сессия 30 дней. `tenant_id` запекается в JWT при логине — per-request DB lookup не нужен. Два пути авторизации: owner-путь (по `ADMIN_EMAIL`, пароль проверяется через `adminSettings.key=password_hash` bcrypt или env-var fallback) + creator-путь (любой другой email, bcrypt через `users.password_hash`).
- `auth/register` — POST, создаёт тенант + owner-юзера атомарно. Защищён `Authorization: Bearer ${REGISTER_SECRET}`. Добавлен в middleware allowlist (покрывается паттерном `/api/auth`).
- `auth/invite/[token]` — GET, возвращает инфо об инвайте (email, tenantName). Публичный.
- `auth/invite/[token]/accept` — POST, создаёт creator-пользователя по инвайту (имя + пароль). Публичный. После создания инвайт помечается usedAt.
- `forgot-password` — POST, генерирует одноразовый токен сброса (32 байта), пишет в `password_reset_tokens`, отправляет письмо через Resend. Всегда 200 (предотвращает email enumeration). Публичный — добавлен в middleware allowlist. **Не** под `/api/auth/` — NextAuth catch-all `[...nextauth]` перехватил бы.
- `reset-password` — POST, проверяет токен (срок 1ч, не использован), bcrypt-хэшит новый пароль, записывает в `adminSettings.key=password_hash`, помечает токен usedAt. Публичный — добавлен в middleware allowlist.

**Чтение (UI зовёт это)**
- `dashboard` — агрегаты + delta-модель за период (`?from=&to=&category=`).
- `creators`, `creators/[id]` — список и детали.
- `products`, `products/[id]`.
- `videos`, `videos/[id]`, `videos/export` (CSV).
- `last-sync` — `MAX(scraped_at)` из `video_metrics`.
- `health` — статус трёх scraper-джобов из `scraper_state`.

**Инвайты и команда**
- `invites` — GET (список активных инвайтов тенанта) + POST (создать инвайт). Только owner (`requireOwner()`).
- `invites/[userId]` — DELETE, отзывает доступ creator (удаляет юзера из тенанта). Только owner.

**Запись (`/api/settings/...`, POST/PUT/DELETE)**
- `settings/{creators,products,videos}` + `[id]`-варианты.
- `settings/import` — CSV/bulk-импорт.

**Внутренний триггер**
- `scrape` — POST с `Authorization: Bearer ${SCRAPE_SECRET}`. Спавнит Python-subprocess в `scraper/`. Поддерживает `?async=true` (202 + фоновый запуск) или блокирующий режим. Не выставлять наружу без токена.

**Биллинг (ЮKassa)**
- `billing/subscribe` — POST, создаёт платёж в ЮKassa и запись в `payments`. Возвращает `paymentUrl` для редиректа. Требует auth.
- `billing/status` — GET, возвращает текущую подписку + последние 10 платежей. Требует auth.
- `billing/webhooks/yookassa` — POST, принимает уведомления от ЮKassa (`payment.succeeded`, `payment.canceled`). Публичный (добавлен в middleware allowlist). Верифицирует платёж через re-fetch API.

**Публичный приём заявок (без NextAuth-сессии)**
- `waitlist` — POST с `Authorization: Bearer ${WAITLIST_INGEST_SECRET}`. Принимает заявки с лендинга (`content-radar-landing` на Vercel). Поток: Zod-валидация → in-memory rate limit (5 req/min/IP) → INSERT в `waitlist_signups` → Resend email пользователю + Telegram-уведомление админу. Если `RESEND_API_KEY` или Telegram env не заданы — пропускает соответствующий шаг с `console.warn`, не падает. Путь `/api/waitlist` явно исключён из NextAuth-middleware через allowlist в `config.matcher`.

## Маршруты `/admin/`

- **`/admin/waitlist`** — Server Component за NextAuth (middleware защищает всё кроме `/api` и `/login`). Таблица заявок с фильтром по статусу (`?status=new|contacted|onboarded|rejected`), сортировка `created_at DESC`, лимит 100. Смена статуса — Server Action `updateStatus` (form + hidden id + select). Счётчики «Всего / Новых» в шапке. Ссылка в боковом меню под «Настройки».

## Паттерны

**Server vs client.** Корневой `layout.tsx` — server. Большинство страниц-листов и дашборд — `"use client"`, т.к. нужны `useState` для периода/сортировки и `useEffect` для запросов. `Header`/`Sidebar`/`AppShell` — тоже клиентские (нужен `usePathname`). API-роуты, естественно, server.

**Получение данных.** Страницы **никогда** не ходят в БД напрямую — только через `fetch('/api/...')`. Вся работа с Drizzle живёт в `app/api/*/route.ts`. На сетевой ошибке UI падает на `mock-data.ts` чтобы не показывать пустоту в деве.

**Аутентификация (defense in depth).** Два слоя:
1. [middleware.ts](middleware.ts) — `getToken` из `next-auth/jwt`, fail-closed (try/catch → 401). Все маршруты требуют JWT-токен, кроме allowlist: `/login`, `/invite`, `/forgot-password`, `/reset-password`, `/robots.txt`, `/sitemap.xml`, `/api/auth`, `/api/forgot-password`, `/api/reset-password`, `/api/scrape`, `/api/waitlist`, `/api/billing/webhooks`, статика.
2. Route-level guard — каждый API handler вызывает `requireAuthWithTenant(request)` из `lib/tenant.ts` перед любой логикой. Возвращает `{ userId, tenantId }`. Если middleware упадёт/пропустит, хендлер сам вернёт 401. `tenant_id` берётся из JWT (запекается при логине) — per-request DB lookup не нужен.

Новые API-маршруты **обязаны** вызвать `requireAuthWithTenant` (из `lib/tenant.ts`) в каждом экспортируемом handler и скоупить все запросы по `tenantId`. Для owner-only маршрутов используй `requireOwner(request)` из того же файла — проверяет `role === 'owner'` из JWT. Для публичного маршрута — добавить в `config.matcher` allowlist и не вызывать `requireAuthWithTenant`.

**Стили.** Tailwind + CSS-переменные (`--bg-base`, `--surface-1`, `--text-primary`, `--accent-primary`, `--shadow-card`, etc.). Цвета платформ — через `getPlatformColor()` в `lib/format.ts`. Шрифты — `geist`.

**Delta-модель аналитики.** Прирост за период = `views_at(to) − views_at(from)` для каждого ролика, кламп `>= 0` (минусы у TikTok бывают при "поддельном пересчёте"). Монотонна по длине окна — это ключевое свойство. Реализация в `app/api/dashboard/route.ts` и `app/api/creators/[id]/route.ts`.

## Компоненты `components/`

**Layout**
- `AppShell` — обёртка: фиксированный sidebar + header + main. Скрывает себя на `/login`.
- `Header`, `Sidebar` — стандартная навигация.

**UI-kit** (`ui/`)
- `PeriodSelector` + экспорт `getPeriodDates()`.
- `StatCard`, `Modal`, `PlatformBadge`, `SkeletonCard` (+ `ChartSkeleton`, `TableSkeleton`).

**Providers**
- `SessionProvider` — обёртка `NextAuthSessionProvider`.
- `ThemeProvider` — переключатель темы.

## Утилиты `lib/`

- `format.ts` — все форматтеры: `formatViews` (1.5M/450K), `formatDate` (DD.MM.YYYY), `formatPercent`, `formatNumber` (`ru-RU`), `formatER` (engagement rate), `getPlatformColor`, `getPlatformLabel`.
- `utils.ts` — `cn()` = `clsx + tailwind-merge`.
- `mock-data.ts` — типы (`DashboardData`, `Creator`, `Product`, `Video`, `Platform`, ...) + фолбэк-данные.

## Команды

```bash
npm run dev               # локально на :3000
npm run build             # прод-сборка (CI запускает это перед rsync на VPS)
npm run lint              # next lint
npm run db:push           # синк схемы → БД (drizzle-kit push)
npm run db:generate       # генерация SQL-миграции
npm run db:seed           # загрузка реальных данных клиента
```

`.env.local` обязан содержать: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SCRAPE_SECRET`, `REGISTER_SECRET`, плюс ключи для скрейпера если он гоняется локально.

## Правила

- Числа всегда форматируй (`formatViews`/`formatNumber`) — никаких `1400000` в JSX.
- Типы всегда явные — `any` запрещён, валидация входов API через Zod.
- Компоненты ≤ 200 строк. Если разрастается — выноси сабкомпоненты в `_components/` рядом с роутом.
- Loading через Suspense + `Skeleton*` из `ui/`, не пустые экраны.
- Date в БД храним в UTC, форматируем в `ru-RU` на UI.
