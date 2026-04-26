# Operations Runbook

Как держать ContentRadar в проде живым: ежедневные крон-джобы, мониторинг, восстановление после сбоев, ротация ключей.

## Прод-инфраструктура

| Компонент | Где | Доступ |
|---|---|---|
| Фронт + API | Vercel | панель vercel.com (владелец проекта добавляет коллабораторов) |
| База данных | PostgreSQL на VPS | `DATABASE_URL` из `.env.local` |
| Скрейпер | VPS, `/root/content-radar` | SSH-ключ + sudo |
| Cron | `/etc/cron.d/content-radar` | управляется через `scripts/setup-cron.sh` |
| Логи | `/var/log/content-radar/` | SSH + `tail -f` |
| Алерты | Telegram-бот | токен в `TELEGRAM_BOT_TOKEN` |

## Cron-расписание (МСК)

```
00:00  scraper.auto_discover  → /var/log/content-radar/discover.log
00:10  scraper.run_daily      → /var/log/content-radar/daily.log
01:00  scraper.audit          → /var/log/content-radar/audit.log
```

Все три команды на non-zero exit пушат алерт в Telegram через `scripts/notify-telegram.sh`.

Изменить расписание: отредактировать `scripts/setup-cron.sh`, запустить от root, проверить `cat /etc/cron.d/content-radar`.

## Мониторинг

### Светофор статуса
Эндпоинт `/api/health` возвращает JSON со статусом каждого джоба:

```json
{
  "auto_discover": { "lastSuccessAt": "...", "lastStatus": "ok",      "lastMessage": "added=2 ..." },
  "run_daily":     { "lastSuccessAt": "...", "lastStatus": "partial", "lastMessage": "ok=120 fail=5 ..." },
  "audit":         { "lastSuccessAt": "...", "lastStatus": "ok",      "lastMessage": "missing=0 failures=0" }
}
```

Что считать «зелёным»:
- `lastStatus: 'ok'` или `'partial'` с разумным `fail_rate`.
- `lastSuccessAt` не старше 26 часов (с запасом на сдвиг крона).

Что **точно** требует вмешательства:
- `lastStatus: 'fail'` где-либо.
- `lastSuccessAt` старше 48 часов.
- `audit` показывает `missing > 0` несколько дней подряд.

### Логи
SSH на VPS, потом:
```bash
tail -f /var/log/content-radar/daily.log     # метрики
tail -f /var/log/content-radar/discover.log  # новые ролики
tail -f /var/log/content-radar/audit.log     # сверка
```

### Расход API
Дашборды провайдеров — самый честный источник:
- HikerAPI: hikerapi.com → Account → Transactions / Hours.
- TikAPI: tikapi.io → Dashboard.
- Apify: apify.com → Console → Usage.
- YouTube: console.cloud.google.com → APIs & Services → Quotas.

Целевые цифры на середину 2026 года: **HikerAPI ≤ $0.5/сутки, Apify ≤ $0.5/сутки**. Если вылезли за рамки — см. оптимизации в [scraper/CLAUDE.md](../scraper/CLAUDE.md).

## Типовые инциденты и как их чинить

### «Метрики на UI старше суток»
Признаки: `/api/last-sync` возвращает старую дату, дашборд показывает «обновлено 2 дня назад».

Что проверить:
1. SSH на VPS, `tail -100 /var/log/content-radar/daily.log` — что пишет последний прогон?
2. Если cron не запустился вовсе: `systemctl status cron`, `cat /etc/cron.d/content-radar`.
3. Если запустился и упал: смотри traceback в логе. Часто — устарел API-ключ или провайдер вернул 5xx.
4. После починки можно прогнать вручную: `sudo -u root cd /root/content-radar && /root/content-radar/scraper/venv/bin/python -m scraper.run_daily`.

### «Audit жалуется на GAP»
Признаки: Telegram-алерт «audit detected gaps», в `audit.log` строки `WARNING GAP …`.

Что проверить:
1. Какая платформа? Если TikTok — проверь SOCKS-туннель: `curl --socks5 127.0.0.1:1080 https://www.tiktok.com -I`.
2. Если Instagram — посмотри в `discover.log` ошибки от HikerAPI. Возможно, кончился баланс (`status=402`).
3. Если YouTube — проверь не упёрлись ли в quota (10K units/день): в логе будут `403 quota exceeded`.

### «HikerAPI/TikAPI/Apify счёт растёт»
1. Смотри график на дашборде провайдера.
2. Спайки на конкретные часы → совпадают ли с временами cron?
3. Если да и расход аномальный → читай [scraper/CLAUDE.md](../scraper/CLAUDE.md) раздел «Известные ловушки».
4. Вре́менный fix: уменьшить `SCRAPE_HORIZON_DAYS` через env (например, 14 вместо 30).

### «Vercel-деплой упал»
1. `vercel logs` или панель Vercel → Deployments.
2. Чаще всего — TypeScript-ошибка после правок в `src/`. Локально: `npm run build` чтобы воспроизвести.
3. Если БД недоступна с Vercel — проверь `DATABASE_URL` в Environment Variables Vercel.

### «404 на /api/health после изменения схемы»
1. Локальная схема разошлась с прод-БД. На проде запусти `npm run db:push` (для single-dev) или `db:migrate` (с миграциями).
2. **Проверь, что Python-скрейпер тоже работает с новой схемой** — в `scraper/db.py` колонки захардкожены.

## Ротация секретов

Сейчас **API-ключи лежат в `scripts/setup-cron.sh`** в открытом виде, и они уже видны в git history. Это значит при передаче проекта новым агентам нужно:

1. **Получить новые ключи** в HikerAPI / TikAPI / YouTube API console / Apify (revoke старые).
2. **Обновить `.env.local` локально** и `.env` на VPS.
3. **Обновить `scripts/setup-cron.sh`** — но лучше переписать его так, чтобы он читал ключи из `/root/content-radar/.env`, а не хардкодил их. Это отдельный таск из бэклога.
4. **Очистить git history** через `git filter-repo` или `BFG Repo Cleaner` если хочется убрать старые ключи из истории. Но проще — революки старых ключей; история становится бесполезной.

## Бэкапы

**Сейчас бэкапов автоматических нет.** На single-tenant с 3 креаторами это терпимо, но при росте бизнеса — заводить:
- pgdump раз в сутки на VPS, копия на S3 / другой VPS.
- Skipper-сценарий: если БД восстанавливается из бэкапа, `scraper_state` нужно сбросить → следующий run догонит lookback.

## Восстановление с нуля

Если VPS умер целиком и нужно поднять заново:

1. Создать новый VPS (Ubuntu 22+).
2. `git clone https://github.com/aegon-7n/content-radar.git /root/content-radar`.
3. Установить системные зависимости: `apt install python3-venv postgresql nginx` (если фронт тоже на VPS).
4. Создать БД: `sudo -u postgres createuser contentradar`, `createdb content_radar`.
5. Применить схему: `cd /root/content-radar && npm install && npm run db:push`.
6. Восстановить данные из бэкапа (если есть) → `psql -U contentradar -d content_radar < dump.sql`.
7. Создать `.env.local` для фронта и `.env` для скрейпера. Заполнить все ключи.
8. Поднять Python venv: `cd scraper && python3 -m venv venv && venv/bin/pip install -r requirements.txt`.
9. Настроить cron: `bash scripts/setup-cron.sh` (предварительно отредактировав ключи).
10. Поднять SSH-туннель к EU-VPS для TikTok-прокси (см. [scraper/CLAUDE.md](../scraper/CLAUDE.md)).
11. Проверить: `python -m scraper.run_daily` — должен сделать прогон без ошибок.

## Деплой фронта

Сейчас Vercel автоматически деплоит каждый push в `main`. CI ([.github/workflows/](../.github/)) проверяет TypeScript и Next.js build.

Откатить:
- В панели Vercel → Deployments → найти предыдущий рабочий → Promote to Production.
- Или `git revert` нужный коммит → push.

## Контакты владельца провайдеров

Эти аккаунты привязаны к учётной записи владельца проекта (email/телефон). При передаче управления:
- Hiker, TikAPI, Apify — добавить нового агента/команду как member или передать пароль.
- Google Cloud (YouTube API) — добавить через IAM.
- Vercel — invite в team.
- VPS-провайдер — поделиться SSH-ключом или передать root-пароль (потом сменить).
- Telegram-бот — поделиться токеном.

## Регламент обновления документации

См. правило в корневом [CLAUDE.md](../CLAUDE.md) → раздел «Документация». Кратко:
- Меняешь архитектуру или провайдера → обновляешь `docs/ARCHITECTURE.md` и nested-CLAUDE.md.
- Меняешь крон / алерты / процедуру восстановления → обновляешь `docs/OPERATIONS.md`.
- Добавляешь новый секрет / провайдера / переменную окружения → `.env.example`.
- Каждый коммит, который меняет поведение системы, должен включать актуализацию docs в том же диффе.
