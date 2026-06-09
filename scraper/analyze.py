"""
Ежедневный дайджест бизнес-метрик → Telegram.

Нет API-запросов — только SQL по локальной БД. Запускается после run_daily.

Алерты:
  🚀 Вирусный ролик   — впервые пересёк 100К / 500К / 1М просмотров
  📈 Рост креатора    — week-over-week +100% и более (при базе ≥ 5К)
  📉 Падение креатора — week-over-week -50% и более (при базе ≥ 5К)
  🆕 Новые ролики     — добавлены в БД за последние 24ч

Если алертов нет — молчим (не спамим).
"""
import logging
import os
import sys
from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse

import psycopg2
import psycopg2.extras
import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from scraper.config import DATABASE_URL

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")
# Telegram IPs are blocked by some ISPs (e.g. Russian providers block 149.154.x.x).
# Route through the same SOCKS5 proxy used for TikTok when SOCKS_PROXY is set.
SOCKS_PROXY = os.getenv("SOCKS_PROXY", "")

# Вирусные пороги — при первом пересечении алерт
VIRAL_THRESHOLDS = [100_000, 500_000, 1_000_000]

# Минимальная база прошлой недели чтобы считать WoW значимым
MIN_WEEKLY_BASE = 5_000

# Порог изменения для алерта
GROWTH_THRESHOLD = 1.0   # +100%
DROP_THRESHOLD = 0.5     # -50%


def _conn():
    p = urlparse(DATABASE_URL)
    return psycopg2.connect(
        host=p.hostname, port=p.port or 5432,
        dbname=p.path.lstrip("/"), user=p.username, password=p.password,
        sslmode="prefer", connect_timeout=10,
    )


def _format_views(n: int) -> str:
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}М"
    if n >= 1_000:
        return f"{n // 1_000}К"
    return str(n)


def _send_telegram(message: str) -> None:
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        logger.info("Telegram не настроен — пропускаем отправку")
        return
    proxies = {"https": SOCKS_PROXY, "http": SOCKS_PROXY} if SOCKS_PROXY else None
    try:
        resp = requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            data={
                "chat_id": TELEGRAM_CHAT_ID,
                "text": message,
                "parse_mode": "HTML",
            },
            proxies=proxies,
            timeout=(5, 15),
        )
        if not resp.ok:
            logger.warning("Telegram error %d: %s", resp.status_code, resp.text[:200])
    except Exception as exc:
        logger.warning("Telegram send failed: %s", exc)


def viral_videos(cur: psycopg2.extensions.cursor, tenant_id: str) -> list[dict]:
    """Ролики, впервые пересёкшие порог за последние ~24ч."""
    results = []
    for threshold in VIRAL_THRESHOLDS:
        cur.execute(
            """
            SELECT
                v.url,
                v.platform,
                c.name AS creator,
                m_latest.views AS cur_views,
                m_prev.views AS prev_views
            FROM videos v
            JOIN creators c ON c.id = v.creator_id
            JOIN LATERAL (
                SELECT views FROM video_metrics
                WHERE video_id = v.id
                ORDER BY scraped_at DESC
                LIMIT 1
            ) m_latest ON true
            LEFT JOIN LATERAL (
                SELECT views FROM video_metrics
                WHERE video_id = v.id
                ORDER BY scraped_at DESC
                LIMIT 1 OFFSET 1
            ) m_prev ON true
            WHERE v.tenant_id = %s
              AND m_latest.views >= %s
              AND (m_prev.views IS NULL OR m_prev.views < %s)
            ORDER BY m_latest.views DESC
            """,
            (tenant_id, threshold, threshold),
        )
        for row in cur.fetchall():
            results.append({
                "url": row[0],
                "platform": row[1],
                "creator": row[2],
                "views": row[3],
                "threshold": threshold,
            })
    # Дедупликация: один ролик может попасть в несколько порогов — берём высший
    seen: dict[str, dict] = {}
    for item in sorted(results, key=lambda x: x["threshold"], reverse=True):
        seen.setdefault(item["url"], item)
    return list(seen.values())


def creator_wow(cur: psycopg2.extensions.cursor, tenant_id: str) -> list[dict]:
    """Week-over-week изменение просмотров по креаторам."""
    cur.execute(
        """
        WITH
          now_snap AS (
            SELECT video_id, MAX(views) AS views
            FROM video_metrics
            WHERE scraped_at <= NOW()
            GROUP BY video_id
          ),
          week_snap AS (
            SELECT video_id, MAX(views) AS views
            FROM video_metrics
            WHERE scraped_at <= NOW() - INTERVAL '7 days'
            GROUP BY video_id
          ),
          two_week_snap AS (
            SELECT video_id, MAX(views) AS views
            FROM video_metrics
            WHERE scraped_at <= NOW() - INTERVAL '14 days'
            GROUP BY video_id
          )
        SELECT
          c.name AS creator,
          SUM(GREATEST(COALESCE(n.views, 0) - COALESCE(w.views, 0), 0)) AS this_week,
          SUM(GREATEST(COALESCE(w.views, 0) - COALESCE(t.views, 0), 0)) AS last_week
        FROM videos v
        JOIN creators c ON c.id = v.creator_id
        LEFT JOIN now_snap   n ON n.video_id = v.id
        LEFT JOIN week_snap  w ON w.video_id = v.id
        LEFT JOIN two_week_snap t ON t.video_id = v.id
        WHERE v.tenant_id = %s
          AND v.published_at >= NOW() - INTERVAL '30 days'
          AND v.fail_streak < 3
        GROUP BY c.id, c.name
        ORDER BY this_week DESC
        """,
        (tenant_id,),
    )
    rows = cur.fetchall()
    alerts = []
    for creator, this_week, last_week in rows:
        this_week = int(this_week or 0)
        last_week = int(last_week or 0)
        if last_week < MIN_WEEKLY_BASE:
            continue
        ratio = this_week / last_week
        if ratio >= 1 + GROWTH_THRESHOLD:
            alerts.append({
                "creator": creator,
                "this_week": this_week,
                "last_week": last_week,
                "direction": "up",
                "pct": round((ratio - 1) * 100),
            })
        elif ratio <= 1 - DROP_THRESHOLD:
            alerts.append({
                "creator": creator,
                "this_week": this_week,
                "last_week": last_week,
                "direction": "down",
                "pct": round((1 - ratio) * 100),
            })
    return alerts


def new_videos_24h(cur: psycopg2.extensions.cursor, tenant_id: str) -> int:
    """Сколько роликов добавлено в БД за последние 24ч."""
    cur.execute(
        "SELECT COUNT(*) FROM videos WHERE tenant_id = %s AND created_at >= NOW() - INTERVAL '24 hours'",
        (tenant_id,),
    )
    return cur.fetchone()[0]


def build_message(tenant_name: str, virals: list[dict], wows: list[dict], new_count: int) -> str | None:
    parts = []

    if virals:
        parts.append("🚀 <b>Вирусные ролики</b>")
        for v in virals:
            threshold_label = _format_views(v["threshold"])
            views_label = _format_views(v["views"])
            parts.append(
                f"  • {v['creator']} [{v['platform']}] — {views_label} "
                f"(пересёк {threshold_label})\n    {v['url']}"
            )

    for w in wows:
        if w["direction"] == "up":
            parts.append(
                f"📈 <b>{w['creator']}</b>: +{w['pct']}% WoW "
                f"({_format_views(w['last_week'])} → {_format_views(w['this_week'])})"
            )
        else:
            parts.append(
                f"📉 <b>{w['creator']}</b>: −{w['pct']}% WoW "
                f"({_format_views(w['last_week'])} → {_format_views(w['this_week'])})"
            )

    if new_count:
        parts.append(f"🆕 Новых роликов за 24ч: {new_count}")

    if not parts:
        return None

    header = f"📊 <b>ContentRadar — {tenant_name}</b>"
    return header + "\n\n" + "\n".join(parts)


def _update_scraper_state(conn, status: str, message: str) -> None:
    now = datetime.now(timezone.utc)
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO scraper_state (job_name, last_run_at, last_success_at, last_status, last_message)
            VALUES ('analyze', %s, %s, %s, %s)
            ON CONFLICT (job_name) DO UPDATE SET
              last_run_at = EXCLUDED.last_run_at,
              last_success_at = COALESCE(EXCLUDED.last_success_at, scraper_state.last_success_at),
              last_status = EXCLUDED.last_status,
              last_message = EXCLUDED.last_message
            """,
            (now, now, status, message),
        )
    conn.commit()


def main() -> int:
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
            cur.execute(
                """
                SELECT DISTINCT t.id, t.name
                FROM tenants t
                JOIN videos v ON v.tenant_id = t.id
                WHERE v.fail_streak < 3
                ORDER BY t.name
                """
            )
            tenants = [(row["id"], row["name"]) for row in cur.fetchall()]

        alerts_sent = 0
        for tenant_id, tenant_name in tenants:
            logger.info("Analyzing tenant: %s", tenant_name)
            with conn.cursor() as cur:
                virals = viral_videos(cur, tenant_id)
                wows = creator_wow(cur, tenant_id)
                new_count = new_videos_24h(cur, tenant_id)

            msg = build_message(tenant_name, virals, wows, new_count)
            if msg:
                logger.info("Sending digest for %s (%d virals, %d wow, %d new)",
                            tenant_name, len(virals), len(wows), new_count)
                _send_telegram(msg)
                alerts_sent += 1
            else:
                logger.info("No alerts for %s — quiet day", tenant_name)

        summary = f"tenants={len(tenants)} alerts_sent={alerts_sent}"
        logger.info("Done. %s", summary)
        _update_scraper_state(conn, "ok", summary)
        return 0

    except Exception as exc:
        logger.exception("analyze failed: %s", exc)
        try:
            _update_scraper_state(conn, "fail", str(exc)[:200])
        except Exception:
            pass
        return 1
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
