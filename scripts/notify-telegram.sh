#!/bin/bash
# notify-telegram.sh — одноразовый скрипт для cron: если предыдущая команда
# вернула non-zero, отправляет последние N строк указанного лога в Telegram.
#
# Переменные окружения (обязательны):
#   TELEGRAM_BOT_TOKEN — токен от @BotFather
#   TELEGRAM_CHAT_ID   — ID получателя (узнать у @userinfobot)
#
# Использование в crontab:
#   0 22 * * * root cd /root/content-radar && ... /root/content-radar/scraper/venv/bin/python -m scraper.audit >> /var/log/content-radar/audit.log 2>&1 || /root/content-radar/scripts/notify-telegram.sh "Audit fail" /var/log/content-radar/audit.log

set -u

TITLE="${1:-Content Radar alert}"
LOG_PATH="${2:-}"

if [[ -z "${TELEGRAM_BOT_TOKEN:-}" || -z "${TELEGRAM_CHAT_ID:-}" ]]; then
  echo "[notify-telegram] TELEGRAM_BOT_TOKEN/CHAT_ID не заданы, пропускаем" >&2
  exit 0
fi

TAIL=""
if [[ -n "$LOG_PATH" && -f "$LOG_PATH" ]]; then
  # Берём последние 30 строк лога. Обрезаем до 3500 символов чтобы пройти
  # лимит Telegram message на 4096 символов с запасом на форматирование.
  TAIL=$(tail -n 30 "$LOG_PATH" | tail -c 3500)
fi

MESSAGE=$(printf '⚠️ %s\n\n<pre>%s</pre>' "$TITLE" "$TAIL")

# Route through SOCKS5 proxy when set — needed when Telegram IPs (149.154.x.x)
# are blocked by ISP. SOCKS_PROXY is the same tunnel used for TikTok.
PROXY_ARGS=()
if [[ -n "${SOCKS_PROXY:-}" ]]; then
  PROXY_ARGS=(--proxy "${SOCKS_PROXY}")
fi

curl -s -X POST \
  "${PROXY_ARGS[@]}" \
  "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d "chat_id=${TELEGRAM_CHAT_ID}" \
  -d "parse_mode=HTML" \
  --data-urlencode "text=${MESSAGE}" \
  > /dev/null
