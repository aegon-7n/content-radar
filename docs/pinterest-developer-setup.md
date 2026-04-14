# Pinterest — как получить API-доступ

Пошаговая инструкция для заказчика/партнёра. Нужно один раз, занимает
~10 минут. В конце пришли нам **App ID** и **App Secret Key** — мы
подключим Pinterest API к ContentRadar.

---

## Что мы получим после подключения

Сейчас Pinterest в ContentRadar работает через публичный RSS фид
профиля — мы видим новые пины, но метрики (сохранения, клики, показы)
доступны только через официальный API. После регистрации developer app:

- **Сохранения** (repins) — главная метрика Pinterest
- **Показы** (impressions)
- **Клики** на пин
- **Комментарии**
- Автоматическая синхронизация всех пинов раз в сутки (без ручного
  добавления ссылок)

---

## Шаг 1 — завести Pinterest Business аккаунт

Если у тебя уже есть бизнес-аккаунт на Pinterest, пропусти шаг.

1. Зайди на [business.pinterest.com](https://business.pinterest.com/) и
   войди под своим обычным Pinterest логином.
2. На странице нажми **Convert to business** (или **Create new
   business account**, если хочешь отдельный).
3. Заполни имя бизнеса, страну, индустрию (можно выбрать «Retail» или
   «E-commerce»).
4. Подтверди email, если попросят.

---

## Шаг 2 — получить доступ разработчика

1. Перейди на **[developers.pinterest.com](https://developers.pinterest.com/)**
2. Нажми **Log in** в правом верхнем углу — войди тем же аккаунтом,
   что и в шаге 1.
3. Если это твой первый вход, Pinterest попросит принять условия
   разработчика — нажимай **Accept**.

---

## Шаг 3 — создать приложение

1. В верхнем меню выбери **My apps** →
   **[developers.pinterest.com/apps](https://developers.pinterest.com/apps/)**.
2. Нажми зелёную кнопку **Connect app** (или **Create app**).
3. Заполни форму:
   - **App name:** `ContentRadar` (или любое другое имя)
   - **App description:** `Analytics dashboard for my content studio`
   - **Terms of Service URL:** можно оставить пустым или указать
     `https://contentradar.app`
   - **Privacy Policy URL:** то же самое
4. Выбери нужные скоупы (галочки):
   - ✅ `boards:read`
   - ✅ `pins:read`
   - ✅ `user_accounts:read`
   - (Всё остальное можно не трогать — нам нужно только чтение.)
5. В поле **Redirect URIs** вставь:
   ```
   https://contentradar.app/api/pinterest/callback
   ```
6. Нажми **Request access** (или **Submit**).

---

## Шаг 4 — получить API-ключи

После того как приложение создано:

1. Открой его из списка **My apps**.
2. Найди раздел **Your app**. Там будет:
   - **App ID** — короткая строка цифр
   - **App secret key** — длинная строка букв и цифр (нажми
     **Show** или **Generate** чтобы увидеть)

---

## Шаг 5 — прислать мне

Скинь в Telegram **двумя сообщениями**:

```
PINTEREST_APP_ID=1234567
PINTEREST_APP_SECRET=abc123...def456
```

**Secret** никому больше не показывай — он даёт полный read-доступ
к твоему аккаунту. Я его сразу положу в защищённые переменные на
сервере и в код он не попадёт.

---

## Если что-то пошло не так

- **«Request access is not available»** — Pinterest иногда требует
  несколько минут после создания бизнес-аккаунта. Подожди 5 минут,
  перезагрузи страницу.
- **«App name already taken»** — добавь год к названию: `ContentRadar-2026`.
- **«Your developer account is pending review»** — это нормально,
  Pinterest одобряет автоматически в течение нескольких минут —
  часа. Можно просто дождаться и прислать ключи позже.
- Скоупы стали платными / требуют approval — скинь мне скриншот
  формы, подберём альтернативу (обойдёмся RSS + scraping).
