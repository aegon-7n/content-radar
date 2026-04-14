"""
Скрапер Instagram Reels.

Стратегия (по приоритету):
  1. HikerAPI — платный managed сервис ($0.0006/запрос), даёт views, likes, comments.
     Требует HIKERAPI_KEY в .env.local. Регистрация: https://hikerapi.com
  2. yt-dlp — бесплатный fallback, но часто блокируется Instagram.

Поддерживаемые форматы URL:
  - https://www.instagram.com/reel/ABC123/
  - https://www.instagram.com/p/ABC123/
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

_HIKERAPI_BASE = "https://api.hikerapi.com/v1"

_HEADERS = {
    "User-Agent": config.USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


class InstagramScraper(BaseScraper):
    platform = "instagram"

    def scrape_video(self, video_id: str, url: str) -> Optional[VideoMetric]:
        clean_url = _normalize_url(url)

        # Метод 1: HikerAPI
        if config.HIKERAPI_KEY:
            metric = self._scrape_hikerapi(video_id, clean_url)
            if metric is not None and metric.is_valid():
                logger.debug("instagram video_id=%s scraped via HikerAPI", video_id)
                return metric
            logger.info("instagram video_id=%s HikerAPI failed, trying yt-dlp fallback", video_id)

        # Метод 2: yt-dlp fallback
        metric = self._scrape_ytdlp(video_id, clean_url)
        if metric is not None and metric.is_valid():
            logger.debug("instagram video_id=%s scraped via yt-dlp", video_id)
            return metric

        logger.warning("instagram video_id=%s all methods failed", video_id)
        return None

    # ------------------------------------------------------------------
    # Метод 1: HikerAPI
    # ------------------------------------------------------------------

    def _scrape_hikerapi(self, video_id: str, url: str) -> Optional[VideoMetric]:
        """
        GET /media/by/url?url={url}
        Docs: https://hikerapi.com/docs
        """
        try:
            resp = requests.get(
                f"{_HIKERAPI_BASE}/media/by/url",
                params={"url": url},
                headers={
                    "x-access-key": config.HIKERAPI_KEY,
                    "accept": "application/json",
                },
                timeout=20,
            )

            if resp.status_code == 402:
                logger.error("instagram HikerAPI: недостаточно средств на балансе")
                return None

            if resp.status_code == 404:
                logger.info("instagram HikerAPI: пост не найден video_id=%s", video_id)
                return None

            if not resp.ok:
                logger.warning("instagram HikerAPI status=%d video_id=%s", resp.status_code, video_id)
                return None

            data = resp.json()

        except requests.RequestException as exc:
            logger.debug("instagram HikerAPI request failed video_id=%s: %s", video_id, exc)
            return None

        # api.hikerapi.com/v1/media/by/url возвращает объект напрямую
        # Поля: pk, code, play_count, like_count, comment_count, view_count
        media = data
        if isinstance(data, dict) and "data" in data:
            media = data["data"]
        if isinstance(media, list):
            media = media[0] if media else {}

        # Приоритет полей: play_count (Reels) > view_count > video_view_count
        # Используем next() чтобы не пропускать легитимные нули
        views = next(
            (v for v in (
                _to_int(media.get("play_count")),
                _to_int(media.get("view_count")),
                _to_int(media.get("video_view_count")),
            ) if v is not None),
            None,
        )
        likes = _to_int(media.get("like_count"))
        comments = _to_int(media.get("comment_count"))

        if views is None:
            logger.debug(
                "instagram HikerAPI: views=None для video_id=%s, ключи ответа: %s",
                video_id, list(media.keys()) if isinstance(media, dict) else type(media)
            )
            return None

        return VideoMetric(
            video_id=video_id,
            views=views,
            likes=likes,
            comments=comments,
            shares=None,   # Instagram не отдаёт публично
            saves=None,
        )

    # ------------------------------------------------------------------
    # Метод 2: yt-dlp fallback
    # ------------------------------------------------------------------

    def _scrape_ytdlp(self, video_id: str, url: str) -> Optional[VideoMetric]:
        try:
            import yt_dlp  # noqa: PLC0415

            with yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True, "skip_download": True}) as ydl:
                info = ydl.extract_info(url, download=False)

            if not info:
                return None

            return VideoMetric(
                video_id=video_id,
                views=_to_int(info.get("view_count")),
                likes=_to_int(info.get("like_count")),
                comments=None,
                shares=None,
                saves=None,
            )

        except ImportError:
            logger.warning("yt-dlp не установлен")
            return None
        except Exception as exc:
            logger.debug("instagram yt-dlp error url=%s: %s", url, exc)
            return None


# ------------------------------------------------------------------
# Утилиты
# ------------------------------------------------------------------

def _normalize_url(url: str) -> str:
    """Убирает query string: /reel/ABC123/?utm_source=... -> /reel/ABC123/"""
    match = re.match(r"(https?://(?:www\.)?instagram\.com/(?:reel|p|tv)/[A-Za-z0-9_-]+/?)", url)
    if match:
        base = match.group(1)
        return base if base.endswith("/") else base + "/"
    return url


def _to_int(value) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None
