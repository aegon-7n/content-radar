"""
Скрапер Pinterest (низкий приоритет).

Pinterest имеет официальный API, но он требует OAuth и не отдаёт
метрики просмотров для чужих пинов. Для публичных пинов используем
парсинг страницы.

Стратегия:
  1. HTTP-запрос к странице пина.
  2. Парсинг JSON из тега <script id="__PWS_INITIAL_PROPS__"> или
     <script id="__PWS_DATA__"> — Pinterest встраивает полные данные пина.
  3. Fallback: og-метатеги (только описание/title, метрики скудны).

Что доступно публично:
  - saves (репины/сохранения) — главная метрика Pinterest
  - view-подобная метрика ("впечатления") — не всегда присутствует
  - likes/комментарии — практически не используются на платформе

Поддерживаемые форматы URL:
  - https://www.pinterest.com/pin/1234567890/
  - https://pin.it/SHORTCODE
"""
import json
import logging
import re
from typing import Optional
from urllib.parse import urlparse

import requests

from .. import config
from ..models import VideoMetric
from .base import BaseScraper

logger = logging.getLogger(__name__)

_HEADERS = {
    "User-Agent": config.USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


class PinterestScraper(BaseScraper):
    platform = "pinterest"

    def scrape_video(self, video_id: str, url: str) -> Optional[VideoMetric]:
        resolved_url = _resolve_short_url(url)

        metric = self._scrape_http(video_id, resolved_url)
        if metric is not None and metric.is_valid():
            logger.debug("pinterest video_id=%s scraped", video_id)
            return metric

        logger.warning("pinterest video_id=%s failed", video_id)
        return None

    # ------------------------------------------------------------------
    # HTTP-парсинг
    # ------------------------------------------------------------------

    def _scrape_http(self, video_id: str, url: str) -> Optional[VideoMetric]:
        try:
            resp = requests.get(url, headers=_HEADERS, timeout=15)
        except requests.RequestException as exc:
            logger.debug("pinterest HTTP request failed url=%s: %s", url, exc)
            return None

        if not resp.ok:
            logger.debug("pinterest HTTP status=%d url=%s", resp.status_code, url)
            return None

        html = resp.text

        # Попытка 1: __PWS_INITIAL_PROPS__ или __PWS_DATA__
        for script_id in ("__PWS_INITIAL_PROPS__", "__PWS_DATA__"):
            pattern = rf'<script\s+id="{script_id}"[^>]*>(.*?)</script>'
            match = re.search(pattern, html, re.DOTALL)
            if match:
                metric = self._parse_pws_json(video_id, match.group(1))
                if metric is not None:
                    return metric

        # Попытка 2: поиск JSON-фрагмента с repin_count напрямую
        # Pinterest использует repin_count как "saves"
        saves_match = re.search(r'"repin_count"\s*:\s*(\d+)', html)
        views_match = re.search(r'"view_tags_count"\s*:\s*(\d+)', html)

        if saves_match or views_match:
            return VideoMetric(
                video_id=video_id,
                views=_to_int(views_match.group(1)) if views_match else None,
                likes=None,
                comments=None,
                shares=None,
                saves=_to_int(saves_match.group(1)) if saves_match else None,
            )

        # Попытка 3: og:description иногда содержит "X saves"
        og_desc_match = re.search(
            r'<meta[^>]+property="og:description"[^>]+content="([^"]*)"', html
        )
        if og_desc_match:
            desc = og_desc_match.group(1)
            saves_in_desc = re.search(r"(\d[\d,]*)\s+save", desc, re.IGNORECASE)
            if saves_in_desc:
                saves_str = saves_in_desc.group(1).replace(",", "")
                return VideoMetric(
                    video_id=video_id,
                    views=None,
                    likes=None,
                    comments=None,
                    shares=None,
                    saves=_to_int(saves_str),
                )

        logger.debug("pinterest: no usable data found for url=%s", url)
        return None

    def _parse_pws_json(self, video_id: str, raw_json: str) -> Optional[VideoMetric]:
        """
        Парсит JSON из __PWS_INITIAL_PROPS__ / __PWS_DATA__.
        Ищет объект пина с полями repin_count, view_count и т.д.
        """
        try:
            data = json.loads(raw_json)
        except json.JSONDecodeError as exc:
            logger.debug("pinterest: JSON parse error: %s", exc)
            return None

        # Pinterest хранит данные пина в разных местах в зависимости от версии
        pin_data = (
            _deep_get(data, "initialReduxState", "pins")
            or _deep_get(data, "props", "initialReduxState", "pins")
        )

        if isinstance(pin_data, dict) and pin_data:
            # pin_data — это словарь {pin_id: pin_object}
            pin_obj = next(iter(pin_data.values()), None)
            if isinstance(pin_obj, dict):
                return VideoMetric(
                    video_id=video_id,
                    views=_to_int(
                        pin_obj.get("view_tags_count")
                        or pin_obj.get("impression_count")
                    ),
                    likes=_to_int(pin_obj.get("reaction_counts", {}).get("1")),
                    comments=_to_int(pin_obj.get("comment_count")),
                    shares=None,
                    saves=_to_int(pin_obj.get("repin_count")),
                )

        return None


# ------------------------------------------------------------------
# Утилиты
# ------------------------------------------------------------------

def _resolve_short_url(url: str) -> str:
    """
    Разворачивает короткие ссылки pin.it/XXX в полные pinterest.com/pin/...
    Без этого страница может не содержать метрики.
    """
    parsed = urlparse(url)
    if parsed.netloc in ("pin.it",):
        try:
            resp = requests.head(
                url, headers=_HEADERS, allow_redirects=True, timeout=10
            )
            return resp.url
        except requests.RequestException:
            return url
    return url


def _deep_get(d, *keys):
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
