"""
Модели данных для скрапера.
"""
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import List, Optional


@dataclass
class VideoContent:
    """
    Статические метаданные ролика — заполняются один раз при первом успешном скрейпе.
    Хранятся в таблице videos (не в video_metrics — это не time-series).
    Поля уже приходят в ответах TikAPI/HikerAPI/YT без доп. запросов.
    """
    video_id: str
    title: Optional[str] = None
    duration_sec: Optional[int] = None
    music_title: Optional[str] = None
    music_author: Optional[str] = None
    music_is_original: Optional[bool] = None
    hashtags: Optional[List[str]] = None
    cover_url: Optional[str] = None

    def has_data(self) -> bool:
        return any([self.title, self.duration_sec, self.music_title, self.hashtags])

    def hashtags_str(self) -> Optional[str]:
        """Comma-separated string for storage in videos.hashtags column."""
        if not self.hashtags:
            return None
        return ",".join(h.lstrip("#").lower() for h in self.hashtags)


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
