# Operations Runbook

Как держать ContentRadar в проде живым: ежедневные крон-джобы, мониторинг, восстановление после сбоев, ротация ключей.

## Прод-инфраструктура

Всё крутится на одном VPS: фронт (PM2), Postgres, и cron-скрейпер.

| Компонент | Где | Доступ |
|---|---|---|
| Фронт + API | VPS, через PM2 (`pm2 status content-radar`) | SSH + `pm2 logs content-radar` |
| База данных | PostgreSQL на том же VPS, `localhost:5432` | `DATABASE_URL` из `/root/content-radar/.env.local` |
| Скрейпер | VPS, `/root/content-radar/scraper/` | SSH-ключ + sudo |
| Cron | `/etc/cron.d/content-radar` | управляется через `scripts/setup-cron.sh` |
| Логи скрейпера | `/var/log/content-radar/` | SSH + `tail -f` |
| Логи фронта | `pm2 logs content-radar` | SSH |
| Деплой | GitHub Actions → SSH → `git pull` → `pm2 reload` | [.github/workflows/deploy.yml](../.github/workflows/deploy.yml) + secrets `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_DEPLOY_PATH` |
| Алерты | Telegram-бот | токен в `TELEGRAM_BOT_TOKEN` |

## Cron-расписание (МСК)

```
00:00  scraper.auto_discover           → /var/log/content-radar/discover.log
00:10  scraper.run_daily               → /var/log/content-radar/daily.log
01:00  scraper.audit                   → /var/log/content-radar/audit.log
07:00 пн  scripts/analyze_patterns.py  → /var/log/content-radar/patterns.log
```

Все команды на non-zero exit пушат алерт в Telegram через `scripts/notify-telegram.sh`.

`analyze_patterns.py` дополнительно шлёт Telegram-алерт при ≥3 подряд failed прогонах для одного тенанта (трекинг через `/opt/contentradar/pipeline_cache/pipeline_state.json`).

Изменить расписание: отредактировать `scripts/setup-cron.sh`, запустить от root, проверить `cat /etc/cron.d/content-radar`.

### Зависимости analyze_patterns.py

```bash
# Установить в scraper/venv (или отдельный venv):
pip install google-genai openai

# Бинари (уже есть на VPS для скрейпера):
# yt-dlp, ffmpeg

# Необходимые env (добавить в /root/content-radar/.env.local):
# GEMINI_API_KEY=...
# OPENAI_API_KEY=...
```

Кеш загруженных mp4 и транскриптов: `/opt/contentradar/pipeline_cache/`.
Идемпотентный: повторный запуск re-использует кеш (не скачивает и не анализирует снова).
Cost cap: ~$0.06–$0.15/прогон (все тенанты). Превышение логируется, не блокирует сохранение.

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

### «GitHub Actions деплой упал / не запустился»
1. github.com/aegon-7n/content-radar/actions → последний run на `main`.
2. Если у коммита вообще 0 check-runs — GitHub Actions не запустился:
   - Проверь Settings → Actions → General → убедись что Actions включены.
   - Проверь Billing → Actions → остаток минут (private repo Free plan = 2000 мин/месяц).
   - Если минуты кончились: либо апгрейд плана, либо активировать webhook-deploy (см. ниже).
3. Какая job упала?
   - **`build`** — TypeScript-ошибка или Next.js build provoked. Локально: `npm run build` чтобы воспроизвести.
   - **`python`** — синтаксическая ошибка в `scraper/`. Локально: `python -m compileall scraper`.
   - **`deploy`** — SSH/rsync не дотянулся до VPS. Проверь GitHub Secrets `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_DEPLOY_PATH`, и что VPS поднят.
4. Если build на VPS провалился, но Actions показал успех — SSH на VPS, `pm2 logs content-radar --lines 100`.
5. **Ручной деплой как fallback** (выполняется на VPS):
   ```bash
   cd /root/content-radar
   git pull origin main
   npm ci
   npm run build
   npm run db:migrate
   pm2 reload content-radar --update-env
   ```

### Деплой через webhook (альтернатива GitHub Actions)

`scripts/webhook-deploy.js` — отдельный Node.js-процесс, который слушает GitHub push-события и запускает деплой. Не требует GitHub Actions minutes и SSH-секретов.

**Первичная настройка (один раз):**

1. Сгенерировать секрет: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Добавить в `/root/content-radar/.env.local`:
   ```
   DEPLOY_WEBHOOK_SECRET=<generated-secret>
   DEPLOY_WEBHOOK_PORT=3001
   DEPLOY_PATH=/root/content-radar
   ```
3. Запустить webhook-сервер как отдельный pm2-процесс:
   ```bash
   cd /root/content-radar
   pm2 start scripts/webhook-deploy.js --name deploy-webhook
   pm2 save
   ```
4. Открыть порт 3001 (если есть firewall):
   ```bash
   ufw allow 3001/tcp
   ```
5. В GitHub → репо Settings → Webhooks → Add webhook:
   - Payload URL: `http://<VPS_IP>:3001/webhook`
   - Content type: `application/json`
   - Secret: `<DEPLOY_WEBHOOK_SECRET>`
   - Events: Just the push event ✓
6. Проверить: `curl http://<VPS_IP>:3001/health` → `{"status":"ok","deploying":false}`

**Мониторинг webhook-деплоя:**
```bash
pm2 logs deploy-webhook         # real-time
tail -f /var/log/content-radar/webhook-deploy.log
```

**Отключить (если GitHub Actions снова работает):**
```bash
pm2 stop deploy-webhook
pm2 delete deploy-webhook
pm2 save
```

### «Фронт на проде вернул 500»
1. SSH на VPS → `pm2 logs content-radar --err --lines 100`.
2. `pm2 status` — процесс жив? Если в `errored` — `pm2 restart content-radar --update-env`.
3. Если БД недоступна — `sudo systemctl status postgresql`, затем `psql -U contentradar -d content_radar -c "SELECT 1"`.
4. Если нужны новые env-переменные после правки `/root/content-radar/.env.local` — обязательно `pm2 restart content-radar --update-env` (без `--update-env` процесс не перечитает env).

### «404 на /api/health после изменения схемы»
1. Локальная схема разошлась с прод-БД. На проде запусти `npm run db:push` (для single-dev) или `db:migrate` (с миграциями).
2. **Проверь, что Python-скрейпер тоже работает с новой схемой** — в `scraper/db.py` колонки захардкожены.

## DNS-миграция на app.contentradar.app

Лендинг (`content-radar-landing`) задеплоен на Vercel и хочет занять корневой домен `contentradar.app`. Само приложение переезжает на поддомен `app.contentradar.app`. Первый клиент сейчас работает — нельзя обрезать доступ.

Порядок действий без даунтайма:

1. **В Vercel (лендинг)** → Domains → добавить `app.contentradar.app`. Vercel выдаст CNAME-запись.
2. **В DNS** → добавить `CNAME app → <vercel-cname>`. VPS ещё отвечает на корневом домене — клиент продолжает работать.
3. **В `.env.local` на VPS** → обновить `NEXTAUTH_URL=https://app.contentradar.app`.
4. **Выдать клиенту ссылку `app.contentradar.app`**, попросить попользоваться 2-3 дня.
5. После подтверждения: **в DNS** → переключить `A @` / `ALIAS @` с IP VPS на Vercel (лендинг занимает корневой домен).
6. **На Nginx/VPS** → добавить `301 Redirect` с `contentradar.app` на `app.contentradar.app` (или через Vercel Redirect).
7. Убедиться что `WAITLIST_INGEST_SECRET` на Vercel-лендинге совпадает с тем что на VPS.

При откате: вернуть DNS `A @` на IP VPS, `NEXTAUTH_URL` не трогать — `app.contentradar.app` продолжит работать.

## Ротация WAITLIST_INGEST_SECRET

Секрет используется для server-to-server auth между лендингом (Vercel) и основным приложением (VPS). Ротация без даунтайма:

1. Сгенерировать новый секрет: `openssl rand -hex 32`.
2. **Сначала** обновить на VPS: `/root/content-radar/.env.local` → `WAITLIST_INGEST_SECRET=<new>`, затем `pm2 restart content-radar --update-env`. VPS теперь принимает только новый секрет.
3. **Сразу** обновить в Vercel: Dashboard → content-radar-landing → Settings → Environment Variables → `WAITLIST_INGEST_SECRET`. Redeploy Vercel (или дождаться auto-deploy при следующем push).
4. Проверить: отправить тестовую заявку с лендинга, убедиться что в `/admin/waitlist` появилась строка и пришёл Telegram.

Если между шагами 2 и 3 лендинг отправит заявку — она вернёт 401 (секрет старый). Период риска — время Vercel-деплоя (обычно < 1 минуты). Потерянные заявки в этот момент придётся добавить вручную через `/admin/waitlist`.

## Ротация секретов

`scripts/setup-cron.sh` читает все ключи из `.env.local` (или `$ENV_FILE`). В скрипте нет захардкоженных секретов.

**Старые ключи были в git history** (до коммита, удалившего хардкод). При передаче проекта:

1. **Получить новые ключи** в HikerAPI / TikAPI / YouTube API console / Apify (revoke старые).
2. **Обновить `.env.local` на VPS** (`/root/content-radar/.env.local`).
3. **Перезапустить cron**: `bash /root/content-radar/scripts/setup-cron.sh` — скрипт сам подхватит новые значения.
4. **Перезапустить фронт**: `pm2 restart content-radar --update-env`.
5. Git history: можно почистить через `git filter-repo` / BFG, но при ротации ключей это необязательно — старые ключи бесполезны.

## TLS сертификаты

Сертификаты на VPS выдаёт Let's Encrypt через certbot. Срок жизни — 90 дней. Certbot автоматически обновляет сертификаты если настроен systemd timer или cron-задача.

### Проверка auto-renewal

SSH на VPS:
```bash
# Проверить systemd timer (Ubuntu 20+/22+):
systemctl status certbot.timer

# Или: cron-задача:
cat /etc/cron.d/certbot
crontab -l | grep certbot

# Dry-run (убедиться что certbot видит домены и может обновить):
certbot renew --dry-run
```

### Если auto-renewal НЕ настроен

```bash
# Обновить прямо сейчас (все домены в certbot):
certbot renew

# Включить systemd timer (правильный способ на Ubuntu 20+):
systemctl enable --now certbot.timer

# Или добавить cron если нет systemd (legacy):
echo "0 3 * * * root certbot renew --quiet" > /etc/cron.d/certbot
chmod 644 /etc/cron.d/certbot
```

### Мониторинг срока истечения

```bash
# Проверить все сертификаты certbot:
certbot certificates

# Проверить конкретный домен (quick check):
openssl s_client -connect app.contentradar.app:443 2>/dev/null | openssl x509 -noout -dates
```

### Домены на VPS

| Домен | Назначение | Certbot expected |
|---|---|---|
| `app.contentradar.app` | Основная платформа (Next.js + PM2) | Да |

Let's Encrypt выдаёт сертификаты на 90 дней. Auto-renewal срабатывает когда остаётся < 30 дней. Certbot timer обычно установлен при `apt install certbot`, но стоит убедиться один раз вручную.

## Бэкапы

**Сейчас бэкапов автоматических нет.** На single-tenant с 3 креаторами это терпимо, но при росте бизнеса — заводить:
- pgdump раз в сутки на VPS, копия на S3 / другой VPS.
- Skipper-сценарий: если БД восстанавливается из бэкапа, `scraper_state` нужно сбросить → следующий run догонит lookback.

## Восстановление с нуля

Если VPS умер целиком и нужно поднять заново:

1. Создать новый VPS (Ubuntu 22+).
2. `git clone https://github.com/aegon-7n/content-radar.git /root/content-radar`.
3. Установить системные зависимости: `apt install python3-venv postgresql nginx nodejs npm`. Установить `pm2` глобально: `npm install -g pm2`.
4. Создать БД: `sudo -u postgres createuser contentradar`, `createdb content_radar`.
5. Применить схему: `cd /root/content-radar && npm install && npm run db:push`.
6. Восстановить данные из бэкапа (если есть) → `psql -U contentradar -d content_radar < dump.sql`.
7. Создать `.env.local` для фронта и `.env` для скрейпера. Заполнить все ключи.
8. Поднять Python venv: `cd scraper && python3 -m venv venv && venv/bin/pip install -r requirements.txt`.
9. Настроить cron: `bash scripts/setup-cron.sh` (предварительно отредактировав ключи).
10. Поднять SSH-туннель к EU-VPS для TikTok-прокси (см. [scraper/CLAUDE.md](../scraper/CLAUDE.md)).
11. Запустить фронт под PM2: `cd /root/content-radar && npm run build && pm2 start npm --name content-radar -- start && pm2 save`.
12. Обновить `DEPLOY_HOST` (новый IP) в GitHub Secrets, добавить публичный SSH-ключ нового VPS на старый авторизованный, чтобы CI снова мог деплоить.
13. Проверить: `python -m scraper.run_daily` — должен сделать прогон без ошибок. `curl localhost:3000/api/health` — должен вернуть JSON со статусом.

## Деплой фронта

### Основной путь: GitHub Actions

GitHub Actions разделён на два воркфлоу:

- **[ci.yml](../.github/workflows/ci.yml)** — запускается на push и PR в `main`: `npm run build` + `python -m compileall scraper`. Не деплоит.
- **[deploy.yml](../.github/workflows/deploy.yml)** — запускается только на push в `main` (или вручную через `workflow_dispatch`). Деплоит на VPS через SSH:
  1. `git pull origin main`
  2. `npm ci`
  3. `npm run build`
  4. `npm run db:migrate` — применяет Drizzle-миграции
  5. `pm2 reload content-radar --update-env` — graceful reload без даунтайма

**GitHub Secrets** (Settings → Secrets and variables → Actions):
- `VPS_HOST` — IP или домен VPS.
- `VPS_USER` — SSH-пользователь (обычно `root`).
- `VPS_SSH_KEY` — приватный SSH-ключ (содержимое `~/.ssh/id_ed25519` или аналогичного).
- `VPS_DEPLOY_PATH` — полный путь к репо на VPS (например `/root/content-radar`).

**Если Actions не запускается** (0 check-runs на merge-коммите) — проверь Settings → Actions, и что Actions-минуты не исчерпаны. Альтернатива: webhook-deploy (см. выше «Деплой через webhook»).

Откатить деплой:
- `git revert <bad-commit>` → push в `main` → новый автоматический деплой с откатом.
- Или вручную на VPS: `cd /root/content-radar && git checkout <previous-good-sha> && npm ci --omit=dev && npm run build && pm2 reload content-radar --update-env`.

## Локальный idempotency-тест миграций

Запускается без доступа к продовой БД. Требует Docker.

```bash
./scripts/setup-test-db.sh
```

Что делает:
1. Поднимает `postgres:15` в контейнере `content-radar-test-db` на порту `5433`.
2. Применяет все миграции (`npm run db:migrate`) с `DATABASE_URL` теста — не трогает `.env.local`.
3. Запускает миграции второй раз — если скрипт падает здесь, значит в миграции нет `IF NOT EXISTS` / `IF EXISTS`.

При успехе печатает:
```
✓ Прогон №1 прошёл.
✓ Прогон №2 прошёл — миграции идемпотентны.
✓ Все проверки прошли.
```

Остановить тестовый контейнер:
```bash
./scripts/setup-test-db.sh --down
```

Подключиться к тестовой БД напрямую:
```bash
docker exec -it content-radar-test-db psql -U postgres -d content_radar_test
```

Этот тест не заменяет CI — он нужен для локальной проверки перед созданием PR с новой миграцией.

## Восстановить .env.local на VPS

После SSH на VPS — он лежит в `/root/content-radar/.env.local`. После правки **обязательно**:
```bash
pm2 restart content-radar --update-env
```
Без `--update-env` процесс не перечитает переменные.

## Контакты владельца провайдеров

Эти аккаунты привязаны к учётной записи владельца проекта (email/телефон). При передаче управления:
- Hiker, TikAPI, Apify — добавить нового агента/команду как member или передать пароль.
- Google Cloud (YouTube API) — добавить через IAM.
- VPS — передать SSH-ключ или сменить root-пароль.
- GitHub Secrets (`DEPLOY_HOST`, `DEPLOY_SSH_KEY`) — обновить если меняется хост или ключ.
- VPS-провайдер — поделиться SSH-ключом или передать root-пароль (потом сменить).
- Telegram-бот — поделиться токеном.

## Регламент обновления документации

См. правило в корневом [CLAUDE.md](../CLAUDE.md) → раздел «Документация». Кратко:
- Меняешь архитектуру или провайдера → обновляешь `docs/ARCHITECTURE.md` и nested-CLAUDE.md.
- Меняешь крон / алерты / процедуру восстановления → обновляешь `docs/OPERATIONS.md`.
- Добавляешь новый секрет / провайдера / переменную окружения → `.env.example`.
- Каждый коммит, который меняет поведение системы, должен включать актуализацию docs в том же диффе.
