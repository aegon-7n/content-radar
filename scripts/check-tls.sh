#!/bin/bash
# check-tls.sh — проверяет срок истечения TLS-сертификатов и отправляет
# предупреждение в Telegram если остаётся меньше WARN_DAYS дней.
#
# Предназначен для запуска из cron (еженедельно).
# Ошибок с exit 0 нет — скрипт всегда завершается успешно чтобы не спамить
# алертами от cron failure monitor. Telegram-уведомление = достаточный сигнал.
#
# Использование:
#   TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... bash check-tls.sh
#
# Или через setup-cron.sh (читает из .env.local автоматически).

set -u

DOMAINS=(
  "app.contentradar.app"
)
WARN_DAYS="${TLS_WARN_DAYS:-30}"

TG_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TG_CHAT_ID="${TELEGRAM_CHAT_ID:-}"

send_telegram() {
  local text="$1"
  if [[ -z "$TG_BOT_TOKEN" || -z "$TG_CHAT_ID" ]]; then
    echo "[check-tls] Telegram не настроен, вывод только в stdout"
    echo "$text"
    return 0
  fi
  curl -s -X POST \
    "https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage" \
    -d "chat_id=${TG_CHAT_ID}" \
    -d "parse_mode=HTML" \
    --data-urlencode "text=${text}" \
    > /dev/null
}

check_domain() {
  local domain="$1"
  local expiry_raw
  local expiry_epoch
  local now_epoch
  local days_left

  # Получаем дату истечения через openssl (таймаут 10 сек)
  expiry_raw=$(echo | timeout 10 openssl s_client -connect "${domain}:443" -servername "$domain" 2>/dev/null \
    | openssl x509 -noout -enddate 2>/dev/null \
    | sed 's/notAfter=//')

  if [[ -z "$expiry_raw" ]]; then
    echo "[check-tls] WARN: не удалось получить сертификат для ${domain}"
    send_telegram "⚠️ <b>TLS check failed</b>: не удалось подключиться к <code>${domain}:443</code>. Сервер недоступен или сертификат отсутствует."
    return
  fi

  expiry_epoch=$(date -d "$expiry_raw" +%s 2>/dev/null || date -j -f "%b %e %H:%M:%S %Y %Z" "$expiry_raw" +%s 2>/dev/null)
  now_epoch=$(date +%s)
  days_left=$(( (expiry_epoch - now_epoch) / 86400 ))

  echo "[check-tls] ${domain}: истекает ${expiry_raw} (через ${days_left} дн.)"

  if [[ $days_left -le 14 ]]; then
    send_telegram "🚨 <b>TLS CRITICAL — ${domain}</b>: сертификат истекает через <b>${days_left} дней</b> (${expiry_raw}). Немедленно: <code>certbot renew --force-renewal --cert-name ${domain}</code>"
  elif [[ $days_left -le $WARN_DAYS ]]; then
    send_telegram "⚠️ <b>TLS WARNING — ${domain}</b>: сертификат истекает через <b>${days_left} дней</b> (${expiry_raw}). Проверить certbot auto-renewal: <code>certbot renew --dry-run</code>"
  fi
}

for domain in "${DOMAINS[@]}"; do
  check_domain "$domain"
done

echo "[check-tls] done"
