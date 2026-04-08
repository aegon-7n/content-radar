"""
Скрапер Likee.

Стратегия (по приоритету):
  1. yt-dlp — поддерживает Likee, возвращает view_count, like_count.
  2. Fallback HTTP — запрос к странице видео и поиск JSON в HTML
     (Likee встраивает метаданные в window.__INITIAL_STATE__ или og-теги).

Likee не имеет публичного API. Оба метода могут сломаться
после обновлений платформы.

Поддерживаемые форматы URL:
  - https://likee.video/@username/video/1234567890
  - https://l.likee.video/v/XXX
"""
import json
import logging
import re
from typing import Optional

import requests

from .. import config
from ..models import VideoMetric
from .base import BaseScraper

logger = logging.getLogger(__name__)

_HEADERS = {
    "User-Agent": config.USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://likee.video/",
}


class LikeeScraper(BaseScraper):
    platform = "likee"

    def scrape_video(self, video_id: str, url: str) -> Optional[VideoMetric]:
        # Метод 1: yt-dlp
        metric = self._scrape_ytdlp(video_id, url)
        if metric is not None and metric.is_valid():
            logger.debug("likee video_id=%s scraped via yt-dlp", video_id)
            return metric

        logger.info(
            "likee video_id=%s yt-dlp failed, trying HTTP fallback", video_id
        )

        # Метод 2: HTTP fallback
        metric = self._scrape_http(video_id, url)
        if metric is not None and metric.is_valid():
            logger.debug("likee video_id=%s scraped via HTTP fallback", video_id)
            return metric

        logger.warning("likee video_id=%s all methods failed", video_id)
        return None

    # ------------------------------------------------------------------
    # Метод 1: yt-dlp
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
            logger.warning("yt-dlp is not installed")
            return None
        except Exception as exc:
            logger.debug("likee yt-dlp error url=%s: %s", url, exc)
            return None

    # ------------------------------------------------------------------
    # Метод 2: HTTP fallback
    # ------------------------------------------------------------------

    def _scrape_http(self, video_id: str, url: str) -> Optional[VideoMetric]:
        """
        Загружает страницу видео и парсит метрики из:
          1. Скрипта window.__INITIAL_STATE__ (если присутствует)
          2. og-метатегов (только описание, содержит ограниченные данные)
          3. JSON-фрагментов в HTML (поиск по паттернам playCount/likeCount)
        """
        try:
            resp = requests.get(url, headers=_HEADERS, timeout=15)
        except requests.RequestException as exc:
            logger.debug("likee HTTP request failed url=%s: %s", url, exc)
            return None

        if not resp.ok:
            logger.debug("likee HTTP status=%d url=%s", resp.status_code, url)
            return None

        html = resp.text

        # Попытка 1: window.__INITIAL_STATE__
        match = re.search(
            r"window\.__INITIAL_STATE__\s*=\s*(\{.*?\});\s*</script>",
            html,
            re.DOTALL,
        )
        if match:
            try:
                state = json.loads(match.group(1))
                # Структура: state.videoDetail.postInfo или state.detail.videoInfo
                video_info = (
                    _deep_get(state, "videoDetail", "postInfo")
                    or _deep_get(state, "detail", "videoInfo")
                    or _deep_get(state, "videoInfo")
                )
                if video_info:
                    return VideoMetric(
                        video_id=video_id,
                        views=_to_int(
                            video_info.get("playCount")
                            or video_info.get("viewCount")
                        ),
                        likes=_to_int(
                            video_info.get("likeCount")
                            or video_info.get("hotCount")
                        ),
                        comments=_to_int(video_info.get("commentCount")),
                        shares=_to_int(video_info.get("shareCount")),
                        saves=None,
                    )
            except (json.JSONDecodeError, AttributeError) as exc:
                logger.debug("likee __INITIAL_STATE__ parse error url=%s: %s", url, exc)

        # Попытка 2: поиск JSON-фрагментов по ключевым словам
        # Likee иногда встраивает объект с playCount напрямую в скрипты
        json_pattern = re.search(
            r'\{"playCount"\s*:\s*(\d+)[^}]*"likeCount"\s*:\s*(\d+)',
            html,
        )
        if json_pattern:
            return VideoMetric(
                video_id=video_id,
                views=_to_int(json_pattern.group(1)),
                likes=_to_int(json_pattern.group(2)),
                comments=None,
                shares=None,
                saves=None,
            )

        return None


# ------------------------------------------------------------------
# Утилиты
# ------------------------------------------------------------------

def _deep_get(d: dict, *keys):
    """Безопасный доступ к вложенному словарю по цепочке ключей."""
    for key in keys:
        if not isinstance(d, dict):
            return None
        d = d.get(key)
    return d


def _to_int(value) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None
