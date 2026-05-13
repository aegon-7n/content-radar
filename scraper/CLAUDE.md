# scraper/ — Python-скрейперы метрик

Здесь живут три cron-джоба и пять платформенных скрейперов. Это самый дорогой по деньгам кусок проекта — каждая правка должна оцениваться через "сколько API-запросов добавим/уберём".

## Три cron-джоба (МСК)

| Время | Скрипт | Что делает | Запись в БД |
|---|---|---|---|
| 00:00 | `auto_discover.py` | По username/channel_id креатора находит **новые** ролики за `LOOKBACK_HOURS` (мин 7д, макс 30д, self-healing). Извлекает артикул WB из описания (5+ цифр подряд). Если артикул новый — создаёт `products` с `needs_review=1`. | INSERT в `videos` |
| 00:10 | `run_daily.py` | Для каждого ролика моложе `SCRAPE_HORIZON_DAYS` (по умолчанию **30**) и с `fail_streak < 3` запрашивает свежие метрики. **Adaptive cadence**: ролики ≤ `FRESH_DAYS` (по умолчанию 14) скрейпим каждый день; старше — раз в `STALE_GAP_DAYS + 1` дней (по умолчанию каждые 3 дня). На неудаче инкрементит `fail_streak`, на успехе сбрасывает. | INSERT в `video_metrics` |
| 01:00 | `audit.py` | Сверяет «сколько роликов реально опубликовано за 30д на платформе» vs «сколько у нас в БД». При расхождении ≥1 → exit 1 → Telegram-алерт. | UPDATE `scraper_state` |

Все три пишут результат в таблицу `scraper_state` (`job_name` PK), оттуда читает `/api/health`. Расписание зашито в [scripts/setup-cron.sh](../scripts/setup-cron.sh).

## Платформы и провайдеры

| Платформа | Метрики (`run_daily`) | Discovery (`auto_discover`) | Стоимость |
|---|---|---|---|
| TikTok | TikAPI.io `/public/video` + HTTP fallback | TikAPI `/public/check` + `/public/posts` | ~$0.002/req. Нужен SOCKS5-прокси из EU из-за `ru_cross_border_block`. |
| YouTube | YouTube Data API v3 `/videos` (1 unit) | `playlistItems.list` на Uploads playlist (1 unit/call) | **Бесплатно**, лимит 10K units/день. Discovery + audit теперь 1 unit/call (было 100 через `search.list`). |
| Instagram | HikerAPI `/media/by/url` | HikerAPI `/user/by/username` + `/user/clips/chunk` | $0.0006/req для media, `/clips/chunk` дороже (~×3-5). |
| Likee | Apify actor `sashaebashu/likee-scraper` | **Нет** — добавляется вручную через Settings | **~$0.01/ролик** — самый дорогой источник. |
| Pinterest | HTTP-парсинг страницы | RSS-фид `pinterest.com/{user}/feed.rss` | **Бесплатно**. Метрики скудные (только `repin_count`). |

**Все скрейперы наследуют `BaseScraper`** ([scrapers/base.py](scrapers/base.py)) — он реализует retry с exponential backoff (2/4/8 сек) и `REQUEST_DELAY` между роликами. Переопределяешь только `scrape_video(video_id, url) → VideoMetric | None`.

## Контракт `VideoMetric`

```python
VideoMetric(video_id, views, likes, comments, shares, saves, scraped_at)
```

- **`views is None` → метрика невалидна, в БД не пишется.** Лучше пустая строка, чем фальшивый ноль (см. `models.py:27`).
- Поля, которые платформа не отдаёт публично (например, `shares` у Instagram, `saves`/`shares` у YouTube), **остаются None** — не подменять нулями.

## Self-healing и fail_streak

- `compute_lookback_hours()` в `auto_discover.py` смотрит `scraper_state.last_success_at`. Если прошлый успех был N часов назад, окно поиска расширяется до `N + 24h` (но не больше 30 дней). Скрипт можно безнаказанно не запускать неделю — в следующий раз догонит.
- `fail_streak >= 3` → ролик считается `permanently_unavailable` и пропускается во всех будущих прогонах. Сбрасывается при первом успешном скрейпе.

## Алёрты

- Cron'овский `||` оператор пушит вывод последнего прогона в Telegram через `scripts/notify-telegram.sh`, если `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID` заданы.
- `run_daily` алертит только при `fail_rate ≥ 20%` (см. `FAIL_RATE_THRESHOLD`) — единичные сбои не пейджат.
- `audit.py` алертит при любом GAP — это страховка против пропущенных роликов в discovery.

## Локальный запуск

```bash
cd scraper
source venv/bin/activate
python -m scraper.run_daily          # метрики
python -m scraper.auto_discover      # новые ролики
python -m scraper.audit              # проверка покрытия
python main.py --platform tiktok --dry-run   # одна платформа без записи
```

Все ключи и `DATABASE_URL` читаются из `.env.local` в корне репо через `config.py`. Запускать **из корня** или через `python -m scraper.X`, не напрямую (модульные импорты).

## Известные ловушки

1. **HikerAPI пагинация дорогая.** Любой `for _page in range(5)` на `/user/clips/chunk` — это 5 платных запросов. Ставь early-exit по `published_at < since`, как в `fetch_instagram_videos` ([auto_discover.py:507](auto_discover.py#L507)).
2. **YouTube quota.** Discovery и audit теперь используют `playlistItems.list` (1 unit/call) вместо `search.list` (100 units/call). Uploads playlist ID = `"UU" + channelId[2:]`. Пагинация с early-exit по дате. Если кто-то вернёт `search.list` — это 100× откат по расходу квоты.
3. **TikTok через российский IP блочит** (`ru_cross_border_block`). На проде заведён SSH-туннель `socks5://127.0.0.1:1080` к EU-VPS, путь `SOCKS_PROXY` в env. Без прокси — все TikTok-запросы вернут пустоту.
4. **Likee discovery невозможен** — фид заблокирован anti-bot, единственный путь к их API — числовой `uid`, который пользователю не виден. Поэтому ролики Likee добавляются только вручную URL'ом через `/settings`. Контекст: [docs/likee-research.md](../docs/likee-research.md).
5. **Apify actor для Likee синхронный, тайм-аут до 120 сек.** Это самая медленная и самая дорогая платформа.
6. **Cache HikerAPI агрессивный.** Повторный вызов `/user/by/username` иногда триггерит обновление кэша — это полудокументированный трюк, см. комментарий в `fetch_instagram_videos`.

## Когда что-то падает

- Смотри `scraper_state` — там `last_status`, `last_message`, `last_run_at` для каждого джоба.
- `/api/health` отдаёт это в виде JSON (внутренний эндпоинт).
- Логи на проде: `/var/log/content-radar/{discover,daily,audit}.log`.
- При росте расходов первое подозреваемое — `audit.py` или пагинация в `auto_discover` (см. ловушку #1, #2).

## ⚠️ Безопасность

`scripts/setup-cron.sh` сейчас содержит API-ключи **в открытом виде** в репозитории (TIKAPI_KEY, YOUTUBE_API_KEY, HIKERAPI_KEY). При первом удобном случае это надо вынести в `.env` на сервере и держать `setup-cron.sh` без секретов.
