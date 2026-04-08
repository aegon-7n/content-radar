#!/usr/bin/env python3
"""
ContentRadar — точка входа скрапера метрик роликов.

Запускает парсеры для всех (или указанной) платформ:
  1. Читает список роликов из PostgreSQL (таблица videos)
  2. Для каждой платформы запускает соответствующий скрапер
  3. Сохраняет результаты в video_metrics
  4. Логирует итоги: обработано, успешно, ошибок, время выполнения

Использование:
  python main.py                          # все платформы
  python main.py --platform tiktok        # только TikTok
  python main.py --platform youtube,instagram  # несколько платформ
  python main.py --dry-run                # не писать в БД, только логировать
"""

import argparse
import logging
import sys
import time
from datetime import datetime, timezone
from typing import Optional

# Настройка логирования до импорта модулей проекта,
# чтобы все дочерние логгеры подхватили конфигурацию
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("scraper.log", encoding="utf-8"),
    ],
)

logger = logging.getLogger("contentradar.main")

# Импорт модулей проекта после настройки логирования
from scraper import db  # noqa: E402
from scraper.scrapers.tiktok import TikTokScraper  # noqa: E402
from scraper.scrapers.youtube import YouTubeScraper  # noqa: E402
from scraper.scrapers.instagram import InstagramScraper  # noqa: E402
from scraper.scrapers.likee import LikeeScraper  # noqa: E402
from scraper.scrapers.pinterest import PinterestScraper  # noqa: E402

# Реестр скраперов по имени платформы
SCRAPERS = {
    "tiktok": TikTokScraper,
    "youtube": YouTubeScraper,
    "instagram": InstagramScraper,
    "likee": LikeeScraper,
    "pinterest": PinterestScraper,
}

# Порядок обработки платформ (от приоритетной к менее приоритетной)
PLATFORM_ORDER = ["tiktok", "youtube", "instagram", "likee", "pinterest"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="ContentRadar — сбор метрик роликов из соцсетей"
    )
    parser.add_argument(
        "--platform",
        type=str,
        default=None,
        help=(
            "Платформы через запятую: tiktok,youtube,instagram,likee,pinterest. "
            "По умолчанию — все платформы."
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=False,
        help="Не записывать результаты в БД. Только логировать.",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        default=False,
        help="Включить DEBUG-уровень логирования.",
    )
    return parser.parse_args()


def get_platforms(platform_arg: Optional[str]) -> list[str]:
    """
    Возвращает список платформ для обработки.
    Если platform_arg=None — все платформы в стандартном порядке.
    """
    if not platform_arg:
        return PLATFORM_ORDER

    requested = [p.strip().lower() for p in platform_arg.split(",")]
    unknown = [p for p in requested if p not in SCRAPERS]
    if unknown:
        logger.error(
            "Unknown platforms: %s. Available: %s",
            unknown,
            list(SCRAPERS.keys()),
        )
        sys.exit(1)

    # Сохраняем порядок приоритета
    return [p for p in PLATFORM_ORDER if p in requested]


def run_platform(platform: str, dry_run: bool) -> dict:
    """
    Запускает скрапер для одной платформы.

    Возвращает словарь со статистикой:
      {platform, total, success, errors, duration_sec}
    """
    start = time.monotonic()
    scraper_cls = SCRAPERS[platform]
    scraper = scraper_cls()

    logger.info("=== Platform: %s ===", platform.upper())

    # Получаем ролики из БД
    try:
        videos = db.get_videos_by_platform(platform)
    except Exception as exc:
        logger.error("Cannot load videos for platform '%s': %s", platform, exc)
        return {
            "platform": platform,
            "total": 0,
            "success": 0,
            "errors": 1,
            "duration_sec": time.monotonic() - start,
        }

    if not videos:
        logger.info("No videos found for platform '%s', skipping", platform)
        return {
            "platform": platform,
            "total": 0,
            "success": 0,
            "errors": 0,
            "duration_sec": time.monotonic() - start,
        }

    logger.info("Found %d videos for platform '%s'", len(videos), platform)

    # Запускаем скрапер
    metrics = scraper.scrape_all(videos)

    # Сохраняем в БД
    saved = 0
    if not dry_run and metrics:
        try:
            saved = db.save_metrics_batch(metrics)
        except Exception as exc:
            logger.error(
                "Failed to save metrics for platform '%s': %s", platform, exc
            )
            # Пробуем сохранить по одной записи
            for metric in metrics:
                try:
                    db.save_metric(metric)
                    saved += 1
                except Exception as single_exc:
                    logger.error(
                        "Failed to save single metric video_id=%s: %s",
                        metric.video_id,
                        single_exc,
                    )
    elif dry_run:
        saved = len(metrics)
        logger.info(
            "[DRY RUN] Would save %d metrics for platform '%s'", saved, platform
        )

    duration = time.monotonic() - start
    errors = len(videos) - len(metrics)

    return {
        "platform": platform,
        "total": len(videos),
        "success": saved,
        "errors": errors,
        "duration_sec": duration,
    }


def print_summary(stats_list: list[dict], total_duration: float, dry_run: bool) -> None:
    """Выводит итоговую таблицу в лог."""
    logger.info("")
    logger.info("=" * 60)
    logger.info("SCRAPING SUMMARY%s", " [DRY RUN]" if dry_run else "")
    logger.info("=" * 60)
    logger.info("%-15s %8s %8s %8s %10s", "Platform", "Total", "Success", "Errors", "Time (s)")
    logger.info("-" * 60)

    total_videos = 0
    total_success = 0
    total_errors = 0

    for s in stats_list:
        logger.info(
            "%-15s %8d %8d %8d %10.1f",
            s["platform"],
            s["total"],
            s["success"],
            s["errors"],
            s["duration_sec"],
        )
        total_videos += s["total"]
        total_success += s["success"]
        total_errors += s["errors"]

    logger.info("-" * 60)
    logger.info(
        "%-15s %8d %8d %8d %10.1f",
        "TOTAL",
        total_videos,
        total_success,
        total_errors,
        total_duration,
    )
    logger.info("=" * 60)


def main() -> int:
    args = parse_args()

    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)

    run_start = time.monotonic()
    run_ts = datetime.now(timezone.utc).isoformat()

    logger.info("ContentRadar scraper started at %s", run_ts)
    if args.dry_run:
        logger.info("DRY RUN mode — results will NOT be written to DB")

    platforms = get_platforms(args.platform)
    logger.info("Platforms to process: %s", platforms)

    stats_list = []
    for platform in platforms:
        platform_stats = run_platform(platform, dry_run=args.dry_run)
        stats_list.append(platform_stats)

    total_duration = time.monotonic() - run_start
    print_summary(stats_list, total_duration, dry_run=args.dry_run)

    logger.info("Scraper finished. Total time: %.1fs", total_duration)

    # Возвращаем ненулевой код если были ошибки (для мониторинга cron)
    total_errors = sum(s["errors"] for s in stats_list)
    return 1 if total_errors > 0 else 0


if __name__ == "__main__":
    sys.exit(main())
