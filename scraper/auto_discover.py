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
from scraper.config import DATABASE_URL, TIKAPI_KEY, YOUTUBE_API_KEY, HIKERAPI_KEY

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

# Глобальный connect_timeout для всех requests (DNS + TCP handshake)
_DEFAULT_TIMEOUT = (10, 30)  # (connect, read)

WB_ARTICLE_RE = re.compile(r"\b(\d{5,})\b")  # 5+ цифр подряд = артикул WB

# Minimum lookback on a normal daily run — we always look at least 7 days back
# even if the previous run was 10 minutes ago, in case something slipped.
MIN_LOOKBACK_HOURS = 168

# Safety cap so a really old last_success_at does not blow up API quotas.
MAX_LOOKBACK_HOURS = 24 * 30  # 30 days

# Extra buffer added on top of "gap since last success". Prevents off-by-one
# when the previous run finished a few minutes before a new publish.
LOOKBACK_BUFFER_HOURS = 24

# Used as the global default when compute_lookback_hours hasn't been called yet
# (tests, direct imports from run_daily, etc.).
LOOKBACK_HOURS = MIN_LOOKBACK_HOURS

JOB_NAME = "auto_discover"


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
    # Note: Likee is intentionally missing from discovery. Likee's web is
    # fully blocked behind anti-bot (every URL → redirect to /), and the
    # only way to hit their internal API is by numeric uid which the
    # platform does not expose to end users. Manual URL add via the
    # Videos tab is the supported flow for Likee; see docs/likee-research.md.
    cur.execute("""
        SELECT id, user_id, name,
               tiktok_username,
               youtube_channel_id,
               instagram_username,
               pinterest_username
        FROM creators
        WHERE tiktok_username IS NOT NULL
           OR youtube_channel_id IS NOT NULL
           OR instagram_username IS NOT NULL
           OR pinterest_username IS NOT NULL
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
            timeout=_DEFAULT_TIMEOUT,
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
            timeout=_DEFAULT_TIMEOUT,
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
            timeout=_DEFAULT_TIMEOUT,
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

    Пагинация: до 5 страниц по 50 = 250 видео максимум за период. Без
    пагинации мы пропускали свежие публикации у активных креаторов
    (например, у Полины 50 видео за 30 дней, а maxResults=20 без
    pageToken возвращало только верхние 20).
    """
    if not YOUTUBE_API_KEY:
        logger.warning("YOUTUBE_API_KEY не задан, пропускаем YouTube auto-discover")
        return []

    resolved_id = resolve_youtube_channel_id(channel_id)
    if not resolved_id:
        return []
    channel_id = resolved_id

    published_after = since.strftime("%Y-%m-%dT%H:%M:%SZ")
    video_ids: list[str] = []
    page_token: Optional[str] = None

    try:
        for _ in range(5):  # safety cap: 250 videos per creator per run
            params = {
                "channelId": channel_id,
                "part": "id",
                "type": "video",
                "publishedAfter": published_after,
                "maxResults": 50,
                "order": "date",
                "key": YOUTUBE_API_KEY,
            }
            if page_token:
                params["pageToken"] = page_token

            search_resp = requests.get(
                "https://www.googleapis.com/youtube/v3/search",
                params=params,
                timeout=_DEFAULT_TIMEOUT,
            )
            if not search_resp.ok:
                logger.warning("YouTube search status=%d для channel=%s", search_resp.status_code, channel_id)
                break

            payload = search_resp.json()
            for item in payload.get("items", []):
                vid = item.get("id", {}).get("videoId")
                if vid:
                    video_ids.append(vid)

            page_token = payload.get("nextPageToken")
            if not page_token:
                break

        if not video_ids:
            logger.info("YouTube channel=%s: новых видео нет", channel_id)
            return []

        # Step 2: descriptions + publishedAt via videos endpoint, batched 50.
        results: list[dict] = []
        for chunk_start in range(0, len(video_ids), 50):
            chunk = video_ids[chunk_start:chunk_start + 50]
            videos_resp = requests.get(
                "https://www.googleapis.com/youtube/v3/videos",
                params={
                    "id": ",".join(chunk),
                    "part": "snippet",
                    "key": YOUTUBE_API_KEY,
                },
                timeout=_DEFAULT_TIMEOUT,
            )
            if not videos_resp.ok:
                continue

            for v in videos_resp.json().get("items", []):
                snippet = v.get("snippet", {})
                published_str = snippet.get("publishedAt", "")
                try:
                    published_at = datetime.fromisoformat(published_str.replace("Z", "+00:00"))
                except ValueError:
                    continue

                url = f"https://www.youtube.com/watch?v={v['id']}"
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
        return []

    logger.info(
        "YouTube channel=%s: найдено %d видео за последние %dч",
        channel_id, len(results), LOOKBACK_HOURS,
    )
    return results



# ---------------------------------------------------------------------------
# Instagram — список Reels через HikerAPI
# ---------------------------------------------------------------------------

_HIKERAPI_BASE = "https://api.hikerapi.com/v1"
_HIKERAPI_HEADERS_TMPL = {"Accept": "application/json"}


def _hikerapi_get(path: str, params: dict) -> Optional[dict]:
    """Выполняет GET-запрос к api.hikerapi.com с нужными заголовками."""
    headers = {**_HIKERAPI_HEADERS_TMPL, "x-access-key": HIKERAPI_KEY}
    resp = requests.get(
        f"{_HIKERAPI_BASE}{path}",
        params=params,
        headers=headers,
        timeout=_DEFAULT_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()


def get_instagram_user_id(username: str) -> Optional[str]:
    """
    Возвращает числовой pk пользователя Instagram по username.
    Использует GET /v1/user/by/username.
    """
    clean = username.strip().lstrip("@")
    try:
        data = _hikerapi_get("/user/by/username", {"username": clean})
        pk = data.get("pk")
        if pk:
            return str(pk)
        logger.warning("HikerAPI: pk не найден для @%s, ответ: %s", clean, list(data.keys()))
    except Exception as e:
        logger.error("HikerAPI /user/by/username error для @%s: %s", clean, e)
    return None


def _parse_instagram_item(item: dict) -> Optional[dict]:
    """Парсит один медиа-объект из HikerAPI в стандартный dict или None."""
    # Timestamp: taken_at (ISO string) или taken_at_ts (int) или taken_at (int)
    ts_str = item.get("taken_at")
    ts_int = item.get("taken_at_ts")

    published_at = None
    if isinstance(ts_str, str):
        try:
            published_at = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        except ValueError:
            pass
    if published_at is None and ts_int:
        published_at = datetime.fromtimestamp(int(ts_int), tz=timezone.utc)
    if published_at is None and isinstance(ts_str, (int, float)):
        published_at = datetime.fromtimestamp(int(ts_str), tz=timezone.utc)
    if published_at is None:
        return None

    shortcode = item.get("code") or item.get("shortcode")
    if not shortcode:
        return None

    desc = item.get("caption_text") or (item.get("caption") or {}).get("text") or ""
    url = f"https://www.instagram.com/reel/{shortcode}/"

    return {"url": url, "description": desc, "published_at": published_at}


def fetch_instagram_videos(username: str, since: datetime) -> list[dict]:
    """
    Возвращает список {'url', 'description', 'published_at'} за последние LOOKBACK_HOURS.

    Алгоритм:
      1. GET /v1/user/by/username → получаем числовой pk (заодно триггерит refresh кэша)
      2. GET /v1/user/clips?user_id=pk&amount=50 → Reels с пагинацией через /user/clips/chunk
      3. GET /v1/user/medias?user_id=pk → дополнительный источник (другой кэш HikerAPI)

    Примечание по кэшу HikerAPI:
      HikerAPI агрессивно кэширует данные аккаунтов. Если кэш устарел,
      /user/clips может вернуть ролики только до даты последнего обновления кэша.
      Повторный вызов /user/by/username иногда триггерит обновление кэша.

    Правильный base URL: https://api.hikerapi.com/v1
    (старый https://hikerapi.com/api/v1 возвращает 404 на все пути).
    """
    if not HIKERAPI_KEY:
        logger.warning("HIKERAPI_KEY не задан, пропускаем Instagram auto-discover")
        return []

    clean_username = username.strip().lstrip("@")
    seen_codes: set[str] = set()
    results = []

    try:
        # Шаг 1: username → pk (повторный вызов триггерит обновление кэша в HikerAPI)
        user_id = get_instagram_user_id(clean_username)
        if not user_id:
            logger.warning("Instagram: не удалось получить user_id для @%s", clean_username)
            return []

        # Шаг 2: получаем Reels через /user/clips/chunk (рекомендован HikerAPI поддержкой)
        # /user/clips устарел. Реальное время — кэша нет.
        clips_items: list[dict] = []
        try:
            # Основной эндпоинт — chunks, пагинируем по next_max_id
            next_max_id = None
            for _page in range(5):  # max 5 страниц (~250 роликов)
                params: dict = {"user_id": user_id, "amount": 50}
                if next_max_id:
                    params["max_id"] = next_max_id
                chunk = _hikerapi_get("/user/clips/chunk", params)
                if not chunk:
                    break
                if isinstance(chunk, list):
                    # chunk может быть [[item1, item2]] или [item1, item2]
                    for entry in chunk:
                        if isinstance(entry, list):
                            clips_items.extend(entry)
                        elif isinstance(entry, dict):
                            clips_items.append(entry)
                    break
                elif isinstance(chunk, dict):
                    page_items = (
                        chunk.get("items")
                        or chunk.get("response", {}).get("items", [])
                        or []
                    )
                    clips_items.extend(page_items)
                    next_max_id = chunk.get("next_max_id")
                    if not next_max_id or not page_items:
                        break
        except Exception as e:
            logger.debug("Instagram /user/clips/chunk error для @%s: %s", clean_username, e)

        # Запасной вариант: /gql/user/clips (другой эндпоинт от HikerAPI)
        medias_items: list[dict] = []
        if not clips_items:
            try:
                gql_data = _hikerapi_get("/gql/user/clips", {"user_id": user_id, "amount": 50})
                if isinstance(gql_data, list):
                    medias_items = gql_data
                elif isinstance(gql_data, dict):
                    medias_items = (
                        gql_data.get("items")
                        or gql_data.get("edges", [])
                        or []
                    )
                    # GraphQL может возвращать edges с node внутри
                    if medias_items and isinstance(medias_items[0], dict) and "node" in medias_items[0]:
                        medias_items = [e["node"] for e in medias_items]
            except Exception as e:
                logger.debug("Instagram /gql/user/clips error для @%s: %s", clean_username, e)

        # Объединяем — clips приоритет (содержат play_count), medias как дополнение
        for item in clips_items + medias_items:
            parsed = _parse_instagram_item(item)
            if not parsed:
                continue
            # Дедупликация по shortcode
            shortcode = item.get("code") or item.get("shortcode")
            if shortcode in seen_codes:
                continue
            seen_codes.add(shortcode)

            if parsed["published_at"] < since:
                continue

            results.append(parsed)

    except Exception as e:
        logger.error("Ошибка при запросе HikerAPI для @%s: %s", clean_username, e)

    logger.info(
        "Instagram @%s: найдено %d видео за последние %dч (clips=%d, medias=%d)",
        clean_username, len(results), LOOKBACK_HOURS,
        len([r for r in results if r.get("url", "").startswith("https://www.instagram.com/reel")]),
        0,  # placeholder
    )
    return results


# ---------------------------------------------------------------------------
# Pinterest — через публичный RSS фид профиля
# ---------------------------------------------------------------------------

_PINTEREST_RSS_URL = "https://www.pinterest.com/{username}/feed.rss"

_PINTEREST_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
}


def fetch_pinterest_videos(username: str, since: datetime) -> list[dict]:
    """
    Возвращает список {'url', 'description', 'published_at'} за последние LOOKBACK_HOURS.

    Pinterest публикует RSS для каждого публичного профиля по адресу
    pinterest.com/{username}/feed.rss. RSS содержит последние ~25 пинов с
    title/description/link/pubDate — достаточно для auto-discover. Метрики
    (saves/views) уже собираются отдельно через PinterestScraper в run_daily.
    """
    import xml.etree.ElementTree as ET

    clean = username.strip().lstrip("@").strip("/")
    url = _PINTEREST_RSS_URL.format(username=clean)

    try:
        resp = requests.get(url, headers=_PINTEREST_HEADERS, timeout=_DEFAULT_TIMEOUT)
    except Exception as e:
        logger.warning("Pinterest @%s: ошибка запроса RSS: %s", clean, e)
        return []

    if not resp.ok:
        logger.warning("Pinterest @%s: RSS статус %d", clean, resp.status_code)
        return []

    try:
        root = ET.fromstring(resp.content)
    except ET.ParseError as e:
        logger.warning("Pinterest @%s: невалидный XML: %s", clean, e)
        return []

    results = []
    for item in root.findall("./channel/item"):
        link_el = item.find("link")
        pubdate_el = item.find("pubDate")
        title_el = item.find("title")
        desc_el = item.find("description")
        if link_el is None or pubdate_el is None:
            continue

        pin_url = (link_el.text or "").strip()
        if not pin_url:
            continue

        # RFC 822 date parse
        try:
            from email.utils import parsedate_to_datetime
            published_at = parsedate_to_datetime(pubdate_el.text or "")
            if published_at.tzinfo is None:
                published_at = published_at.replace(tzinfo=timezone.utc)
        except Exception:
            continue

        if published_at < since:
            continue

        title = (title_el.text or "") if title_el is not None else ""
        desc = (desc_el.text or "") if desc_el is not None else ""
        combined = f"{title} {desc}".strip()

        results.append({
            "url": pin_url,
            "description": combined,
            "published_at": published_at,
        })

    logger.info(
        "Pinterest @%s: найдено %d пинов за последние %dч",
        clean, len(results), LOOKBACK_HOURS,
    )
    return results


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def _get_scraper_state(cur, job_name: str) -> Optional[datetime]:
    """Return last_success_at for a job, or None if never succeeded."""
    cur.execute(
        "SELECT last_success_at FROM scraper_state WHERE job_name = %s",
        (job_name,),
    )
    row = cur.fetchone()
    if not row or not row[0]:
        return None
    return row[0]


def _upsert_scraper_state(cur, job_name: str, status: str, message: str) -> None:
    """Record a run outcome. Updates last_success_at only on status='ok'."""
    now = datetime.now(tz=timezone.utc)
    cur.execute(
        """
        INSERT INTO scraper_state (job_name, last_run_at, last_success_at, last_status, last_message)
        VALUES (%s, %s, CASE WHEN %s = 'ok' THEN %s ELSE NULL END, %s, %s)
        ON CONFLICT (job_name) DO UPDATE SET
          last_run_at = EXCLUDED.last_run_at,
          last_success_at = COALESCE(EXCLUDED.last_success_at, scraper_state.last_success_at),
          last_status = EXCLUDED.last_status,
          last_message = EXCLUDED.last_message
        """,
        (job_name, now, status, now, status, message),
    )


def compute_lookback_hours(cur) -> int:
    """
    Self-healing lookback:

      lookback = clamp(
        gap_since_last_success + buffer,
        MIN_LOOKBACK_HOURS,
        MAX_LOOKBACK_HOURS,
      )

    If the scraper was down for 3 days, the next run uses ≈ 3d + 24h buffer so
    nothing slips through. On a healthy daily cadence gap is ~24h and we fall
    back to the minimum 168h (7 days) so a single bad day still doesn't cost
    us anything.
    """
    global LOOKBACK_HOURS
    last_success = _get_scraper_state(cur, JOB_NAME)
    if not last_success:
        logger.info("Нет истории запусков, использую MIN_LOOKBACK_HOURS=%d", MIN_LOOKBACK_HOURS)
        LOOKBACK_HOURS = MIN_LOOKBACK_HOURS
        return MIN_LOOKBACK_HOURS

    gap_hours = int((datetime.now(tz=timezone.utc) - last_success).total_seconds() / 3600)
    candidate = gap_hours + LOOKBACK_BUFFER_HOURS
    clamped = max(MIN_LOOKBACK_HOURS, min(candidate, MAX_LOOKBACK_HOURS))

    if clamped > MIN_LOOKBACK_HOURS:
        logger.info(
            "Последний успех %s назад (%dч). Lookback %dч (min=%d, max=%d).",
            last_success.strftime("%Y-%m-%d %H:%M"),
            gap_hours, clamped, MIN_LOOKBACK_HOURS, MAX_LOOKBACK_HOURS,
        )
    else:
        logger.info("Последний успех %dч назад, использую MIN_LOOKBACK_HOURS=%d", gap_hours, MIN_LOOKBACK_HOURS)

    LOOKBACK_HOURS = clamped
    return clamped


def main():
    conn = _conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    lookback_hours = compute_lookback_hours(cur)
    since = datetime.now(tz=timezone.utc) - timedelta(hours=lookback_hours)
    logger.info("Auto-discover: ищем видео с %s", since.isoformat())

    creators = get_creators(cur)
    if not creators:
        logger.info("Нет креаторов с заданными аккаунтами. Добавь tiktok_username / youtube_channel_id / instagram_username в настройках.")
        _upsert_scraper_state(cur, JOB_NAME, "ok", "no creators configured")
        conn.commit()
        cur.close()
        conn.close()
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

        if creator["instagram_username"]:
            vids = fetch_instagram_videos(creator["instagram_username"], since)
            for v in vids:
                v["platform"] = "instagram"
            candidate_videos.extend(vids)

        if creator.get("pinterest_username"):
            vids = fetch_pinterest_videos(creator["pinterest_username"], since)
            for v in vids:
                v["platform"] = "pinterest"
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

    summary = (
        f"added={total_added} skipped_no_article={total_skipped_no_article} "
        f"skipped_exists={total_skipped_exists} lookback={lookback_hours}h"
    )
    _upsert_scraper_state(cur, JOB_NAME, "ok", summary)
    conn.commit()
    cur.close()
    conn.close()

    logger.info(
        "Готово. Добавлено: %d | Без артикула: %d | Уже были: %d",
        total_added, total_skipped_no_article, total_skipped_exists,
    )


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--lookback", type=int, default=LOOKBACK_HOURS,
                        help=f"Hours to look back (default: {LOOKBACK_HOURS})")
    args, _ = parser.parse_known_args()
    LOOKBACK_HOURS = args.lookback
    main()
