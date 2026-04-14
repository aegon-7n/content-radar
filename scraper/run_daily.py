"""
Ежедневный скрапер — запускается кроном.
Собирает метрики для видео моложе SCRAPE_HORIZON_DAYS (по умолчанию 90 дней).
"""
import sys
import os
import logging
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from scraper.config import DATABASE_URL, SCRAPE_HORIZON_DAYS
from scraper.scrapers.tiktok import TikTokScraper
from scraper.scrapers.youtube import YouTubeScraper
from scraper.scrapers.instagram import InstagramScraper
from scraper.scrapers.likee import LikeeScraper
from scraper.scrapers.pinterest import PinterestScraper

import psycopg2

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)


def main():
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    # Только видео моложе SCRAPE_HORIZON_DAYS — старые не трогаем
    horizon = datetime.now(tz=timezone.utc) - timedelta(days=SCRAPE_HORIZON_DAYS)

    cur.execute(
        "SELECT id, platform, url FROM videos WHERE published_at >= %s ORDER BY created_at",
        (horizon,)
    )
    videos = cur.fetchall()
    logger.info(
        "Found %d videos to scrape (published within last %d days)",
        len(videos), SCRAPE_HORIZON_DAYS
    )

    scrapers = {
        "tiktok": TikTokScraper(),
        "youtube": YouTubeScraper(),
        "instagram": InstagramScraper(),
        "likee": LikeeScraper(),
        "pinterest": PinterestScraper(),
    }

    ok = 0
    fail = 0
    skipped = 0

    for video_id, platform, url in videos:
        scraper = scrapers.get(platform)
        if not scraper:
            logger.warning("No scraper for platform=%s, skipping", platform)
            skipped += 1
            continue

        m = scraper.scrape_video(str(video_id), url)
        if m and m.is_valid():
            cur.execute(
                """
                INSERT INTO video_metrics (id, video_id, views, likes, comments, shares, saves, scraped_at)
                VALUES (gen_random_uuid(), %s, %s, %s, %s, %s, %s, NOW())
                """,
                (video_id, m.views or 0, m.likes or 0, m.comments or 0, m.shares or 0, m.saves or 0),
            )
            logger.info("OK platform=%s video_id=%s views=%s", platform, video_id, m.views)
            ok += 1
        else:
            logger.warning("FAIL platform=%s video_id=%s url=%s", platform, video_id, url)
            fail += 1

    # Mark state — ok/partial/fail based on outcome so downstream consumers
    # (health endpoint, Telegram alerting) can tell a bad run from a silent
    # failure.
    status = "ok" if fail == 0 else ("partial" if ok > 0 else "fail")
    summary = f"ok={ok} fail={fail} skipped={skipped}"
    now = datetime.now(tz=timezone.utc)
    cur.execute(
        """
        INSERT INTO scraper_state (job_name, last_run_at, last_success_at, last_status, last_message)
        VALUES ('run_daily', %s, CASE WHEN %s = 'ok' THEN %s ELSE NULL END, %s, %s)
        ON CONFLICT (job_name) DO UPDATE SET
          last_run_at = EXCLUDED.last_run_at,
          last_success_at = COALESCE(EXCLUDED.last_success_at, scraper_state.last_success_at),
          last_status = EXCLUDED.last_status,
          last_message = EXCLUDED.last_message
        """,
        (now, status, now, status, summary),
    )

    conn.commit()
    cur.close()
    conn.close()
    logger.info("Done. ok=%d fail=%d skipped=%d", ok, fail, skipped)


if __name__ == "__main__":
    main()
