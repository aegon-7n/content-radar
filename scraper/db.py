"""
Работа с PostgreSQL: чтение роликов и запись метрик.
"""
import logging
from typing import Optional
from urllib.parse import urlparse

import psycopg2
import psycopg2.extras

from . import config
from .models import VideoMetric

logger = logging.getLogger(__name__)


def _get_connection() -> psycopg2.extensions.connection:
    """
    Создаёт новое соединение с PostgreSQL через DATABASE_URL.

    Формат URL: postgresql://user:password@host:port/dbname
    или          postgres://user:password@host:port/dbname
    """
    parsed = urlparse(config.DATABASE_URL)

    # Supabase и Neon используют схему "postgres://", psycopg2 принимает оба варианта
    conn = psycopg2.connect(
        host=parsed.hostname,
        port=parsed.port or 5432,
        dbname=parsed.path.lstrip("/"),
        user=parsed.username,
        password=parsed.password,
        sslmode="prefer",
        connect_timeout=10,
    )
    return conn


def get_videos_by_platform(platform: str) -> list[dict]:
    """
    Возвращает список роликов для указанной платформы.

    Возвращает: [{"id": UUID str, "url": str}, ...]
    Платформа должна совпадать с enum из таблицы videos:
      tiktok | youtube | instagram | likee | pinterest
    """
    conn: Optional[psycopg2.extensions.connection] = None
    try:
        conn = _get_connection()
        with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
            cur.execute(
                "SELECT id::text, url FROM videos WHERE platform = %s ORDER BY created_at",
                (platform,),
            )
            rows = cur.fetchall()
            videos = [{"id": str(row["id"]), "url": row["url"]} for row in rows]
            logger.debug("Loaded %d videos for platform '%s'", len(videos), platform)
            return videos
    except psycopg2.Error as exc:
        logger.error("DB error loading videos for platform '%s': %s", platform, exc)
        raise
    finally:
        if conn:
            conn.close()


def save_metric(metric: VideoMetric) -> None:
    """
    Вставляет одну запись в video_metrics.
    Не вставляет невалидные метрики (views is None).
    """
    if not metric.is_valid():
        logger.warning(
            "Skipping invalid metric for video_id=%s (views is None)", metric.video_id
        )
        return

    conn: Optional[psycopg2.extensions.connection] = None
    try:
        conn = _get_connection()
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO video_metrics (video_id, views, likes, comments, shares, saves, scraped_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    metric.video_id,
                    metric.views or 0,
                    metric.likes or 0,
                    metric.comments or 0,
                    metric.shares or 0,
                    metric.saves or 0,
                    metric.scraped_at,
                ),
            )
        conn.commit()
        logger.debug("Saved metric for video_id=%s", metric.video_id)
    except psycopg2.Error as exc:
        logger.error("DB error saving metric for video_id=%s: %s", metric.video_id, exc)
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()


def save_metrics_batch(metrics: list[VideoMetric]) -> int:
    """
    Batch INSERT для списка метрик. Возвращает количество успешно сохранённых.

    Пропускает невалидные метрики (views is None).
    Использует один коннект и одну транзакцию для эффективности.
    """
    valid_metrics = [m for m in metrics if m.is_valid()]
    skipped = len(metrics) - len(valid_metrics)

    if skipped:
        logger.warning("Skipping %d invalid metrics (views is None) in batch", skipped)

    if not valid_metrics:
        logger.info("No valid metrics to save in batch")
        return 0

    rows = [
        (
            m.video_id,
            m.views or 0,
            m.likes or 0,
            m.comments or 0,
            m.shares or 0,
            m.saves or 0,
            m.scraped_at,
        )
        for m in valid_metrics
    ]

    conn: Optional[psycopg2.extensions.connection] = None
    try:
        conn = _get_connection()
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(
                cur,
                """
                INSERT INTO video_metrics (video_id, views, likes, comments, shares, saves, scraped_at)
                VALUES %s
                """,
                rows,
            )
        conn.commit()
        logger.info("Batch saved %d metrics", len(valid_metrics))
        return len(valid_metrics)
    except psycopg2.Error as exc:
        logger.error("DB error during batch save: %s", exc)
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()
