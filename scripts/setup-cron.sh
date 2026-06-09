#!/bin/bash
# Устанавливает cron-задачи для content-radar на сервере.
# Запускать от root: bash /root/content-radar/scripts/setup-cron.sh

set -eu

APP_DIR="/root/content-radar"
PYTHON="$APP_DIR/scraper/venv/bin/python"
LOG_DIR="/var/log/content-radar"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env.local}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found. Copy .env.example → .env.local and fill in secrets." >&2
  exit 1
fi

# Safe parser: handles unquoted values with shell metacharacters (e.g. < in email addresses)
while IFS= read -r _line || [[ -n "$_line" ]]; do
  [[ "$_line" =~ ^[[:space:]]*# ]] && continue
  [[ "$_line" =~ ^[[:space:]]*$ ]] && continue
  if [[ "$_line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
    _key="${BASH_REMATCH[1]}"
    _val="${BASH_REMATCH[2]}"
    _val="${_val#\"}" ; _val="${_val%\"}"
    _val="${_val#\'}" ; _val="${_val%\'}"
    export "$_key=$_val"
  fi
done < "$ENV_FILE"
unset _line _key _val

mkdir -p "$LOG_DIR"

DB_URL="${DATABASE_URL:?DATABASE_URL is required in $ENV_FILE}"
TT_KEY="${TIKAPI_KEY:?TIKAPI_KEY is required in $ENV_FILE}"
YT_KEY="${YOUTUBE_API_KEY:?YOUTUBE_API_KEY is required in $ENV_FILE}"
HK_KEY="${HIKERAPI_KEY:?HIKERAPI_KEY is required in $ENV_FILE}"
AP_TOKEN="${APIFY_TOKEN:-}"
SOCKS="${SOCKS_PROXY:-socks5://127.0.0.1:1080}"

TG_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TG_CHAT_ID="${TELEGRAM_CHAT_ID:-}"

GEMINI_KEY="${GEMINI_API_KEY:-}"
OAI_KEY="${OPENAI_API_KEY:-}"

chmod +x "$APP_DIR/scripts/notify-telegram.sh"
chmod +x "$APP_DIR/scripts/check-tls.sh"

cat > /etc/cron.d/content-radar << EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

# Авто-обнаружение новых роликов — каждый день в 00:00 МСК (21:00 UTC).
# На non-zero exit пушим алерт в Telegram (если токен задан).
0 21 * * * root cd $APP_DIR && DATABASE_URL='$DB_URL' TIKAPI_KEY='$TT_KEY' YOUTUBE_API_KEY='$YT_KEY' HIKERAPI_KEY='$HK_KEY' APIFY_TOKEN='$AP_TOKEN' SOCKS_PROXY='$SOCKS' $PYTHON -m scraper.auto_discover >> $LOG_DIR/discover.log 2>&1 || TELEGRAM_BOT_TOKEN='$TG_BOT_TOKEN' TELEGRAM_CHAT_ID='$TG_CHAT_ID' $APP_DIR/scripts/notify-telegram.sh "auto_discover fail" $LOG_DIR/discover.log

# Скрапинг метрик — каждый день в 00:10 МСК (21:10 UTC).
10 21 * * * root cd $APP_DIR && DATABASE_URL='$DB_URL' TIKAPI_KEY='$TT_KEY' YOUTUBE_API_KEY='$YT_KEY' HIKERAPI_KEY='$HK_KEY' APIFY_TOKEN='$AP_TOKEN' SOCKS_PROXY='$SOCKS' $PYTHON -m scraper.run_daily >> $LOG_DIR/daily.log 2>&1 || TELEGRAM_BOT_TOKEN='$TG_BOT_TOKEN' TELEGRAM_CHAT_ID='$TG_CHAT_ID' $APP_DIR/scripts/notify-telegram.sh "run_daily fail" $LOG_DIR/daily.log

# Аудит охвата — каждый день в 01:00 МСК (22:00 UTC), после auto_discover/run_daily.
# Exit != 0 означает пропуски или API failures — сразу идёт алерт в Telegram.
0 22 * * * root cd $APP_DIR && DATABASE_URL='$DB_URL' TIKAPI_KEY='$TT_KEY' YOUTUBE_API_KEY='$YT_KEY' HIKERAPI_KEY='$HK_KEY' APIFY_TOKEN='$AP_TOKEN' SOCKS_PROXY='$SOCKS' $PYTHON -m scraper.audit >> $LOG_DIR/audit.log 2>&1 || TELEGRAM_BOT_TOKEN='$TG_BOT_TOKEN' TELEGRAM_CHAT_ID='$TG_CHAT_ID' $APP_DIR/scripts/notify-telegram.sh "audit detected gaps" $LOG_DIR/audit.log

# Дайджест бизнес-метрик → Telegram — каждый день в 02:30 МСК (23:30 UTC), после audit.
# Нет API-запросов — только SQL. Алерты: вирусные ролики, WoW изменения, новые ролики.
# Exit всегда 0 — только информационный, не операционный.
30 23 * * * root cd $APP_DIR && DATABASE_URL='$DB_URL' TELEGRAM_BOT_TOKEN='$TG_BOT_TOKEN' TELEGRAM_CHAT_ID='$TG_CHAT_ID' $PYTHON -m scraper.analyze >> $LOG_DIR/analyze.log 2>&1

# TLS cert expiry check — каждый понедельник в 09:00 МСК (06:00 UTC).
# Отправляет Telegram-предупреждение если до истечения < 30 дней.
0 6 * * 1 root TELEGRAM_BOT_TOKEN='$TG_BOT_TOKEN' TELEGRAM_CHAT_ID='$TG_CHAT_ID' bash $APP_DIR/scripts/check-tls.sh >> $LOG_DIR/tls-check.log 2>&1

# AI pattern analysis — каждый понедельник в 04:00 UTC (07:00 МСК).
# Скачивает топ-15 + средние-15 роликов каждого тенанта, анализирует через Gemini,
# сохраняет в tenant_insights для WeeklyPatternsWidget.
0 4 * * 1 root cd $APP_DIR && DATABASE_URL='$DB_URL' GEMINI_API_KEY='$GEMINI_KEY' OPENAI_API_KEY='$OAI_KEY' SOCKS_PROXY='$SOCKS' TELEGRAM_BOT_TOKEN='$TG_BOT_TOKEN' TELEGRAM_CHAT_ID='$TG_CHAT_ID' $PYTHON $APP_DIR/scripts/analyze_patterns.py >> $LOG_DIR/patterns.log 2>&1 || TELEGRAM_BOT_TOKEN='$TG_BOT_TOKEN' TELEGRAM_CHAT_ID='$TG_CHAT_ID' $APP_DIR/scripts/notify-telegram.sh "analyze_patterns fail" $LOG_DIR/patterns.log
EOF

chmod 644 /etc/cron.d/content-radar

echo "Cron установлен. Секреты прочитаны из: $ENV_FILE"
echo ""
echo "Задачи:"
echo "  00:00 МСК — scraper.auto_discover (новые ролики)"
echo "  00:10 МСК — scraper.run_daily     (метрики)"
echo "  02:30 МСК — scraper.analyze       (дайджест бизнес-метрик → Telegram)"
echo "  09:00 МСК пн — check-tls         (проверка TLS-сертификатов)"
echo "  07:00 МСК пн — analyze_patterns  (AI-паттерны топа, Gemini 2.5 Flash)"
echo "  01:00 МСК — scraper.audit         (проверка пропусков)"
echo ""
echo "Логи: $LOG_DIR/"
echo ""
echo "Проверить: crontab -l или cat /etc/cron.d/content-radar"
