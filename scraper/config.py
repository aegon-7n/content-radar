"""
Конфигурация скрапера. Читает переменные окружения из .env.local.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Ищем .env.local в корне проекта (на уровень выше папки scraper/)
_env_path = Path(__file__).parent.parent / ".env.local"
load_dotenv(_env_path)

# Обязательные переменные
DATABASE_URL: str = os.environ["DATABASE_URL"]

# YouTube Data API v3 — если не задан, будет использован yt-dlp как fallback
YOUTUBE_API_KEY: str = os.getenv("YOUTUBE_API_KEY", "")

# TikAPI.io — unofficial TikTok API
TIKAPI_KEY: str = os.getenv("TIKAPI_KEY", "")

# HikerAPI — Instagram scraping
HIKERAPI_KEY: str = os.getenv("HIKERAPI_KEY", "")

# Сколько дней собирать метрики после публикации (старые ролики не трогаем)
SCRAPE_HORIZON_DAYS: int = int(os.getenv("SCRAPE_HORIZON_DAYS", "90"))

# Задержка между запросами к одной платформе (секунды)
REQUEST_DELAY: float = float(os.getenv("SCRAPER_DELAY", "2.0"))

# Максимум повторных попыток при ошибке
MAX_RETRIES: int = int(os.getenv("SCRAPER_MAX_RETRIES", "3"))

# User-Agent для HTTP-запросов
USER_AGENT: str = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)
