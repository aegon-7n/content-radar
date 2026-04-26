# ContentRadar — платформа аналитики контента для товарного бизнеса

> **Для агентов:** этот файл — общий контекст. Подробности живут рядом с кодом:
> [scraper/CLAUDE.md](scraper/CLAUDE.md) — крон-джобы, провайдеры API, стоимость.
> [src/CLAUDE.md](src/CLAUDE.md) — Next.js, маршруты, паттерны UI.
> [src/db/CLAUDE.md](src/db/CLAUDE.md) — Drizzle-схема и контракт со скрейпером.
> [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — высокоуровневая схема системы.
> [docs/OPERATIONS.md](docs/OPERATIONS.md) — runbook: cron, мониторинг, восстановление.
> [docs/ONBOARDING.md](docs/ONBOARDING.md) — что прочитать в первый день и какие нужны доступы.
> [docs/backlog.md](docs/backlog.md) — приоритетный список задач.

## Миссия

Заменить ручной Excel + сломанную 5meta на автоматический дашборд: статистика роликов со всех соцсетей, эффективность креаторов и товаров. Точные данные, тёмный современный UI, обновление раз в сутки.

## Бизнес-контекст

- **Целевая аудитория:** селлеры на Wildberries, работающие с "контент-заводом" (3-40 креаторов снимают ролики для продвижения товаров).
- **Текущий процесс клиента:** управляющий вручную раз в неделю сводит данные в 3 Excel-таблицы.
- **Конкуренты:** 5meta (кривые данные, плохой UI), Wildbox (блогерская аналитика без привязки к товару), LiveDune (нет привязки к WB-артикулу). Прямой замены нет.
- **Первый клиент уже работает в проде.** 3 креатора (Полина, Катя Ежикова, Катя ДДД), ~13 товаров, публикации на 5 платформах.
- **Ценовой якорь:** 10-15К ₽/мес SaaS, до 30К за кастом.

## Сущности

1. **Креатор** — человек, снимающий ролики (на каждого хранятся username/handle для каждой платформы).
2. **Товар** — продукт на WB с артикулом (5+ цифр, уникальная связь).
3. **Ролик** (`videos`) — единица контента. **`1 ролик = 1 креатор + 1 товар + 1 платформа`**.
4. **Метрика** (`video_metrics`) — append-only снимок просмотров/лайков/комментов/шеров/сейвов на момент скрейпа.
5. **Платформа** — TikTok, YouTube Shorts, Instagram Reels, Likee, Pinterest.

Подробнее по таблицам и инвариантам — [src/db/CLAUDE.md](src/db/CLAUDE.md).

## Архитектура

```
[cron МСК]                          [Vercel]
  00:00  scraper.auto_discover  ──┐
  00:10  scraper.run_daily      ──┼──→  PostgreSQL (Supabase)  ←──  Next.js (API routes + UI)
  01:00  scraper.audit          ──┘                                       │
                                                                          ↓
                                                                       Браузер
```

Cron живёт на отдельном VPS (`/root/content-radar`), фронт — на Vercel. Расписание — [scripts/setup-cron.sh](scripts/setup-cron.sh).

## Стек

| Слой | Технология |
|---|---|
| Frontend | Next.js 14 App Router, React 18, TypeScript strict, Tailwind, Recharts, Geist Sans/Mono |
| API | Next.js API Routes, Zod-валидация |
| Auth | NextAuth (CredentialsProvider, JWT, single admin) |
| База | PostgreSQL (Supabase prod / локальный postgres dev) + Drizzle ORM |
| Скрейпер | Python 3.11+, `requests`, `psycopg2`, `yt-dlp` (fallback). Cron по `setup-cron.sh`. |
| Деплой | Vercel (фронт) + VPS (скрейпер). CI: GitHub Actions ([.github/](.github/)). |

## Тёмные углы / что важно знать

1. **Скрейпинг — самый дорогой компонент по деньгам.** HikerAPI ($0.0006-$0.003/req), Apify Likee (~$0.01/req), TikAPI ($0.002/req). YouTube бесплатный, но 10K units/день. Любая правка в `scraper/` должна оцениваться по «сколько API-запросов добавим/уберём». См. [scraper/CLAUDE.md](scraper/CLAUDE.md).
2. **TikTok заблокирован для российских IP** (`ru_cross_border_block`). Прод-скрейпер ходит через SSH-туннель `socks5://127.0.0.1:1080` к EU-VPS.
3. **Likee — частично сломан by design.** Их фид нельзя дискаверить, ролики добавляются вручную URL'ом. Контекст: [docs/likee-research.md](docs/likee-research.md).
4. **`video_metrics` — append-only.** Не UPDATE, не UPSERT. Это инвариант, без которого ломается аналитика динамики.
5. **`fail_streak`** в `videos` защищает от траты квоты на удалённые/приватные ролики (>= 3 неудач = пропускаем навсегда).
6. **Single-tenant пока что.** Один админ, всё через `ADMIN_EMAIL`/`ADMIN_PASSWORD` в env. Multi-tenancy — в бэклоге.
7. **Секреты в `scripts/setup-cron.sh`** — сейчас в открытом виде, известный долг.

## Команды разработчика

```bash
npm run dev            # фронт на :3000
npm run build          # прод-сборка
npm run db:push        # синк схемы → локальная БД
npm run db:seed        # реальные данные клиента

# скрейперы (из корня проекта):
cd scraper && source venv/bin/activate
python -m scraper.run_daily
python -m scraper.auto_discover
python -m scraper.audit
python main.py --platform tiktok --dry-run   # одна платформа без записи
```

## .env.local (минимум)

```
DATABASE_URL=postgresql://...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000
ADMIN_EMAIL=...
ADMIN_PASSWORD=...
SCRAPE_SECRET=...        # bearer для /api/scrape

# скрейпер
TIKAPI_KEY=...
YOUTUBE_API_KEY=...
HIKERAPI_KEY=...
APIFY_TOKEN=...           # для Likee
SOCKS_PROXY=socks5://...  # для TikTok из RU

# опционально
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

## Делегирование задач

Под `scraper/`, `src/`, `src/db/` лежат свои CLAUDE.md — читай их перед работой в этих папках.

Саб-агенты (в `.claude/agents/`):
- **`db-architect`** — схема, миграции, аналитические SQL.
- **`scraper-engineer`** — Python-парсеры, оптимизация API-расходов, cron.
- **`frontend-builder`** — React-компоненты, страницы, графики.
- **`code-reviewer`** — ревью перед коммитом.

Когда задача затрагивает несколько доменов (например, новый экран = API + UI + схема) — запускай параллельно по доменам.

## Глобальные правила

- TypeScript strict везде. `any` запрещён.
- API-входы валидируются Zod.
- SQL — только через Drizzle или prepared statements (никакого raw-interpolation).
- Все timestamp в UTC, форматирование на UI.
- Точность данных > полнота. Если метрика недоступна — `null`, не `0` (см. [scraper/models.py](scraper/models.py)).
- Каждый коммит — рабочее состояние приложения. Тесты на MVP не нужны; скорость и точность важнее.
- Server Components где возможно, `"use client"` только при необходимости (стейт, эффекты, навигация).
- Числа форматируем через `lib/format.ts` (`formatViews`, `formatNumber`, ...).

## Документация — обязательное правило

**Каждый PR, меняющий поведение / архитектуру / операционку системы, в том же дифе обновляет соответствующую документацию.**

Это правило, без которого вся переданная агентам база протухнет за пару месяцев. Конкретно:

| Меняешь | Обязательно обновить |
|---|---|
| схему БД (`src/db/schema.ts`) | [src/db/CLAUDE.md](src/db/CLAUDE.md) + [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (если задело модель данных) |
| провайдер скрейпера / цены / новый эндпоинт | [scraper/CLAUDE.md](scraper/CLAUDE.md) + [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (таблица провайдеров) |
| крон-расписание / алерты / процедуру восстановления | [docs/OPERATIONS.md](docs/OPERATIONS.md) |
| env-переменную (новую, удалённую, переименованную) | [.env.example](.env.example) + комментарий зачем нужна |
| маршрут / API-эндпоинт | [src/CLAUDE.md](src/CLAUDE.md) |
| фундаментальное архитектурное решение | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), при сложном решении — отдельный ADR в `docs/decisions/` |
| правило/паттерн, отличающийся от текущего | nested CLAUDE.md соответствующей папки |

`code-reviewer` проверяет это в чеклисте. PR без обновления — `NEEDS FIXES`.

Если правка совсем мелкая и ничего из вышеперечисленного не задевает (баг-фикс одной функции, опечатка, локальный рефакторинг) — документацию трогать не нужно. Здравый смысл.

## Известные планы

См. [docs/backlog.md](docs/backlog.md). Главное в очереди: CI/CD деплой, обработка `permanently_unavailable` в UI, multi-tenancy (когда придёт второй клиент), вынос секретов из `scripts/setup-cron.sh`.
