"""
Работа с PostgreSQL: чтение роликов и запись метрик.
"""
import logging
from typing import List, Optional
from urllib.parse import urlparse

import psycopg2
import psycopg2.extras

from . import config
from .models import VideoContent, VideoMetric

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


def update_video_metadata(content: VideoContent) -> bool:
    """
    Fills content metadata columns on the videos row — only when still NULL.
    Safe to call on every scrape: the WHERE title IS NULL guard prevents
    redundant writes after the first successful capture.
    Returns True if a row was updated.
    """
    if not content.has_data():
        return False

    conn: Optional[psycopg2.extensions.connection] = None
    try:
        conn = _get_connection()
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE videos SET
                  title            = COALESCE(title, %s),
                  duration_sec     = COALESCE(duration_sec, %s),
                  music_title      = COALESCE(music_title, %s),
                  music_author     = COALESCE(music_author, %s),
                  music_is_original = COALESCE(music_is_original, %s),
                  hashtags         = COALESCE(hashtags, %s),
                  cover_url        = COALESCE(cover_url, %s)
                WHERE id = %s AND title IS NULL
                """,
                (
                    content.title,
                    content.duration_sec,
                    content.music_title,
                    content.music_author,
                    content.music_is_original,
                    content.hashtags_str(),
                    content.cover_url,
                    content.video_id,
                ),
            )
            updated = cur.rowcount > 0
        conn.commit()
        if updated:
            logger.debug("Saved content metadata for video_id=%s", content.video_id)
        return updated
    except psycopg2.Error as exc:
        logger.error("DB error saving metadata for video_id=%s: %s", content.video_id, exc)
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()


def get_creator_videos_for_analysis(
    creator_id: str,
    days: int = 60,
    top_n: int = 20,
    avg_n: int = 20,
) -> dict:
    """
    Returns two video lists for pattern analysis (TRU-310):
    - 'top': top_n videos by peak views in the last `days` days
    - 'avg': avg_n videos from the middle of the views distribution

    Each item: {url, platform, published_at, peak_views, peak_likes,
                peak_shares, peak_saves, peak_comments, er_pct,
                title, duration_sec, hashtags, music_title}
    """
    conn: Optional[psycopg2.extensions.connection] = None
    try:
        conn = _get_connection()
        with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
            cur.execute(
                """
                WITH ranked AS (
                  SELECT
                    v.id,
                    v.url,
                    v.platform,
                    v.published_at,
                    v.title,
                    v.duration_sec,
                    v.hashtags,
                    v.music_title,
                    MAX(vm.views)    AS peak_views,
                    MAX(vm.likes)    AS peak_likes,
                    MAX(vm.shares)   AS peak_shares,
                    MAX(vm.saves)    AS peak_saves,
                    MAX(vm.comments) AS peak_comments,
                    NTILE(4) OVER (ORDER BY MAX(vm.views) DESC) AS quartile
                  FROM videos v
                  JOIN video_metrics vm ON vm.video_id = v.id
                  WHERE v.creator_id = %s
                    AND v.published_at >= NOW() - INTERVAL '1 day' * %s
                    AND v.fail_streak < 3
                  GROUP BY v.id, v.url, v.platform, v.published_at,
                           v.title, v.duration_sec, v.hashtags, v.music_title
                )
                SELECT
                  *,
                  ROUND(
                    CAST(peak_likes + peak_comments + peak_shares + peak_saves AS NUMERIC)
                    / NULLIF(peak_views, 0) * 100, 2
                  ) AS er_pct
                FROM ranked
                ORDER BY peak_views DESC
                """,
                (creator_id, days),
            )
            rows = [dict(r) for r in cur.fetchall()]

        top = [r for r in rows if r["quartile"] == 1][:top_n]
        avg = [r for r in rows if r["quartile"] in (2, 3)][:avg_n]
        return {"top": top, "avg": avg, "total_in_window": len(rows)}
    except psycopg2.Error as exc:
        logger.error("DB error in get_creator_videos_for_analysis: %s", exc)
        raise
    finally:
        if conn:
            conn.close()
