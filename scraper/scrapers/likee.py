"""
Likee scraper.

Primary strategy: Apify actor `sashaebashu/likee-scraper` — paid (~$0.01
per video) but reliable. Returns views / likes / comments / shares in one
synchronous call per URL. The actor's output shape:

    {
      "videoId": "sepkYQ",
      "views": 1_590_000,
      "likes": 84_600,
      "comments": 4_710,
      "shares": 653,
      "publishedAt": "...",
      ...
    }

Fallback: yt-dlp (legacy free path, often works but unstable).

Enable Apify by setting APIFY_TOKEN in the environment. If the token is
missing the scraper quietly falls back to yt-dlp so local dev still works.
"""
import logging
import os
from typing import Optional

import requests

from ..models import VideoMetric
from .base import BaseScraper

logger = logging.getLogger(__name__)

APIFY_TOKEN = os.environ.get("APIFY_TOKEN") or os.environ.get("APIFY_API_TOKEN")
APIFY_ACTOR = "sashaebashu~likee-scraper"
APIFY_RUN_SYNC_URL = (
    f"https://api.apify.com/v2/acts/{APIFY_ACTOR}/run-sync-get-dataset-items"
)
_APIFY_TIMEOUT = (10, 120)  # actor sync runs can take up to a minute


class LikeeScraper(BaseScraper):
    platform = "likee"

    def scrape_video(self, video_id: str, url: str) -> Optional[VideoMetric]:
        if APIFY_TOKEN:
            metric = self._scrape_apify(video_id, url)
            if metric is not None and metric.is_valid():
                logger.debug("likee video_id=%s scraped via Apify", video_id)
                return metric
            logger.info("likee video_id=%s Apify failed, falling back to yt-dlp", video_id)
        else:
            logger.debug("likee video_id=%s: APIFY_TOKEN not set, using yt-dlp", video_id)

        metric = self._scrape_ytdlp(video_id, url)
        if metric is not None and metric.is_valid():
            logger.debug("likee video_id=%s scraped via yt-dlp", video_id)
            return metric

        logger.warning("likee video_id=%s all methods failed", video_id)
        return None

    # ------------------------------------------------------------------
    # Primary: Apify actor
    # ------------------------------------------------------------------

    def _scrape_apify(self, video_id: str, url: str) -> Optional[VideoMetric]:
        try:
            resp = requests.post(
                APIFY_RUN_SYNC_URL,
                params={"token": APIFY_TOKEN},
                json={
                    "startUrls": [{"url": url}],
                    "maxItems": 1,
                    "proxyConfiguration": {"useApifyProxy": True},
                },
                timeout=_APIFY_TIMEOUT,
            )
        except requests.RequestException as exc:
            logger.debug("likee Apify request failed url=%s: %s", url, exc)
            return None

        if not resp.ok:
            logger.debug("likee Apify status=%d body=%s", resp.status_code, resp.text[:200])
            return None

        try:
            items = resp.json()
        except ValueError:
            logger.debug("likee Apify returned non-JSON: %s", resp.text[:200])
            return None

        if not items:
            return None

        item = items[0]
        if item.get("status") != "success":
            logger.debug("likee Apify item status=%s error=%s", item.get("status"), item.get("error"))
            return None

        return VideoMetric(
            video_id=video_id,
            views=_to_int(item.get("views")),
            likes=_to_int(item.get("likes")),
            comments=_to_int(item.get("comments")),
            shares=_to_int(item.get("shares")),
            saves=None,
        )

    # ------------------------------------------------------------------
    # Fallback: yt-dlp
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


def _to_int(value) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None
