# Onboarding — для нового агента или разработчика

Тебе передали проект ContentRadar. Этот документ — твой первый день: что прочитать, какие доступы получить, как убедиться, что всё работает, и какие правила сразу принять.

## За 30 минут

### 1. Прочитать в этом порядке
1. **[CLAUDE.md](../CLAUDE.md)** — миссия, бизнес-контекст, общая архитектура.
2. **[docs/ARCHITECTURE.md](ARCHITECTURE.md)** — схема системы, потоки данных, дельта-модель.
3. **[scraper/CLAUDE.md](../scraper/CLAUDE.md)** — три крон-джоба и провайдеры (это самая дорогая часть проекта).
4. **[src/CLAUDE.md](../src/CLAUDE.md)** — карта Next.js, API-эндпоинты, паттерны.
5. **[src/db/CLAUDE.md](../src/db/CLAUDE.md)** — схема БД и инварианты.
6. **[docs/OPERATIONS.md](OPERATIONS.md)** — что делать при инцидентах.
7. **[docs/backlog.md](backlog.md)** — приоритетные задачи в очереди.

Когда прочёл — ты знаешь, **что** проект делает, **как** он устроен, и **где** что лежит. Дальше — доступы.

### 2. Получить доступы

Их даёт текущий владелец проекта. Список того, что нужно запросить:

**Минимум для разработки (локально):**
- [ ] Git: `git clone https://github.com/aegon-7n/content-radar.git`. Если репо приватный — нужен push/pull доступ через GitHub-аккаунт.
- [ ] `.env.local` — текущий рабочий файл, либо ключи отдельно. Содержит: `DATABASE_URL`, `NEXTAUTH_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SCRAPE_SECRET`, `TIKAPI_KEY`, `YOUTUBE_API_KEY`, `HIKERAPI_KEY`, `APIFY_TOKEN`, `SOCKS_PROXY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`. Структуру см. в [.env.example](../.env.example).
- [ ] PostgreSQL локально (`brew install postgresql@16` на macOS).

**Для прод-операций:**
- [ ] SSH-ключ или пароль root к VPS — на нём крутится **всё**: фронт (PM2), Postgres, и cron-скрейпер.
- [ ] GitHub: collaborator на репо + доступ к Settings → Secrets and variables → Actions (там `DEPLOY_HOST` и `DEPLOY_SSH_KEY` для CI-деплоя).

**Дашборды провайдеров (для контроля расходов):**
- [ ] HikerAPI — https://hikerapi.com (логин владельца).
- [ ] TikAPI.io — https://tikapi.io.
- [ ] Apify — https://apify.com.
- [ ] Google Cloud Console (YouTube Data API) — https://console.cloud.google.com.
- [ ] Telegram-бот: токен и chat_id для алертов.

**Не запрашивай в открытом чате.** Используйте 1Password / Bitwarden / зашифрованный архив (`gpg -c`). API-ключи, отправленные в Telegram/Slack/email plaintext, считай скомпрометированными.

### 3. Поднять локально

```bash
git clone https://github.com/aegon-7n/content-radar.git
cd content-radar

# 1. Зависимости фронта
npm install

# 2. .env.local — скопировать из .env.example, заполнить значения
cp .env.example .env.local
# отредактировать .env.local

# 3. Локальная БД
createdb content_radar
npm run db:push     # применить схему
npm run db:seed     # данные клиента

# 4. Python venv для скрейпера
cd scraper
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd ..

# 5. Запустить фронт
npm run dev
# открыть http://localhost:3000
# логин: ADMIN_EMAIL / ADMIN_PASSWORD из .env.local
```

### 4. Прогнать скрейпер локально (без записи в БД)

```bash
cd scraper && source venv/bin/activate
python main.py --platform youtube --dry-run
# или конкретного провайдера:
python -m scraper.run_daily         # боевой прогон
python -m scraper.auto_discover     # поиск новых роликов
```

Если всё работает без traceback'ов — окружение настроено корректно.

## Правила работы (приняты в проекте)

### Code-style

Главные принципы — в корневом [CLAUDE.md](../CLAUDE.md). Сжато:

- **TypeScript strict.** `any` запрещён.
- **API-входы валидируются Zod.**
- **SQL только через Drizzle / prepared.** Никакого raw-interpolation.
- **`video_metrics` append-only.** Не UPDATE, не UPSERT.
- **`null > 0`.** Если метрика недоступна — `null`. Нули в БД — это «реальный ноль» от платформы, не «не получили данные».
- **UTC для всех timestamp.**
- **Числа форматируются** через `lib/format.ts` (`formatViews`, `formatNumber`, `formatPercent`).
- **Server Components by default.** `"use client"` — только где нужны стейт/эффекты.

### Денежные правила (`scraper/`)

- **Каждое изменение в `scraper/` оценивается через дельту API-запросов в сутки.** Расход доминирует над всем остальным в проекте.
- Пагинация — всегда с early-exit по `published_at < since`.
- `audit.py` не должен дублировать работу `auto_discover.py`.
- При поднятии расходов — первое подозреваемое: пагинация, `SCRAPE_HORIZON_DAYS`, или новый эндпоинт стал дорогим.

### Документация при изменениях

**Это правило, без которого весь этот пакет бесполезен через 2 месяца:**

> Каждый PR, меняющий поведение/архитектуру/операционку системы, **в том же дифе** обновляет соответствующую документацию.

Что обновлять:
- Поменял схему БД → `src/db/CLAUDE.md`, `docs/ARCHITECTURE.md` (если задело модель).
- Поменял провайдер скрейпера или цены → `scraper/CLAUDE.md`, `docs/ARCHITECTURE.md`.
- Поменял крон, алерт, процедуру восстановления → `docs/OPERATIONS.md`.
- Добавил env-переменную → `.env.example` (с комментарием).
- Поменял маршрут или добавил API-эндпоинт → `src/CLAUDE.md`.
- Решил архитектурный вопрос → краткое ADR в `docs/decisions/` (если будет такая папка).

`code-reviewer` проверяет это в чеклисте. PR без обновления — это автоматический NEEDS FIXES.

### Коммиты

- **Один коммит — рабочее состояние приложения.** Не ломай `main`.
- Conventional Commits: `feat:`, `fix:`, `perf:`, `docs:`, `chore:`, `refactor:`. Скоуп: `feat(scraper):`, `fix(ui):`.
- Сообщение фокусируется на **«почему»**, не на **«что»** (диф уже показывает «что»).
- В тело коммита — список значимых изменений + контекст (если правка устраняет инцидент — ссылка/описание).

### Саб-агенты

В `.claude/agents/` лежат четыре специализированных роли:
- `db-architect` — схема, миграции, аналитические SQL.
- `scraper-engineer` — Python-парсеры, оптимизация API-расходов.
- `frontend-builder` — React, страницы, графики.
- `code-reviewer` — ревью перед коммитом.

Используй их **по доменам**. Если задача задевает несколько (новая фича = БД + API + UI) — запускай агентов параллельно. Каждый сам подтянет нужный nested-CLAUDE.md.

## Где смотреть, если что-то пошло не так

- **Прод не отвечает** → SSH на VPS → `pm2 logs content-radar`, [docs/OPERATIONS.md → Фронт на проде вернул 500](OPERATIONS.md#фронт-на-проде-вернул-500).
- **GitHub Actions упал на push** → [docs/OPERATIONS.md → GitHub Actions деплой упал](OPERATIONS.md#github-actions-деплой-упал).
- **Метрики не обновляются** → SSH на VPS, `tail /var/log/content-radar/daily.log`, [docs/OPERATIONS.md → метрики старше суток](OPERATIONS.md#метрики-на-ui-старше-суток).
- **Резко вырос счёт за API** → дашборд провайдера, потом [scraper/CLAUDE.md → известные ловушки](../scraper/CLAUDE.md#известные-ловушки).
- **Telegram-алерт пришёл** → читай его текст; в нём указан какой джоб упал и снизу — последние строки лога.

## Как сообщать о проблемах

- Баги/задачи, обнаруженные во время работы — в `docs/backlog.md` (приоритетный список).
- Если требуется обсуждение — Telegram чат с владельцем.

## Чеклист первого дня

- [ ] Прочитал документы из секции «За 30 минут».
- [ ] Получил все доступы (см. список выше).
- [ ] Локально поднял фронт и зашёл в дашборд.
- [ ] Прогнал скрейпер локально (`--dry-run`).
- [ ] Зашёл в дашборды HikerAPI / TikAPI / Apify, увидел текущий расход.
- [ ] Залогинился по SSH на VPS, посмотрел `pm2 status` (фронт) и логи трёх крон-джобов в `/var/log/content-radar/`.
- [ ] Проверил `/api/health` на проде — все джобы зелёные.
- [ ] Нашёл свой первый таск в `docs/backlog.md`.

Welcome to ContentRadar.
