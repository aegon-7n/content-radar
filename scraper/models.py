"""
Модели данных для скрапера.
"""
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional


@dataclass
class VideoMetric:
    """
    Метрики одного ролика, собранные за один запуск скрапера.

    Поля, которые платформа не отдаёт публично, остаются None.
    Нельзя подменять None на 0 — точность данных важнее полноты.
    """
    video_id: str
    views: Optional[int]
    likes: Optional[int]
    comments: Optional[int]
    shares: Optional[int]
    saves: Optional[int]
    scraped_at: datetime = field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

    def is_valid(self) -> bool:
        """
        Метрика считается валидной, если хотя бы views удалось получить.
        Лучше вернуть ошибку, чем записать некорректные нули.
        """
        return self.views is not None
