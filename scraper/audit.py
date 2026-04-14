"""
Per-creator coverage audit.

For each creator/platform, asks the source platform "how many videos in the
last 30 days?" and compares with what's in our DB. Logs:

  INFO  ✓        — counts agree (or DB has more, which means our pagination
                   already pulled history beyond the platform's first page).
  WARNING  GAP   — the platform reports more than we have. Difference > 0
                   means auto_discover is missing something, even when run
                   right now would not catch it (cron lookback may be too
                   short, or there's a code bug).
  ERROR   FAIL   — could not reach the platform API at all.

Run on prod via cron once per day after auto_discover finishes:

    30 21 * * * root cd /root/content-radar && env $(cat /etc/cron.d/content-radar | grep -oP "[A-Z_]+='[^']+'") /root/content-radar/scraper/venv/bin/python -m scraper.audit >> /var/log/content-radar/audit.log 2>&1
"""

import logging
import os
import sys
from datetime import datetime, timezone, timedelta
from typing import Optional
from urllib.parse import urlparse

import psycopg2
import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from scraper.config import DATABASE_URL, TIKAPI_KEY, YOUTUBE_API_KEY, HIKERAPI_KEY

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

LOOKBACK_DAYS = 30
TIMEOUT = (10, 30)
GAP_WARN_THRESHOLD = 1  # warn if platform − DB ≥ N


def _conn():
    p = urlparse(DATABASE_URL)
    return psycopg2.connect(
        host=p.hostname, port=p.port or 5432,
        dbname=p.path.lstrip("/"), user=p.username, password=p.password,
        sslmode="prefer", connect_timeout=10,
    )


def db_counts(creator_id: str) -> dict[str, int]:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS)).isoformat()
    with _conn() as c, c.cursor() as cur:
        cur.execute(
            """
            SELECT platform, COUNT(*) FROM videos
            WHERE creator_id = %s AND published_at >= %s
            GROUP BY platform
            """,
            (creator_id, cutoff),
        )
        return dict(cur.fetchall())


# ── platforms ────────────────────────────────────────────────────────────
def tiktok_count(username: Optional[str]) -> Optional[int] | str:
    if not username:
        return None
    try:
        r = requests.get(
            "https://api.tikapi.io/public/check",
            params={"username": username},
            headers={"X-API-KEY": TIKAPI_KEY},
            timeout=TIMEOUT,
        )
        if not r.ok:
            return f"check {r.status_code}"
        sec_uid = r.json().get("userInfo", {}).get("user", {}).get("secUid")
        if not sec_uid:
            return "no secUid"

        r = requests.get(
            "https://api.tikapi.io/public/posts",
            params={"secUid": sec_uid, "count": 35},
            headers={"X-API-KEY": TIKAPI_KEY, "Accept": "application/json"},
            timeout=TIMEOUT,
        )
        if not r.ok:
            return f"posts {r.status_code}"
        items = r.json().get("itemList", [])
        cutoff = datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS)
        return sum(
            1 for it in items
            if datetime.fromtimestamp(it.get("createTime", 0), tz=timezone.utc) >= cutoff
        )
    except Exception as e:
        return f"exc {e.__class__.__name__}"


def youtube_count(channel_id: Optional[str]) -> Optional[int] | str:
    if not channel_id:
        return None
    try:
        if not channel_id.startswith("UC"):
            r = requests.get(
                "https://www.googleapis.com/youtube/v3/channels",
                params={"forHandle": channel_id, "part": "id", "key": YOUTUBE_API_KEY},
                timeout=TIMEOUT,
            )
            items = r.json().get("items", [])
            if not items:
                return "no channel"
            channel_id = items[0]["id"]

        cutoff = (datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS)).isoformat()
        total = 0
        page_token = None
        for _ in range(5):
            params = {
                "channelId": channel_id, "part": "id", "maxResults": 50,
                "type": "video", "order": "date", "publishedAfter": cutoff,
                "key": YOUTUBE_API_KEY,
            }
            if page_token:
                params["pageToken"] = page_token
            r = requests.get(
                "https://www.googleapis.com/youtube/v3/search",
                params=params,
                timeout=TIMEOUT,
            )
            if not r.ok:
                return f"search {r.status_code}"
            payload = r.json()
            total += len(payload.get("items", []))
            page_token = payload.get("nextPageToken")
            if not page_token:
                break
        return total
    except Exception as e:
        return f"exc {e.__class__.__name__}"


def pinterest_count(username: Optional[str]) -> Optional[int] | str:
    """Count pins from the last LOOKBACK_DAYS via public RSS feed."""
    if not username:
        return None
    try:
        import xml.etree.ElementTree as ET
        from email.utils import parsedate_to_datetime

        r = requests.get(
            f"https://www.pinterest.com/{username.lstrip('@').strip('/')}/feed.rss",
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=TIMEOUT,
        )
        if not r.ok:
            return f"rss {r.status_code}"
        root = ET.fromstring(r.content)
        cutoff = datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS)
        recent = 0
        for item in root.findall("./channel/item"):
            pubdate = item.findtext("pubDate", "")
            try:
                ts = parsedate_to_datetime(pubdate)
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
            except Exception:
                continue
            if ts >= cutoff:
                recent += 1
        return recent
    except Exception as e:
        return f"exc {e.__class__.__name__}"


def instagram_count(username: Optional[str]) -> Optional[int] | str:
    if not username:
        return None
    try:
        r = requests.get(
            "https://api.hikerapi.com/v1/user/by/username",
            params={"username": username},
            headers={"x-access-key": HIKERAPI_KEY},
            timeout=TIMEOUT,
        )
        if not r.ok:
            return f"user {r.status_code}"
        user_id = r.json().get("pk") or r.json().get("id")
        if not user_id:
            return "no pk"

        items: list[dict] = []
        cursor = None
        for _ in range(5):
            params = {"user_id": user_id, "count": 50}
            if cursor:
                params["max_id"] = cursor
            r = requests.get(
                "https://api.hikerapi.com/v1/user/clips/chunk",
                params=params,
                headers={"x-access-key": HIKERAPI_KEY},
                timeout=TIMEOUT,
            )
            if not r.ok:
                return f"clips {r.status_code}"
            data = r.json()
            if isinstance(data, list):
                for entry in data:
                    if isinstance(entry, list):
                        items.extend(entry)
                    elif isinstance(entry, dict):
                        items.append(entry)
                break
            elif isinstance(data, dict):
                items.extend(data.get("items", []) or data.get("clips", []) or [])
                cursor = data.get("next_max_id") or data.get("end_cursor")
                if not cursor:
                    break
            else:
                break

        cutoff = datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS)
        recent = 0
        for it in items:
            taken_at = it.get("taken_at")
            if isinstance(taken_at, (int, float)):
                ts = datetime.fromtimestamp(taken_at, tz=timezone.utc)
            elif isinstance(taken_at, str):
                try:
                    ts = datetime.fromisoformat(taken_at.replace("Z", "+00:00"))
                except Exception:
                    continue
            else:
                continue
            if ts >= cutoff:
                recent += 1
        return recent
    except Exception as e:
        return f"exc {e.__class__.__name__}"


def main() -> int:
    with _conn() as c, c.cursor() as cur:
        cur.execute("""
            SELECT id, name,
                   tiktok_username, youtube_channel_id, instagram_username, pinterest_username
            FROM creators
            ORDER BY name
        """)
        creators = cur.fetchall()

    logger.info("Starting audit (lookback %d days)", LOOKBACK_DAYS)

    total_gap = 0
    total_fail = 0
    for cid, name, tt, yt, ig, pin in creators:
        db = db_counts(cid)

        for platform, real in (
            ("tiktok",    tiktok_count(tt)),
            ("youtube",   youtube_count(yt)),
            ("instagram", instagram_count(ig)),
            ("pinterest", pinterest_count(pin)),
        ):
            db_n = db.get(platform, 0)

            if real is None:
                continue  # creator has no handle for this platform
            if isinstance(real, str):
                logger.error("FAIL %-22s %-10s db=%-3d  %s", name, platform, db_n, real)
                total_fail += 1
                continue

            gap = real - db_n
            if gap >= GAP_WARN_THRESHOLD:
                logger.warning(
                    "GAP  %-22s %-10s db=%-3d  platform=%-3d  missing=%d",
                    name, platform, db_n, real, gap,
                )
                total_gap += gap
            else:
                logger.info(
                    "OK   %-22s %-10s db=%-3d  platform=%-3d",
                    name, platform, db_n, real,
                )

    logger.info("Done. Total missing videos: %d. API failures: %d.", total_gap, total_fail)

    # Persist outcome so the health endpoint / Telegram alerting can read it.
    status = "ok" if (total_gap == 0 and total_fail == 0) else ("partial" if total_fail == 0 else "fail")
    message = f"missing={total_gap} failures={total_fail}"
    now = datetime.now(timezone.utc)
    with _conn() as c2, c2.cursor() as cur2:
        cur2.execute(
            """
            INSERT INTO scraper_state (job_name, last_run_at, last_success_at, last_status, last_message)
            VALUES ('audit', %s, CASE WHEN %s = 'ok' THEN %s ELSE NULL END, %s, %s)
            ON CONFLICT (job_name) DO UPDATE SET
              last_run_at = EXCLUDED.last_run_at,
              last_success_at = COALESCE(EXCLUDED.last_success_at, scraper_state.last_success_at),
              last_status = EXCLUDED.last_status,
              last_message = EXCLUDED.last_message
            """,
            (now, status, now, status, message),
        )

    # Exit non-zero on any gap so cron can wire it to Telegram alerting.
    return 1 if (total_gap > 0 or total_fail > 0) else 0


if __name__ == "__main__":
    sys.exit(main())
