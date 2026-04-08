"""
Авто-обнаружение новых видео по аккаунтам креаторов.

Алгоритм:
  1. Берём всех креаторов у которых задан tiktok_username или youtube_channel_id
  2. Смотрим видео за последние 48ч (с запасом)
  3. Из description извлекаем артикул WB (любые 5+ цифр подряд)
  4. Если артикул не найден — пропускаем ролик
  5. Ищем товар с таким артикулом в БД:
     - Нашли → используем
     - Не нашли → создаём с name="Артикул XXXXXXX" и needs_review=1
  6. Если видео уже есть в БД — пропускаем (дедупликация по URL)
  7. Добавляем видео в БД — скрапер подхватит его при следующем запуске
"""

import logging
import re
import sys
import os
from datetime import datetime, timezone, timedelta
from typing import Optional
from urllib.parse import urlparse

import psycopg2
import psycopg2.extras
import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from scraper.config import DATABASE_URL, TIKAPI_KEY, YOUTUBE_API_KEY

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

WB_ARTICLE_RE = re.compile(r"\b(\d{6,})\b")  # 6+ цифр подряд = артикул WB
LOOKBACK_HOURS = 48  # смотрим назад с запасом


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

def _conn():
    parsed = urlparse(DATABASE_URL)
    return psycopg2.connect(
        host=parsed.hostname,
        port=parsed.port or 5432,
        dbname=parsed.path.lstrip("/"),
        user=parsed.username,
        password=parsed.password,
        sslmode="prefer",
        connect_timeout=10,
    )


def get_creators(cur) -> list[dict]:
    cur.execute("""
        SELECT id, user_id, name, tiktok_username, youtube_channel_id
        FROM creators
        WHERE tiktok_username IS NOT NULL OR youtube_channel_id IS NOT NULL
    """)
    return [dict(r) for r in cur.fetchall()]


def url_exists(cur, url: str) -> bool:
    cur.execute("SELECT 1 FROM videos WHERE url = %s LIMIT 1", (url,))
    return cur.fetchone() is not None


def get_or_create_product(cur, user_id: str, wb_article: str) -> Optional[str]:
    """Возвращает product_id. Создаёт товар с needs_review=1 если не найден."""
    cur.execute(
        "SELECT id FROM products WHERE wb_article = %s AND user_id = %s LIMIT 1",
        (wb_article, user_id),
    )
    row = cur.fetchone()
    if row:
        return str(row[0])

    # Создаём новый товар-заглушку
    cur.execute(
        """
        INSERT INTO products (id, user_id, name, wb_article, needs_review, created_at)
        VALUES (gen_random_uuid(), %s, %s, %s, 1, NOW())
        RETURNING id
        """,
        (user_id, f"Артикул {wb_article}", wb_article),
    )
    new_id = str(cur.fetchone()[0])
    logger.info("  Создан новый товар: артикул=%s id=%s (needs_review)", wb_article, new_id)
    return new_id


def insert_video(cur, user_id, creator_id, product_id, platform, url, published_at):
    cur.execute(
        """
        INSERT INTO videos (id, user_id, creator_id, product_id, platform, url, published_at, created_at)
        VALUES (gen_random_uuid(), %s, %s, %s, %s, %s, %s, NOW())
        """,
        (user_id, creator_id, product_id, platform, url, published_at),
    )


# ---------------------------------------------------------------------------
# Артикул WB из текста
# ---------------------------------------------------------------------------

def extract_wb_article(text: str) -> Optional[str]:
    """Ищет первое вхождение 6+ цифр подряд."""
    if not text:
        return None
    match = WB_ARTICLE_RE.search(text)
    return match.group(1) if match else None


# ---------------------------------------------------------------------------
# TikTok — список видео аккаунта через TikAPI
# ---------------------------------------------------------------------------

def get_tiktok_sec_uid(username: str) -> Optional[str]:
    """Получает secUid по username через /public/check."""
    try:
        resp = requests.get(
            "https://api.tikapi.io/public/check",
            params={"username": username},
            headers={"X-API-KEY": TIKAPI_KEY},
            timeout=15,
        )
        if not resp.ok:
            return None
        user = resp.json().get("userInfo", {}).get("user", {})
        return user.get("secUid")
    except Exception as e:
        logger.error("TikAPI /check error для @%s: %s", username, e)
        return None


def fetch_tiktok_videos(username: str, since: datetime) -> list[dict]:
    """
    Возвращает список {'url', 'description', 'published_at'} за последние LOOKBACK_HOURS.
    """
    if not TIKAPI_KEY:
        logger.warning("TIKAPI_KEY не задан, пропускаем TikTok auto-discover")
        return []

    clean_username = username.strip().lstrip("@")
    results = []

    try:
        # Шаг 1: получаем secUid
        sec_uid = get_tiktok_sec_uid(clean_username)
        if not sec_uid:
            logger.warning("TikTok: не удалось получить secUid для @%s", clean_username)
            return []

        # Шаг 2: получаем посты по secUid
        resp = requests.get(
            "https://api.tikapi.io/public/posts",
            params={"secUid": sec_uid, "count": 30},
            headers={"X-API-KEY": TIKAPI_KEY, "Accept": "application/json"},
            timeout=20,
        )
        if not resp.ok:
            logger.warning("TikAPI posts status=%d для @%s", resp.status_code, clean_username)
            return []

        items = resp.json().get("itemList") or []

        for item in items:
            create_time = item.get("createTime", 0)
            published_at = datetime.fromtimestamp(create_time, tz=timezone.utc)

            if published_at < since:
                continue

            video_id = item.get("id") or item.get("video", {}).get("id")
            if not video_id:
                continue

            url = f"https://www.tiktok.com/@{clean_username}/video/{video_id}"
            desc = item.get("desc", "")

            results.append({
                "url": url,
                "description": desc,
                "published_at": published_at,
            })

    except Exception as e:
        logger.error("Ошибка при запросе TikAPI для @%s: %s", clean_username, e)

    logger.info("TikTok @%s: найдено %d видео за последние %dч", clean_username, len(results), LOOKBACK_HOURS)
    return results


# ---------------------------------------------------------------------------
# YouTube — список видео канала через Data API v3
# ---------------------------------------------------------------------------

def resolve_youtube_channel_id(handle_or_id: str) -> Optional[str]:
    """
    Принимает @handle или UCxxxxx.
    Если handle — резолвит в channel ID через YouTube API.
    """
    if handle_or_id.startswith("UC"):
        return handle_or_id  # уже channel ID

    handle = handle_or_id.lstrip("@")
    try:
        resp = requests.get(
            "https://www.googleapis.com/youtube/v3/channels",
            params={"forHandle": handle, "part": "id", "key": YOUTUBE_API_KEY},
            timeout=10,
        )
        items = resp.json().get("items", [])
        if items:
            channel_id = items[0]["id"]
            logger.info("YouTube @%s → channel_id=%s", handle, channel_id)
            return channel_id
        logger.warning("YouTube: не удалось найти канал для @%s", handle)
    except Exception as e:
        logger.error("YouTube resolve handle error: %s", e)
    return None


def fetch_youtube_videos(channel_id: str, since: datetime) -> list[dict]:
    """
    Возвращает список {'url', 'description', 'published_at'}.
    Принимает channel ID или @handle — резолвит автоматически.
    """
    if not YOUTUBE_API_KEY:
        logger.warning("YOUTUBE_API_KEY не задан, пропускаем YouTube auto-discover")
        return []

    # Резолвим handle в channel ID если нужно
    resolved_id = resolve_youtube_channel_id(channel_id)
    if not resolved_id:
        return []
    channel_id = resolved_id

    results = []
    published_after = since.strftime("%Y-%m-%dT%H:%M:%SZ")

    try:
        # Шаг 1: получаем список video_id через search
        search_resp = requests.get(
            "https://www.googleapis.com/youtube/v3/search",
            params={
                "channelId": channel_id,
                "part": "id",
                "type": "video",
                "publishedAfter": published_after,
                "maxResults": 20,
                "order": "date",
                "key": YOUTUBE_API_KEY,
            },
            timeout=15,
        )
        if not search_resp.ok:
            logger.warning("YouTube search status=%d для channel=%s", search_resp.status_code, channel_id)
            return []

        items = search_resp.json().get("items", [])
        if not items:
            logger.info("YouTube channel=%s: новых видео нет", channel_id)
            return []

        video_ids = [i["id"]["videoId"] for i in items if i.get("id", {}).get("videoId")]

        # Шаг 2: берём description и publishedAt через videos API
        videos_resp = requests.get(
            "https://www.googleapis.com/youtube/v3/videos",
            params={
                "id": ",".join(video_ids),
                "part": "snippet",
                "key": YOUTUBE_API_KEY,
            },
            timeout=15,
        )
        if not videos_resp.ok:
            return []

        for v in videos_resp.json().get("items", []):
            snippet = v.get("snippet", {})
            published_str = snippet.get("publishedAt", "")
            try:
                published_at = datetime.fromisoformat(published_str.replace("Z", "+00:00"))
            except ValueError:
                continue

            url = f"https://www.youtube.com/watch?v={v['id']}"
            # Артикул может быть в title (Shorts часто пустой description)
            title = snippet.get("title", "")
            desc = snippet.get("description", "")
            combined_text = f"{title} {desc}"

            results.append({
                "url": url,
                "description": combined_text,
                "published_at": published_at,
            })

    except Exception as e:
        logger.error("Ошибка при запросе YouTube API для channel=%s: %s", channel_id, e)

    logger.info("YouTube channel=%s: найдено %d видео за последние %dч", channel_id, len(results), LOOKBACK_HOURS)
    return results


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    since = datetime.now(tz=timezone.utc) - timedelta(hours=LOOKBACK_HOURS)
    logger.info("Auto-discover: ищем видео с %s", since.isoformat())

    conn = _conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    creators = get_creators(cur)
    if not creators:
        logger.info("Нет креаторов с заданными аккаунтами. Добавь tiktok_username / youtube_channel_id в настройках.")
        return

    logger.info("Найдено %d креаторов с аккаунтами", len(creators))

    total_added = 0
    total_skipped_no_article = 0
    total_skipped_exists = 0

    for creator in creators:
        creator_id = str(creator["id"])
        user_id = str(creator["user_id"])
        name = creator["name"]
        logger.info("--- Креатор: %s ---", name)

        candidate_videos = []

        if creator["tiktok_username"]:
            vids = fetch_tiktok_videos(creator["tiktok_username"], since)
            for v in vids:
                v["platform"] = "tiktok"
            candidate_videos.extend(vids)

        if creator["youtube_channel_id"]:
            vids = fetch_youtube_videos(creator["youtube_channel_id"], since)
            for v in vids:
                v["platform"] = "youtube"
            candidate_videos.extend(vids)

        for v in candidate_videos:
            url = v["url"]

            # Дедупликация
            if url_exists(cur, url):
                total_skipped_exists += 1
                continue

            # Извлекаем артикул
            article = extract_wb_article(v["description"])
            if not article:
                logger.debug("  Пропускаем (нет артикула): %s", url)
                total_skipped_no_article += 1
                continue

            # Получаем/создаём товар
            product_id = get_or_create_product(cur, user_id, article)
            if not product_id:
                continue

            # Добавляем видео
            insert_video(cur, user_id, creator_id, product_id, v["platform"], url, v["published_at"])
            logger.info("  + Добавлено: %s | артикул=%s | %s", v["platform"], article, url[:60])
            total_added += 1

    conn.commit()
    cur.close()
    conn.close()

    logger.info(
        "Готово. Добавлено: %d | Без артикула: %d | Уже были: %d",
        total_added, total_skipped_no_article, total_skipped_exists,
    )


if __name__ == "__main__":
    main()
