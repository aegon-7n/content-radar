# ContentRadar Scraper

Python-скрипты для ежедневного сбора метрик роликов из соцсетей.
Читает ссылки из таблицы `videos` в PostgreSQL, пишет результаты в `video_metrics`.

## Установка зависимостей

Требуется Python 3.11+.

```bash
cd scraper
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Переменные окружения

Скрипт читает `.env.local` из корня проекта (на уровень выше папки `scraper/`).

| Переменная | Обязательная | Описание |
|---|---|---|
| `DATABASE_URL` | Да | PostgreSQL connection string: `postgresql://user:password@host:5432/dbname` |
| `YOUTUBE_API_KEY` | Нет | API-ключ YouTube Data API v3. Без него YouTube работает через yt-dlp (менее надёжно). |
| `SCRAPER_DELAY` | Нет | Задержка между запросами в секундах. По умолчанию `2.0`. |
| `SCRAPER_MAX_RETRIES` | Нет | Количество повторных попыток при ошибке. По умолчанию `3`. |

Пример `.env.local`:
```
DATABASE_URL=postgresql://postgres:password@db.example.supabase.co:5432/postgres
YOUTUBE_API_KEY=AIza...
SCRAPER_DELAY=2.0
SCRAPER_MAX_RETRIES=3
```

## Запуск

Запускать из корня проекта (`content-radar/`), не из папки `scraper/`:

```bash
# Все платформы
python -m scraper.main

# Только TikTok
python -m scraper.main --platform tiktok

# Несколько платформ
python -m scraper.main --platform tiktok,youtube

# Тестовый запуск без записи в БД
python -m scraper.main --dry-run

# Включить подробный лог
python -m scraper.main --debug
```

Лог пишется в `scraper.log` (в директории откуда запущен скрипт) и в stdout.

## Настройка Cron

```bash
# Каждый день в 03:00 по серверному времени
0 3 * * * cd /app && python -m scraper.main >> /var/log/contentradar-scraper.log 2>&1
```

Если скрипт завершился с ошибками (хотя бы один ролик не удалось обработать),
код возврата будет `1`. Это можно использовать для мониторинга в cron/supervisor.

## Известные ограничения по платформам

### TikTok
- Нет публичного API. Используется yt-dlp и HTTP-парсинг.
- TikTok активно усложняет скрапинг. После обновлений платформы методы могут перестать работать.
- `saves` (collectCount) доступен только через HTTP-парсинг JSON страницы, не через yt-dlp.
- Приватные и удалённые ролики вернут `None`.
- При частых запросах TikTok может начать возвращать капчу — увеличьте `SCRAPER_DELAY`.

### YouTube
- При наличии `YOUTUBE_API_KEY` используется официальный YouTube Data API v3.
- Квота API: 10 000 units/день бесплатно. Каждый запрос на статистику стоит 1 unit.
- `shares` и `saves` не доступны через YouTube API — будут `null` в БД.
- `likeCount` может быть скрыт автором — в таком случае тоже `null`.
- Без `YOUTUBE_API_KEY` используется yt-dlp как менее надёжный fallback.

### Instagram Reels
- Instagram не имеет публичного API для метрик чужих аккаунтов.
- yt-dlp работает только для публичных аккаунтов.
- `comments`, `shares`, `saves` недоступны публично — будут `null`.
- Instagram блокирует неаутентифицированные запросы (401/403). При блокировке скрапер вернёт `null`.
- Для надёжной работы требуется авторизованный сеанс (cookies) — не реализован в MVP.

### Likee
- Нет публичного API.
- yt-dlp поддерживает Likee, но поддержка может прекратиться.
- HTTP-парсинг ищет `window.__INITIAL_STATE__` в HTML — структура может меняться.

### Pinterest
- Официальный API требует OAuth и не отдаёт метрики для чужих пинов.
- Главная метрика: `saves` (repins). `views` на Pinterest — это "показы", не гарантированно отдаются.
- HTTP-парсинг ищет JSON в `__PWS_INITIAL_PROPS__` / `__PWS_DATA__` — структура может меняться.
- Короткие ссылки `pin.it/XXX` автоматически разворачиваются.

## Принципы работы

- **Точность данных — приоритет**: если метрику получить не удалось, в БД пишется `NULL`, а не `0`.
- **Одна ошибка не останавливает процесс**: каждый ролик обрабатывается в независимом try/except.
- **Retry с exponential backoff**: 3 попытки с задержками 2, 4, 8 секунд.
- **Rate limiting**: задержка `SCRAPER_DELAY` секунд между запросами к одной платформе.
- **Итоговая сводка**: после завершения в лог выводится таблица: платформа, обработано/успешно/ошибок/время.
