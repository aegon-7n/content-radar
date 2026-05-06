# Архитектура ContentRadar

Высокоуровневое описание системы. Для деталей по конкретному слою → смотри nested-CLAUDE.md рядом с кодом ([scraper/CLAUDE.md](../scraper/CLAUDE.md), [src/CLAUDE.md](../src/CLAUDE.md), [src/db/CLAUDE.md](../src/db/CLAUDE.md)).

## Состав

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Browser (Chrome)                             │
│                              │                                       │
│                              ▼ HTTPS                                 │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Production VPS (Ubuntu, root) — ЕДИНСТВЕННЫЙ хост           │    │
│  │  ─────────────────────────────────────────────────────       │    │
│  │  /root/content-radar/                                         │    │
│  │                                                                │    │
│  │  ┌────────────────────────────────────────────────────────┐  │    │
│  │  │  Next.js 14 App Router (под управлением PM2)            │  │    │
│  │  │  • Server Components + клиентские страницы              │  │    │
│  │  │  • API-роуты под app/api/*                              │  │    │
│  │  │  • NextAuth (CredentialsProvider, JWT)                  │  │    │
│  │  │  • Drizzle ORM → localhost:5432                         │  │    │
│  │  │  Команды: pm2 status, pm2 logs content-radar,           │  │    │
│  │  │           pm2 restart content-radar --update-env        │  │    │
│  │  └────────────────────────────────────────────────────────┘  │    │
│  │                              │                                │    │
│  │                              ▼ Unix socket / TCP localhost   │    │
│  │  ┌────────────────────────────────────────────────────────┐  │    │
│  │  │  PostgreSQL                                             │  │    │
│  │  │  Таблицы: users, creators, products, videos,            │  │    │
│  │  │           video_metrics, scraper_state                  │  │    │
│  │  └────────────────────────────────────────────────────────┘  │    │
│  │                              ▲                                │    │
│  │                              │ psycopg2                       │    │
│  │  ┌────────────────────────────────────────────────────────┐  │    │
│  │  │  Python-скрейпер (cron в /etc/cron.d/content-radar)     │  │    │
│  │  │  • 00:00 МСК — auto_discover (новые ролики)             │  │    │
│  │  │  • 00:10 МСК — run_daily     (метрики)                  │  │    │
│  │  │  • 01:00 МСК — audit         (сверка)                   │  │    │
│  │  │  Логи: /var/log/content-radar/{discover,daily,audit}.log│  │    │
│  │  └────────────────────────────────────────────────────────┘  │    │
│  │                              │                                │    │
│  │       SSH-туннель ──────────►│ socks5://127.0.0.1:1080        │    │
│  │       к EU-VPS (для TikTok)                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│                              ▼ HTTPS                                 │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Внешние API                                                  │    │
│  │  • TikAPI.io       (TikTok)                                   │    │
│  │  • YouTube Data v3 (Google)                                   │    │
│  │  • HikerAPI        (Instagram)                                │    │
│  │  • Apify actor     (Likee)                                    │    │
│  │  • Pinterest HTML  (бесплатно, парсинг страницы)              │    │
│  └─────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘

Деплой: GitHub Actions [.github/workflows/ci.yml] на push в main →
  rsync кода → npm ci && npm run build → pm2 restart content-radar.
```

## Лендинг и воронка заявок

Публичный лендинг живёт в **отдельном репо** `content-radar-landing`, задеплоен на Vercel, доступен по домену `contentradar.app`.

Само приложение (этот репо) переезжает на `app.contentradar.app` — так лендинг-домен можно передать Vercel, сохранив производственный доступ первого клиента.

Поток заявки с лендинга:

```
Посетитель contentradar.app
        │
        │ POST /api/submit (Next.js лендинг на Vercel)
        ▼
Лендинг → POST https://app.contentradar.app/api/waitlist
          Authorization: Bearer ${WAITLIST_INGEST_SECRET}
        │
        ▼
VPS (Next.js) /api/waitlist
  ├─ Zod-валидация
  ├─ rate-limit by IP (5 req/min, in-memory Map)
  ├─ INSERT → waitlist_signups
  ├─ Resend email → пользователю (подтверждение заявки)
  └─ Telegram Bot → TELEGRAM_CHAT_ID (уведомление админу)
```

Переменные окружения: `WAITLIST_INGEST_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`. `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID` уже используются скрейпером — общие для всех уведомлений.

Управление заявками: `/admin/waitlist` — Server Component за NextAuth, таблица с фильтром по статусу, Server Action для смены статуса.

| Сервис | Назначение | Стоимость |
|---|---|---|
| Vercel (лендинг) | Хостинг `contentradar.app` | бесплатный Hobby — **риск:** ToS Hobby формально только для non-commercial; принято осознанно ради быстрого старта. План миграции: при апгрейде VPS-конфига перевезти лендинг на тот же VPS под PM2; либо апгрейд до Vercel Pro $20/мес как промежуточный шаг. См. [backlog.md → Лендинг и хостинг](backlog.md#лендинг-и-хостинг). |
| Resend | Email подтверждения заявки | бесплатно до 3K emails/мес |
| Cloudflare | DNS + proxy для `contentradar.app` и `app.contentradar.app` | бесплатный Free план, режим **Full** |

## Модель данных

Полная схема — в [src/db/schema.ts](../src/db/schema.ts), пояснения и инварианты — в [src/db/CLAUDE.md](../src/db/CLAUDE.md).

```
users (1) ─┬─→ creators (N) ─┐
           └─→ products (N) ─┤
                             ↓
                          videos (N) ──→ video_metrics (M, append-only)
                            │
                            └─ fail_streak ≥ 3 → "недоступно"

scraper_state    — три строки на три крон-джоба, для self-healing lookback
waitlist_signups — лиды с лендинга (не связаны с users, pre-signup)
```

**Ключевой инвариант:** `video_metrics` — append-only. Каждый успешный скрейп = новая строка с `scraped_at`. Любая дельта-аналитика держится на этом свойстве.

## Поток данных за сутки

```
00:00 МСК   auto_discover ── запросы к платформам, поиск новых URL ──→ INSERT в videos
00:10 МСК   run_daily      ── метрики для каждого видео <30 дней ──→ INSERT в video_metrics
01:00 МСК   audit          ── сверка фактического кол-ва на платформе ──→ Telegram-алерт
                              с тем, что у нас в БД                        при расхождении

в течение дня:
  Браузер → VPS (PM2/Next.js) /api/dashboard ── агрегация delta-модели ──→ JSON
                                       ────────────────────
                                       не текущий views, а
                                       (views_at(to) - views_at(from))
                                       per video, кламп ≥ 0
```

## Дельта-модель (главная единица аналитики)

Для каждого ролика прирост за период `[from, to]`:

```
delta(video) = MAX(views) WHERE scraped_at <= to
             − MAX(views) WHERE scraped_at <= from
             , clamp >= 0
```

Затем суммируется по креатору, товару, платформе. Реализация — в `src/app/api/dashboard/route.ts`. Свойство **монотонности по длине окна** (7д ≤ 30д ≤ 90д) — обязательное; без него UI лжёт пользователю.

Кламп `>= 0` нужен потому, что у TikTok бывают пересчёты просмотров с уменьшением цифры — это шум платформы, а не отрицательный «прирост».

## Сервисы и провайдеры

| Сервис | Назначение | Стоимость | Ссылка |
|---|---|---|---|
| VPS (DigitalOcean/Hetzner/etc) | Всё: фронт (PM2), Postgres, скрейпер | ~$10-20/мес | (адрес — у владельца) |
| GitHub Actions | CI + деплой через SSH/rsync | бесплатно для публичных / квота private | https://github.com/aegon-7n/content-radar/actions |
| TikAPI.io | TikTok метрики | ~$99/мес за 50K req | https://tikapi.io |
| YouTube Data API v3 | YouTube метрики | бесплатно, 10K units/день | https://console.cloud.google.com |
| HikerAPI | Instagram метрики | ~$0.0006-0.003/req | https://hikerapi.com |
| Apify | Likee метрики | ~$0.01/ролик | https://apify.com |
| Pinterest | RSS + HTML | бесплатно | https://www.pinterest.com |
| Telegram Bot | Алерты скрейпера + waitlist-уведомления | бесплатно | https://t.me/BotFather |
| Resend | Email-подтверждение заявок на waitlist | бесплатно до 3K/мес | https://resend.com |
| Vercel | Хостинг лендинга `contentradar.app` | бесплатно (hobby) | https://vercel.com |

Точная разбивка стоимости — в [scraper/CLAUDE.md](../scraper/CLAUDE.md). Ежедневный расход на дату 2026-04-26 — около **$1.7-1.8/сутки** (доминирует HikerAPI).

## Критические свойства

1. **`video_metrics` append-only.** Не UPDATE. Не UPSERT. Каждый снимок — отдельная строка.
2. **Точность > полнота.** Если метрика недоступна — `null`, не `0`. Нули в БД — это «реальный ноль», не «не получили данные».
3. **Все timestamps в UTC.** Локализация только на UI.
4. **`fail_streak` защищает квоту.** Удалённые/приватные ролики после 3 неудач отмечаются и больше не дёргаются.
5. **Self-healing scraper.** Если cron не работал N дней, следующий прогон расширит lookback и догонит пропущенное.
6. **TikTok через прокси.** Без `SOCKS_PROXY` российский IP получит `ru_cross_border_block` на каждом ролике.

## Что НЕ в архитектуре (намеренно)

- **Кэш фронта** — нет Redis/Memcached. Postgres быстрый, нагрузка маленькая (один админ).
- **Очереди задач** — нет Celery/RabbitMQ. Cron + последовательная обработка хватает.
- **Микросервисы** — фронт и скрейпер запускаются разными деплоями, но это всё ещё монолит.
- **Realtime** — обновление раз в сутки, не WebSocket. Если клиент попросит — добавим.
- **Multi-tenancy** — single admin пока что. Multi-tenancy в бэклоге.

## Граничные точки и риски

- **API-провайдеры могут менять цены и схемы ответов.** Особенно HikerAPI и Apify — это reverse-engineered обёртки над чужими API. Скрейперы пишутся defensive: `is_valid()` отсеивает мусор, fallback на yt-dlp где возможно.
- **TikTok может закрутить anti-bot.** Тогда переход на residential proxy.
- **Instagram в любой момент может отозвать публичные эндпоинты.** В этом случае Reels-метрики становятся недоступны без личного аккаунта (что меняет правила игры).
- **YouTube Data API лимит 10K units/день.** При росте до 10+ креаторов нужно переписать `auto_discover` чтобы не делать `search.list` (100 units) на каждый прогон.
- **Pinterest official API закрыт без OAuth-приложения.** Сейчас всё на парсинге HTML, что хрупко.

См. [docs/backlog.md](backlog.md) — там список планов на эти риски.
