#!/bin/bash
# Устанавливает cron-задачи для content-radar на сервере.
# Запускать от root: bash /root/content-radar/scripts/setup-cron.sh

set -e

APP_DIR="/root/content-radar"
PYTHON="$APP_DIR/scraper/venv/bin/python"
LOG_DIR="/var/log/content-radar"

mkdir -p "$LOG_DIR"

DB_URL="postgresql://contentradar:cr_prod_2026@localhost:5432/content_radar"
TT_KEY="45S3c2EI26r9woJu0ZQewPxzNV7rzZVF0CXWVa6miZiEzVJm"
YT_KEY="AIzaSyCs9Yhmttwp38Yx4KEv08hFYHdJWtQtH5Q"
HK_KEY="xlgysyjfstkzigwlvhegs8kd6745tv1m"
AP_TOKEN="${APIFY_TOKEN:-}"

# Telegram alerting. Fill both vars to enable push notifications on audit
# failures / scraper errors. Leave empty to fall back to log-only signal.
TG_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TG_CHAT_ID="${TELEGRAM_CHAT_ID:-}"

chmod +x "$APP_DIR/scripts/notify-telegram.sh"

cat > /etc/cron.d/content-radar << EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

# Авто-обнаружение новых роликов — каждый день в 00:00 МСК (21:00 UTC).
# На non-zero exit пушим алерт в Telegram (если токен задан).
0 21 * * * root cd $APP_DIR && DATABASE_URL='$DB_URL' TIKAPI_KEY='$TT_KEY' YOUTUBE_API_KEY='$YT_KEY' HIKERAPI_KEY='$HK_KEY' APIFY_TOKEN='$AP_TOKEN' $PYTHON -m scraper.auto_discover >> $LOG_DIR/discover.log 2>&1 || TELEGRAM_BOT_TOKEN='$TG_BOT_TOKEN' TELEGRAM_CHAT_ID='$TG_CHAT_ID' $APP_DIR/scripts/notify-telegram.sh "auto_discover fail" $LOG_DIR/discover.log

# Скрапинг метрик — каждый день в 00:10 МСК (21:10 UTC).
10 21 * * * root cd $APP_DIR && DATABASE_URL='$DB_URL' TIKAPI_KEY='$TT_KEY' YOUTUBE_API_KEY='$YT_KEY' HIKERAPI_KEY='$HK_KEY' APIFY_TOKEN='$AP_TOKEN' $PYTHON -m scraper.run_daily >> $LOG_DIR/daily.log 2>&1 || TELEGRAM_BOT_TOKEN='$TG_BOT_TOKEN' TELEGRAM_CHAT_ID='$TG_CHAT_ID' $APP_DIR/scripts/notify-telegram.sh "run_daily fail" $LOG_DIR/daily.log

# Аудит охвата — каждый день в 01:00 МСК (22:00 UTC), после auto_discover/run_daily.
# Exit != 0 означает пропуски или API failures — сразу идёт алерт в Telegram.
0 22 * * * root cd $APP_DIR && DATABASE_URL='$DB_URL' TIKAPI_KEY='$TT_KEY' YOUTUBE_API_KEY='$YT_KEY' HIKERAPI_KEY='$HK_KEY' APIFY_TOKEN='$AP_TOKEN' $PYTHON -m scraper.audit >> $LOG_DIR/audit.log 2>&1 || TELEGRAM_BOT_TOKEN='$TG_BOT_TOKEN' TELEGRAM_CHAT_ID='$TG_CHAT_ID' $APP_DIR/scripts/notify-telegram.sh "audit detected gaps" $LOG_DIR/audit.log
EOF

chmod 644 /etc/cron.d/content-radar

echo "Cron установлен. Задачи:"
echo "  00:00 МСК — scraper.auto_discover (новые ролики)"
echo "  00:10 МСК — scraper.run_daily     (метрики)"
echo "  01:00 МСК — scraper.audit         (проверка пропусков)"
echo ""
echo "Логи: $LOG_DIR/"
echo ""
echo "Проверить: crontab -l или cat /etc/cron.d/content-radar"
