# ContentRadar — Backlog

Приоритетный список задач. Обновлять по мере выполнения.

---

## Следующий спринт

- [ ] **CI/CD**: push в main → GitHub Actions build → auto-deploy на сервер (SSH + PM2 restart). Убрать ручной scp.
- [ ] **Auto-rescrape retry**: если видео failed 3 ночи подряд → пометить `permanently_unavailable`, не тратить API calls.
- [ ] **UI для ru_cross_border_block**: показывать недоступные видео в `/videos` с тегом "недоступно в регионе".

## Потом (когда клиент попросит)

- [ ] **Multi-tenancy**: single-admin → multi-user. 4-6ч рефакторинга схемы + onboarding flow. Обсудить модель монетизации (per-creator / per-video / flat).
- [ ] **Alerting на бизнес-метрики**: "у Полины -50% просмотров за неделю" / "вирусный ролик >1M" → Telegram. Расширение audit.py + notify-telegram.sh.
- [ ] **Экспорт в Excel**: /api/export?format=xlsx&period=30d. Клиент раньше вёл Excel-таблицы, может хотеть автосгенерированные.
- [ ] **Исторические графики >30 дней**: сейчас delta-model считает max 30д. Для "покажи рост за 3 месяца" — нужна отдельная агрегация.
- [ ] **Pinterest official API**: если клиент пришлёт developer credentials. Пока RSS + scraper (метрики пинов не парсятся из HTML с 2026, нужен API или Apify actor).
- [ ] **TikTok proxy**: если клиент жалуется на ru_cross_border_block. Residential proxy ~$5-15/мес через US/EU.
- [ ] **Перенос сервера в EU**: решает TikTok geoblock + потенциальные Instagram ограничения. Но downtime + DNS.
- [ ] **Self-serve onboarding**: landing + регистрация + биллинг (Stripe). Когда multi-tenancy готова и есть 2-3 клиента.
