"""
Скрапер TikTok.

Стратегия (по приоритету):
  1. TikAPI.io — unofficial TikTok API, возвращает полные метрики
     включая saves (collect_count). Требует TIKAPI_KEY в .env.local.
  2. HTTP fallback — парсинг __UNIVERSAL_DATA_FOR_REHYDRATION__ из HTML.
     Работает для публичных роликов, но может блокироваться по IP.

Поддерживаемые форматы URL:
  - https://www.tiktok.com/@username/video/1234567890
  - https://vm.tiktok.com/SHORTCODE/  (разворачивается через redirect)
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

_TIKAPI_BASE = "https://api.tikapi.io"

_BROWSER_HEADERS = {
    "User-Agent": config.USER_AGENT,
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": "https://www.tiktok.com/",
}


class TikTokScraper(BaseScraper):
    platform = "tiktok"

    def scrape_video(self, video_id: str, url: str) -> Optional[VideoMetric]:
        # Разворачиваем короткие ссылки vm.tiktok.com
        resolved_url = _resolve_short_url(url)

        # Метод 1: TikAPI.io
        if config.TIKAPI_KEY:
            metric = self._scrape_tikapi(video_id, resolved_url)
            if metric is not None and metric.is_valid():
                logger.debug("tiktok video_id=%s scraped via TikAPI", video_id)
                return metric
            logger.info("tiktok video_id=%s TikAPI failed, trying HTTP fallback", video_id)

        # Метод 2: HTTP fallback
        metric = self._scrape_http(video_id, resolved_url)
        if metric is not None and metric.is_valid():
            logger.debug("tiktok video_id=%s scraped via HTTP fallback", video_id)
            return metric

        logger.warning("tiktok video_id=%s all methods failed", video_id)
        return None

    # ------------------------------------------------------------------
    # Метод 1: TikAPI.io
    # ------------------------------------------------------------------

    def _scrape_tikapi(self, video_id: str, url: str) -> Optional[VideoMetric]:
        """
        GET /public/video?url={url}
        Docs: https://tikapi.io/documentation/#tag/Public/operation/getVideoInfo
        """
        tiktok_video_id = _extract_tiktok_id(url)

        try:
            resp = requests.get(
                f"{_TIKAPI_BASE}/public/video",
                params={"id": tiktok_video_id} if tiktok_video_id else {"url": url},
                headers={
                    "X-API-KEY": config.TIKAPI_KEY,
                    "Accept": "application/json",
                },
                timeout=20,
            )

            if resp.status_code == 429:
                logger.warning("tiktok TikAPI rate limit hit for video_id=%s", video_id)
                return None

            if resp.status_code == 404:
                logger.info("tiktok TikAPI: video not found video_id=%s url=%s", video_id, url)
                return None

            if not resp.ok:
                logger.debug("tiktok TikAPI status=%d video_id=%s", resp.status_code, video_id)
                return None

            data = resp.json()

        except requests.RequestException as exc:
            logger.debug("tiktok TikAPI request failed video_id=%s: %s", video_id, exc)
            return None
        except (json.JSONDecodeError, Exception) as exc:
            logger.debug("tiktok TikAPI parse error video_id=%s: %s", video_id, exc)
            return None

        # TikAPI возвращает itemInfo.itemStruct.stats
        item = (
            _deep_get(data, "itemInfo", "itemStruct")
            or _deep_get(data, "item")
        )
        if not item:
            logger.debug("tiktok TikAPI: unexpected response structure video_id=%s: %s", video_id, list(data.keys()))
            return None

        stats = item.get("stats", {})
        stats_v2 = item.get("statsV2", {})

        def get_stat(key: str) -> Optional[int]:
            val = stats_v2.get(key) or stats.get(key)
            return _to_int(val)

        return VideoMetric(
            video_id=video_id,
            views=get_stat("playCount") or get_stat("viewCount"),
            likes=get_stat("diggCount"),
            comments=get_stat("commentCount"),
            shares=get_stat("shareCount"),
            saves=get_stat("collectCount"),
        )

    # ------------------------------------------------------------------
    # Метод 2: HTTP fallback
    # ------------------------------------------------------------------

    def _scrape_http(self, video_id: str, url: str) -> Optional[VideoMetric]:
        try:
            resp = requests.get(url, headers=_BROWSER_HEADERS, timeout=15)
            resp.raise_for_status()
        except requests.RequestException as exc:
            logger.debug("tiktok HTTP request failed url=%s: %s", url, exc)
            return None

        pattern = r'<script\s+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)</script>'
        match = re.search(pattern, resp.text, re.DOTALL)
        if not match:
            return None

        try:
            data = json.loads(match.group(1))
        except json.JSONDecodeError:
            return None

        try:
            vd = data["__DEFAULT_SCOPE__"]["webapp.video-detail"]
            # statusCode != 0 означает ошибку (видео удалено, приватное и т.д.)
            if vd.get("statusCode", -1) != 0:
                logger.info(
                    "tiktok HTTP: statusCode=%s msg=%s url=%s",
                    vd.get("statusCode"), vd.get("statusMsg"), url,
                )
                return None

            item_struct = vd["itemInfo"]["itemStruct"]
            stats = item_struct.get("stats", {})
            stats_v2 = item_struct.get("statsV2", {})

            def get_stat(key: str) -> Optional[int]:
                val = stats_v2.get(key) or stats.get(key)
                return _to_int(val)

            return VideoMetric(
                video_id=video_id,
                views=get_stat("playCount") or get_stat("viewCount"),
                likes=get_stat("diggCount"),
                comments=get_stat("commentCount"),
                shares=get_stat("shareCount"),
                saves=get_stat("collectCount"),
            )

        except (KeyError, TypeError) as exc:
            logger.debug("tiktok HTTP: unexpected JSON structure url=%s: %s", url, exc)
            return None


# ------------------------------------------------------------------
# Утилиты
# ------------------------------------------------------------------

def _extract_tiktok_id(url: str) -> Optional[str]:
    """Извлекает числовой ID видео из URL."""
    match = re.search(r"/video/(\d+)", url)
    return match.group(1) if match else None


def _resolve_short_url(url: str) -> str:
    """Разворачивает vm.tiktok.com/XXX в полный URL."""
    if "vm.tiktok.com" in url or "vt.tiktok.com" in url:
        try:
            resp = requests.head(url, headers=_BROWSER_HEADERS, allow_redirects=True, timeout=10)
            return resp.url
        except requests.RequestException:
            return url
    return url


def _deep_get(d: dict, *keys):
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
