# ContentRadar — Backlog

Приоритетный список задач. Обновлять по мере выполнения.

---

## Следующий спринт

- [ ] **CI/CD**: push в main → GitHub Actions build → auto-deploy на сервер (SSH + PM2 restart). Убрать ручной scp.
- [x] **Auto-rescrape retry**: если видео failed 3 ночи подряд → пометить `permanently_unavailable`, не тратить API calls. _(failStreak реализован в scraper; `>= 3` → пропуск; UI: тег «недоступен»)_
- [x] **UI для ru_cross_border_block**: показывать недоступные видео в `/videos` с тегом "недоступно в регионе". _(отличается от failStreak — это geo-блок, не удаление ролика)_ _(PR #52, TRU-276)_

## Высокий приоритет (блокирует монетизацию)

> Без multi-tenancy waitlist не превратится в активных юзеров — это блокер монетизации. Лиды копятся в `waitlist_signups`, но онбордить их некуда пока нет регистрации и изоляции данных.

- [ ] **Multi-tenancy**: фильтрация всех API-запросов по `user_id` (сейчас нет WHERE `user_id = ?`), регистрация нового пользователя, изоляция данных. 4-6ч рефакторинга схемы + auth-flow. **Без этого онбординг каждого нового клиента — ручная работа.**
- [ ] **ЮKassa: рекуррентные подписки**: webhook `payment.succeeded` → активация аккаунта, `payment.canceled` → блокировка. Тарифы: 10-15К ₽/мес base, до 30К custom. Нужна интеграция ЮKassa API + модель `subscriptions` в БД. **Без биллинга нет автоматической монетизации.**

## Лендинг и хостинг

- [ ] **Перенос лендинга с Vercel на свой VPS** — стартуем на **Vercel Hobby (бесплатный)** ради скорости запуска, но это формально нарушает их ToS для коммерческого SaaS. План: при апгрейде конфига VPS (партнёр уже планирует) — поднять `content-radar-landing` рядом с `content-radar` через PM2 на отдельном порту, развести через nginx. Триггер для миграции: первая платящая когорта (5+ клиентов) ИЛИ предупреждение от Vercel.
- [ ] **Альтернатива до миграции:** апгрейд на **Vercel Pro ($20/мес)** — снимает ToS-риск, добавляет collab/preview-фичи. Решение принимать когда появится первая выручка.
- [x] **Промокоды для рефералов** — отдельная таблица `referral_codes` (code PK, partner_name, used_count, created_at) + поле `referral_code` в `waitlist_signups` для атрибуции. _(реализовано в PR#42)_
- [x] **Партнёрский кабинет** — страница `/admin/referrals` с созданием кодов, счётчиком использований, копированием. _(реализовано в PR#42, только admin visibility)_

## Потом (когда клиент попросит)

- [ ] **Alerting на бизнес-метрики**: "у Полины -50% просмотров за неделю" / "вирусный ролик >1M" → Telegram. Расширение audit.py + notify-telegram.sh.
- [ ] **Обработка permanently_unavailable в UI**: показывать недоступные видео в `/videos` с тегом, не скрывать их.
- [x] **Вынос секретов из setup-cron.sh**: ~~сейчас API-ключи захардкожены в скрипте~~ — теперь читает из `.env.local`. Старые ключи в git history, нужна ротация.
- [x] **Обработка permanently_unavailable в UI**: тег «недоступен» на `/videos` (список + детальная + CSV), banner на детальной. _(реализовано в PR#41)_
- [x] **Экспорт в Excel**: `/api/videos/export?format=xlsx` — параметр `format=csv|xlsx` (default csv), xlsx через пакет `xlsx`. _(TRU-278)_
- [ ] **Исторические графики >30 дней**: сейчас delta-model считает max 30д. Для "покажи рост за 3 месяца" — нужна отдельная агрегация.
- [ ] **Pinterest official API**: если клиент пришлёт developer credentials. Пока RSS + scraper (метрики пинов не парсятся из HTML с 2026, нужен API или Apify actor).
- [ ] **TikTok proxy**: если клиент жалуется на ru_cross_border_block. Residential proxy ~$5-15/мес через US/EU.
- [ ] **Перенос сервера в EU**: решает TikTok geoblock + потенциальные Instagram ограничения. Но downtime + DNS.
- [ ] **Self-serve onboarding**: landing + регистрация + биллинг. После multi-tenancy и ЮKassa.
