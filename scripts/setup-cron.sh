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

cat > /etc/cron.d/content-radar << EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

# Авто-обнаружение новых роликов — каждый день в 00:00 МСК (21:00 UTC)
0 21 * * * root cd $APP_DIR && DATABASE_URL='$DB_URL' TIKAPI_KEY='$TT_KEY' YOUTUBE_API_KEY='$YT_KEY' HIKERAPI_KEY='$HK_KEY' $PYTHON -m scraper.auto_discover >> $LOG_DIR/discover.log 2>&1

# Скрапинг метрик — каждый день в 00:10 МСК (21:10 UTC)
10 21 * * * root cd $APP_DIR && DATABASE_URL='$DB_URL' TIKAPI_KEY='$TT_KEY' YOUTUBE_API_KEY='$YT_KEY' HIKERAPI_KEY='$HK_KEY' $PYTHON -m scraper.run_daily >> $LOG_DIR/daily.log 2>&1

# Аудит охвата — каждый день в 01:00 МСК (22:00 UTC), после auto_discover/run_daily.
# Логирует WARNING если на платформе больше роликов чем у нас в БД (> 30 дней).
0 22 * * * root cd $APP_DIR && DATABASE_URL='$DB_URL' TIKAPI_KEY='$TT_KEY' YOUTUBE_API_KEY='$YT_KEY' HIKERAPI_KEY='$HK_KEY' $PYTHON -m scraper.audit >> $LOG_DIR/audit.log 2>&1
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
