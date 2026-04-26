# Архитектура ContentRadar

Высокоуровневое описание системы. Для деталей по конкретному слою → смотри nested-CLAUDE.md рядом с кодом ([scraper/CLAUDE.md](../scraper/CLAUDE.md), [src/CLAUDE.md](../src/CLAUDE.md), [src/db/CLAUDE.md](../src/db/CLAUDE.md)).

## Состав

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Browser (Chrome)                             │
│                              │                                       │
│                              ▼ HTTPS                                 │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Vercel (фронт + API)                                        │    │
│  │  ────────────────────                                        │    │
│  │  Next.js 14 App Router                                       │    │
│  │  • Server Components + клиентские страницы                   │    │
│  │  • API-роуты под app/api/*                                   │    │
│  │  • NextAuth (CredentialsProvider, JWT)                       │    │
│  │  • Drizzle ORM                                                │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│                              ▼ TCP/SSL                               │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  PostgreSQL (на VPS, доступ через SSL)                       │    │
│  │  Таблицы: users, creators, products, videos, video_metrics,  │    │
│  │           scraper_state                                       │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              ▲                                       │
│                              │ psycopg2                              │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  VPS (Ubuntu, root)                                          │    │
│  │  ───────────────────                                          │    │
│  │  /root/content-radar/                                         │    │
│  │  ├── scraper/  Python-скрейпер (cron-driven)                  │    │
│  │  ├── scripts/  setup-cron.sh, notify-telegram.sh              │    │
│  │  └── /etc/cron.d/content-radar — три ночных джоба             │    │
│  │                                                                │    │
│  │  SSH-туннель → EU VPS (socks5://127.0.0.1:1080)               │    │
│  │  для обхода ru_cross_border_block у TikTok                    │    │
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
```

## Модель данных

Полная схема — в [src/db/schema.ts](../src/db/schema.ts), пояснения и инварианты — в [src/db/CLAUDE.md](../src/db/CLAUDE.md).

```
users (1) ─┬─→ creators (N) ─┐
           └─→ products (N) ─┤
                             ↓
                          videos (N) ──→ video_metrics (M, append-only)
                            │
                            └─ fail_streak ≥ 3 → "недоступно"

scraper_state — три строки на три крон-джоба, для self-healing lookback
```

**Ключевой инвариант:** `video_metrics` — append-only. Каждый успешный скрейп = новая строка с `scraped_at`. Любая дельта-аналитика держится на этом свойстве.

## Поток данных за сутки

```
00:00 МСК   auto_discover ── запросы к платформам, поиск новых URL ──→ INSERT в videos
00:10 МСК   run_daily      ── метрики для каждого видео <30 дней ──→ INSERT в video_metrics
01:00 МСК   audit          ── сверка фактического кол-ва на платформе ──→ Telegram-алерт
                              с тем, что у нас в БД                        при расхождении

в течение дня:
  Браузер → Vercel /api/dashboard ── агрегация delta-модели ──→ JSON
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
| Vercel | Хостинг фронта + API | $20/мес Pro (если нужно) или free | https://vercel.com |
| VPS (DigitalOcean/Hetzner) | Скрейпер + Postgres | ~$10-20/мес | (адрес — у владельца) |
| TikAPI.io | TikTok метрики | ~$99/мес за 50K req | https://tikapi.io |
| YouTube Data API v3 | YouTube метрики | бесплатно, 10K units/день | https://console.cloud.google.com |
| HikerAPI | Instagram метрики | ~$0.0006-0.003/req | https://hikerapi.com |
| Apify | Likee метрики | ~$0.01/ролик | https://apify.com |
| Pinterest | RSS + HTML | бесплатно | https://www.pinterest.com |
| Telegram Bot | Алерты | бесплатно | https://t.me/BotFather |

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
