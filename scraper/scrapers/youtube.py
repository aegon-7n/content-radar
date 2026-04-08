"""
Скрапер YouTube Shorts / обычных видео.

Стратегия (по приоритету):
  1. YouTube Data API v3 (официальный) — точные данные, лимит 10 000 единиц/день.
     Требует YOUTUBE_API_KEY в .env.local.
  2. Fallback: yt-dlp — если API-ключ не задан или лимит исчерпан.

Поддерживаемые форматы URL:
  - https://www.youtube.com/watch?v=VIDEO_ID
  - https://youtu.be/VIDEO_ID
  - https://www.youtube.com/shorts/VIDEO_ID
  - https://youtube.com/shorts/VIDEO_ID
"""
import logging
import re
from typing import Optional
from urllib.parse import parse_qs, urlparse

import requests

from .. import config
from ..models import VideoMetric
from .base import BaseScraper

logger = logging.getLogger(__name__)

_YT_API_URL = "https://www.googleapis.com/youtube/v3/videos"

_HEADERS = {
    "User-Agent": config.USER_AGENT,
}


class YouTubeScraper(BaseScraper):
    platform = "youtube"

    def scrape_video(self, video_id: str, url: str) -> Optional[VideoMetric]:
        yt_id = _extract_youtube_id(url)
        if not yt_id:
            logger.warning("youtube: cannot extract video ID from url=%s", url)
            return None

        # Пробуем официальный API если ключ задан
        if config.YOUTUBE_API_KEY:
            metric = self._scrape_api(video_id, yt_id)
            if metric is not None and metric.is_valid():
                logger.debug("youtube video_id=%s scraped via API", video_id)
                return metric
            logger.info(
                "youtube video_id=%s API failed, trying yt-dlp fallback", video_id
            )

        # Fallback: yt-dlp
        metric = self._scrape_ytdlp(video_id, url)
        if metric is not None and metric.is_valid():
            logger.debug("youtube video_id=%s scraped via yt-dlp", video_id)
            return metric

        logger.warning("youtube video_id=%s all methods failed", video_id)
        return None

    # ------------------------------------------------------------------
    # Метод 1: YouTube Data API v3
    # ------------------------------------------------------------------

    def _scrape_api(self, video_id: str, yt_id: str) -> Optional[VideoMetric]:
        """
        GET /youtube/v3/videos?id={yt_id}&part=statistics&key={API_KEY}

        Возвращает: viewCount, likeCount, commentCount.
        shares и saves YouTube API не предоставляет — будут None.
        """
        try:
            resp = requests.get(
                _YT_API_URL,
                params={
                    "id": yt_id,
                    "part": "statistics",
                    "key": config.YOUTUBE_API_KEY,
                },
                headers=_HEADERS,
                timeout=15,
            )

            # 403 может означать исчерпание квоты
            if resp.status_code == 403:
                logger.error(
                    "YouTube API returned 403 for yt_id=%s — quota exceeded or invalid key",
                    yt_id,
                )
                return None

            resp.raise_for_status()
            data = resp.json()

        except requests.RequestException as exc:
            logger.debug("youtube API request failed yt_id=%s: %s", yt_id, exc)
            return None
        except Exception as exc:
            logger.debug("youtube API unexpected error yt_id=%s: %s", yt_id, exc)
            return None

        items = data.get("items", [])
        if not items:
            logger.warning(
                "youtube API: no items returned for yt_id=%s (video may be private/deleted)",
                yt_id,
            )
            return None

        stats = items[0].get("statistics", {})

        # YouTube API может не вернуть likeCount если автор скрыл лайки
        return VideoMetric(
            video_id=video_id,
            views=_to_int(stats.get("viewCount")),
            likes=_to_int(stats.get("likeCount")),
            comments=_to_int(stats.get("commentCount")),
            shares=None,   # API не отдаёт
            saves=None,    # API не отдаёт
        )

    # ------------------------------------------------------------------
    # Метод 2: yt-dlp fallback
    # ------------------------------------------------------------------

    def _scrape_ytdlp(self, video_id: str, url: str) -> Optional[VideoMetric]:
        try:
            import yt_dlp  # noqa: PLC0415

            ydl_opts = {
                "quiet": True,
                "no_warnings": True,
                "skip_download": True,
                "noprogress": True,
            }

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)

            if not info:
                return None

            return VideoMetric(
                video_id=video_id,
                views=_to_int(info.get("view_count")),
                likes=_to_int(info.get("like_count")),
                comments=_to_int(info.get("comment_count")),
                shares=None,
                saves=None,
            )

        except ImportError:
            logger.warning("yt-dlp is not installed, cannot use fallback for YouTube")
            return None
        except Exception as exc:
            logger.debug("youtube yt-dlp error url=%s: %s", url, exc)
            return None


# ------------------------------------------------------------------
# Утилиты
# ------------------------------------------------------------------

def _extract_youtube_id(url: str) -> Optional[str]:
    """
    Извлекает video ID из всех поддерживаемых форматов YouTube URL.

    >>> _extract_youtube_id("https://youtu.be/dQw4w9WgXcQ")
    'dQw4w9WgXcQ'
    >>> _extract_youtube_id("https://www.youtube.com/shorts/dQw4w9WgXcQ")
    'dQw4w9WgXcQ'
    >>> _extract_youtube_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    'dQw4w9WgXcQ'
    """
    if not url:
        return None

    parsed = urlparse(url)

    # youtu.be/VIDEO_ID
    if parsed.netloc in ("youtu.be",):
        vid = parsed.path.lstrip("/").split("/")[0]
        return vid if vid else None

    # youtube.com/shorts/VIDEO_ID
    shorts_match = re.match(r"/shorts/([A-Za-z0-9_-]+)", parsed.path)
    if shorts_match:
        return shorts_match.group(1)

    # youtube.com/watch?v=VIDEO_ID
    qs = parse_qs(parsed.query)
    if "v" in qs:
        return qs["v"][0]

    return None


def _to_int(value) -> Optional[int]:
    """Безопасное приведение к int. None при любой ошибке."""
    if value is None:
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None
