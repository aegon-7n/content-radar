# src/ — Next.js 14 App Router (фронт + API)

Next.js 14, App Router, TypeScript strict, Tailwind, Drizzle ORM. Тёмная тема по умолчанию, шрифт Geist Sans/Mono.

## Карта папок

```
app/         маршруты (страницы + API)
components/  переиспользуемая UI (layout, ui-kit, providers)
db/          drizzle-схема и подключение (см. src/db/CLAUDE.md)
lib/         утилиты форматирования, моки, helpers
middleware.ts  next-auth guard на все маршруты кроме /login, /api/auth, /api/health, /api/scrape, /api/waitlist, статика
types/       глобальные .d.ts
```

## Маршруты `app/`

- **`/`** — главный дашборд: KPI-карточки, line-chart по дням, donut по платформам, топ-5 роликов. Использует `getPeriodDates()` из `PeriodSelector`.
- **`/creators`**, **`/creators/[id]`** — список и детальная.
- **`/products`**, **`/products/[id]`** — список и детальная.
- **`/videos`**, **`/videos/[id]`** — список с фильтрами/сортировкой/пагинацией и детальная.
- **`/settings`** — четыре таба: `CreatorsTab`, `ProductsTab`, `VideosTab`, `ImportTab`. Сабкомпоненты — в `app/settings/_components/`.
- **`/login`** — форма, NextAuth `signIn("credentials")`, редирект на `/`.

## API-эндпоинты `app/api/`

**Аутентификация**
- `auth/[...nextauth]` — NextAuth handler. CredentialsProvider, hardcoded admin-юзер из `ADMIN_EMAIL` / `ADMIN_PASSWORD` (env), JWT-сессия 30 дней.

**Чтение (UI зовёт это)**
- `dashboard` — агрегаты + delta-модель за период (`?from=&to=&category=`).
- `creators`, `creators/[id]` — список и детали.
- `products`, `products/[id]`.
- `videos`, `videos/[id]`, `videos/export` (CSV).
- `last-sync` — `MAX(scraped_at)` из `video_metrics`.
- `health` — статус трёх scraper-джобов из `scraper_state`.

**Запись (`/api/settings/...`, POST/PUT/DELETE)**
- `settings/{creators,products,videos}` + `[id]`-варианты.
- `settings/import` — CSV/bulk-импорт.

**Внутренний триггер**
- `scrape` — POST с `Authorization: Bearer ${SCRAPE_SECRET}`. Спавнит Python-subprocess в `scraper/`. Поддерживает `?async=true` (202 + фоновый запуск) или блокирующий режим. Не выставлять наружу без токена.

**Публичный приём заявок (без NextAuth-сессии)**
- `waitlist` — POST с `Authorization: Bearer ${WAITLIST_INGEST_SECRET}`. Принимает заявки с лендинга (`content-radar-landing` на Vercel). Поток: Zod-валидация → in-memory rate limit (5 req/min/IP) → INSERT в `waitlist_signups` → Resend email пользователю + Telegram-уведомление админу. Если `RESEND_API_KEY` или Telegram env не заданы — пропускает соответствующий шаг с `console.warn`, не падает. Путь `/api/waitlist` явно исключён из NextAuth-middleware через allowlist в `config.matcher`.

## Маршруты `/admin/`

- **`/admin/waitlist`** — Server Component за NextAuth (middleware защищает всё кроме `/api` и `/login`). Таблица заявок с фильтром по статусу (`?status=new|contacted|onboarded|rejected`), сортировка `created_at DESC`, лимит 100. Смена статуса — Server Action `updateStatus` (form + hidden id + select). Счётчики «Всего / Новых» в шапке. Ссылка в боковом меню под «Настройки».

## Паттерны

**Server vs client.** Корневой `layout.tsx` — server. Большинство страниц-листов и дашборд — `"use client"`, т.к. нужны `useState` для периода/сортировки и `useEffect` для запросов. `Header`/`Sidebar`/`AppShell` — тоже клиентские (нужен `usePathname`). API-роуты, естественно, server.

**Получение данных.** Страницы **никогда** не ходят в БД напрямую — только через `fetch('/api/...')`. Вся работа с Drizzle живёт в `app/api/*/route.ts`. На сетевой ошибке UI падает на `mock-data.ts` чтобы не показывать пустоту в деве.

**Аутентификация.** [middleware.ts](middleware.ts) использует `getToken` из `next-auth/jwt` — все маршруты (включая `/api/*`) требуют JWT-токен, кроме allowlist: `/login`, `/api/auth`, `/api/health`, `/api/scrape`, `/api/waitlist`, статика. Незащищённые API-маршруты возвращают `401 JSON`, страницы — редирект на `/login`. Новые API-маршруты защищены по умолчанию (fail-closed). Для публичного маршрута — добавить в `config.matcher` allowlist.

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

`.env.local` обязан содержать: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SCRAPE_SECRET`, плюс ключи для скрейпера если он гоняется локально.

## Правила

- Числа всегда форматируй (`formatViews`/`formatNumber`) — никаких `1400000` в JSX.
- Типы всегда явные — `any` запрещён, валидация входов API через Zod.
- Компоненты ≤ 200 строк. Если разрастается — выноси сабкомпоненты в `_components/` рядом с роутом.
- Loading через Suspense + `Skeleton*` из `ui/`, не пустые экраны.
- Date в БД храним в UTC, форматируем в `ru-RU` на UI.
