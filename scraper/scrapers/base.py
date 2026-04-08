"""
Базовый класс для всех скраперов платформ.
"""
import logging
import time
from abc import ABC, abstractmethod
from typing import Optional

from .. import config
from ..models import VideoMetric

logger = logging.getLogger(__name__)


class BaseScraper(ABC):
    """
    Абстрактный скрапер. Каждая платформа реализует scrape_video().

    Retry-логика и задержки реализованы в scrape_all() — переопределять не нужно.
    """

    platform: str = ""

    @abstractmethod
    def scrape_video(self, video_id: str, url: str) -> Optional[VideoMetric]:
        """
        Собрать метрики одного ролика.

        Возвращает VideoMetric при успехе или None если метрики получить не удалось.
        Бросать исключения можно — scrape_all() перехватит их и посчитает как ошибку.
        """
        ...

    def scrape_all(self, videos: list[dict]) -> list[VideoMetric]:
        """
        Обходит все ролики платформы с задержкой между запросами и retry при ошибках.

        videos: список словарей {"id": str, "url": str} из таблицы videos.

        Возвращает только валидные метрики (views не None).
        Одна ошибка не останавливает обработку остальных роликов.
        """
        results: list[VideoMetric] = []
        total = len(videos)
        errors = 0

        logger.info("Starting scrape for platform '%s': %d videos", self.platform, total)

        for idx, video in enumerate(videos, start=1):
            video_id: str = video["id"]
            url: str = video["url"]

            metric = self._scrape_with_retry(video_id, url)

            if metric is not None and metric.is_valid():
                results.append(metric)
            else:
                errors += 1
                logger.warning(
                    "[%d/%d] platform=%s video_id=%s url=%s — failed or invalid metric",
                    idx,
                    total,
                    self.platform,
                    video_id,
                    url,
                )

            # Задержка между запросами (не ставим после последнего)
            if idx < total:
                time.sleep(config.REQUEST_DELAY)

        logger.info(
            "Finished platform '%s': processed=%d, success=%d, errors=%d",
            self.platform,
            total,
            len(results),
            errors,
        )
        return results

    def _scrape_with_retry(self, video_id: str, url: str) -> Optional[VideoMetric]:
        """
        Запускает scrape_video() до MAX_RETRIES раз с exponential backoff.

        Возвращает первый успешный результат или None после всех попыток.
        """
        last_exc: Optional[Exception] = None

        for attempt in range(1, config.MAX_RETRIES + 1):
            try:
                metric = self.scrape_video(video_id, url)
                if metric is not None and metric.is_valid():
                    return metric
                # Метод вернул None или невалидную метрику — не имеет смысла ретраить
                logger.debug(
                    "platform=%s video_id=%s attempt=%d returned None/invalid, skipping retries",
                    self.platform,
                    video_id,
                    attempt,
                )
                return metric
            except Exception as exc:
                last_exc = exc
                wait = 2 ** attempt  # 2, 4, 8 секунд
                logger.warning(
                    "platform=%s video_id=%s attempt=%d/%d error: %s — retrying in %ds",
                    self.platform,
                    video_id,
                    attempt,
                    config.MAX_RETRIES,
                    exc,
                    wait,
                )
                if attempt < config.MAX_RETRIES:
                    time.sleep(wait)

        logger.error(
            "platform=%s video_id=%s — all %d attempts failed. Last error: %s",
            self.platform,
            video_id,
            config.MAX_RETRIES,
            last_exc,
        )
        return None
