#!/bin/bash
# Cron-скрипт для ежедневного обновления метрик.
# Запускается через cron или Railway/Fly.io scheduler.
#
# Пример crontab (каждый день в 03:00):
#   0 3 * * * /path/to/content-radar/scraper/cron.sh >> /var/log/content-radar-scraper.log 2>&1

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON="${SCRIPT_DIR}/venv/bin/python"
LOG_FILE="${SCRIPT_DIR}/scraper.log"

echo "========================================" >> "$LOG_FILE"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Cron scraper started" >> "$LOG_FILE"

cd "$SCRIPT_DIR"
"$PYTHON" -m scraper.main >> "$LOG_FILE" 2>&1

EXIT_CODE=$?
if [ $EXIT_CODE -eq 0 ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Cron scraper finished OK" >> "$LOG_FILE"
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Cron scraper FAILED (exit code $EXIT_CODE)" >> "$LOG_FILE"
fi

exit $EXIT_CODE
