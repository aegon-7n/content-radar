"""
TRU-344/TRU-368: Production pattern-analysis pipeline.

Queries prod DB, downloads top videos via yt-dlp, analyzes with Gemini 2.5 Flash,
saves results to tenant_insights.  Runs weekly via cron (Monday 04:00 UTC).

Architecture (TRU-368):
  Step A — Per-video tagging: analyze_video() extracts structured JSON per video (LLM, cached).
            extract_tags() converts that JSON to a flat tag list (Python, no LLM).
  Step B — Pattern comparison: build_tag_dataframe() computes pct_top/pct_bottom per tag (Python).
            LOO validation recomputes the same dataframe — no extra LLM calls.
  Step C — Describe survivors: one LLM call for all patterns that passed sharp+LOO gates.
  Step D — Russian validator: is_russian() + auto-retry if any field is below 80% Cyrillic.

Usage:
    # All tenants (normal cron mode):
    python scripts/analyze_patterns.py

    # Single tenant (debug / manual re-run):
    python scripts/analyze_patterns.py --tenant-id <uuid>

Requirements (install in scraper/venv or a dedicated venv):
    pip install google-genai openai psycopg2-binary

Binaries on VPS:
    yt-dlp  (already present for scraper)
    ffmpeg  (already present for scraper)
"""

import argparse
import json
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import psycopg2
import psycopg2.extras
from google import genai
from openai import OpenAI

# ── Config ────────────────────────────────────────────────────────────────────

APP_DIR = Path(__file__).resolve().parent.parent
WORKDIR = Path(os.getenv("PIPELINE_CACHE_DIR", "/opt/contentradar/pipeline_cache"))
VIDEO_DIR = WORKDIR / "videos"
TRANSCRIPT_DIR = WORKDIR / "transcripts"
ANALYSIS_DIR = WORKDIR / "analysis"
STATE_FILE = WORKDIR / "pipeline_state.json"

for _d in (VIDEO_DIR, TRANSCRIPT_DIR, ANALYSIS_DIR):
    _d.mkdir(parents=True, exist_ok=True)

YT_DLP = os.getenv("YTDLP_BIN", str(APP_DIR / "scraper/venv/bin/yt-dlp"))
if not Path(YT_DLP).exists():
    YT_DLP = "yt-dlp"  # fallback to system PATH
FFMPEG = os.getenv("FFMPEG_BIN", "ffmpeg")
SOCKS_PROXY = os.getenv("SOCKS_PROXY", "")
COOKIES_FILE = APP_DIR / "scraper" / "youtube_cookies.txt"

# Gate thresholds
GATE_MIN_VIDEOS = 10
GATE_TOP_QUARTILE_RECENT = 3   # ≥3 top-quartile videos scraped in last 7 days
GATE_RECENT_DAYS = 7

TOP_N = 15
MID_N = 15
MAX_PATTERNS = 3

COST_BUDGET_USD = 0.15


# ── Database ──────────────────────────────────────────────────────────────────

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def get_tenants_for_analysis(conn, tenant_id_filter: str | None = None) -> list[dict]:
    """Return tenants that pass the gate for analysis."""
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    if tenant_id_filter:
        cur.execute("SELECT id, name FROM tenants WHERE id = %s", (tenant_id_filter,))
    else:
        cur.execute("SELECT id, name FROM tenants")

    return [dict(r) for r in cur.fetchall()]


def get_tenant_videos(conn, tenant_id: str) -> list[dict]:
    """
    Return all active videos for the tenant with their latest metrics.
    Sorted by views DESC.  Videos with zero successful scrapes are excluded.
    """
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    cur.execute("""
        SELECT
            v.id,
            v.url,
            v.platform,
            vm.views,
            vm.likes,
            vm.comments,
            vm.scraped_at AS last_scraped
        FROM videos v
        JOIN LATERAL (
            SELECT views, likes, comments, scraped_at
            FROM video_metrics
            WHERE video_id = v.id
            ORDER BY scraped_at DESC
            LIMIT 1
        ) vm ON TRUE
        WHERE v.tenant_id = %s
          AND v.fail_streak < 3
        ORDER BY vm.views DESC
    """, (tenant_id,))
    return [dict(r) for r in cur.fetchall()]


def check_gate(videos: list[dict]) -> tuple[bool, str]:
    """Returns (passes, reason)."""
    if len(videos) < GATE_MIN_VIDEOS:
        return False, f"only {len(videos)} videos (need {GATE_MIN_VIDEOS})"

    # Top quartile threshold by views
    top_25_pct = max(1, len(videos) // 4)
    top_quartile = videos[:top_25_pct]

    cutoff = datetime.now(timezone.utc) - timedelta(days=GATE_RECENT_DAYS)
    recent_top = [v for v in top_quartile if v["last_scraped"] and v["last_scraped"] >= cutoff]

    if len(recent_top) < GATE_TOP_QUARTILE_RECENT:
        return False, (
            f"only {len(recent_top)} top-quartile videos scraped in last {GATE_RECENT_DAYS}d "
            f"(need {GATE_TOP_QUARTILE_RECENT})"
        )

    return True, "ok"


def split_top_middle(videos: list[dict], top_n: int, mid_n: int) -> tuple[list, list]:
    top = videos[:top_n]
    mid = videos[top_n : top_n + mid_n]
    return top, mid


def save_insight(conn, tenant_id: str, period_start: date, period_end: date,
                 patterns: dict, video_count: int, cost_usd: float) -> None:
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO tenant_insights
            (tenant_id, computed_at, period_start, period_end, patterns, video_count_used, gemini_cost_usd)
        VALUES (%s, NOW(), %s, %s, %s, %s, %s)
    """, (
        tenant_id,
        period_start.isoformat(),
        period_end.isoformat(),
        json.dumps(patterns, ensure_ascii=False),
        video_count,
        round(cost_usd, 6),
    ))
    conn.commit()


def update_scraper_state(conn, status: str, message: str) -> None:
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO scraper_state (job_name, last_run_at, last_status, last_message)
        VALUES ('pattern_analysis', NOW(), %s, %s)
        ON CONFLICT (job_name) DO UPDATE
        SET last_run_at = NOW(),
            last_status = EXCLUDED.last_status,
            last_message = EXCLUDED.last_message,
            last_success_at = CASE WHEN EXCLUDED.last_status = 'ok' THEN NOW()
                                   ELSE scraper_state.last_success_at END
    """, (status, message))
    conn.commit()


# ── Video download ────────────────────────────────────────────────────────────

def download_video(row: dict) -> Path | None:
    """yt-dlp download. Cached by video_id. Returns mp4 path or None."""
    vid_id = row["id"]
    for ext in ("mp4", "webm", "mkv"):
        existing = VIDEO_DIR / f"{vid_id}.{ext}"
        if existing.exists() and existing.stat().st_size > 10_000:
            return existing

    out_template = VIDEO_DIR / f"{vid_id}.%(ext)s"
    cmd = [
        YT_DLP, "--no-warnings", "--no-playlist", "--no-progress",
        "-f", "best[height<=720]/best",
        "-o", str(out_template),
        row["url"],
    ]
    if SOCKS_PROXY:
        cmd.extend(["--proxy", SOCKS_PROXY])
    if COOKIES_FILE.exists():
        cmd.extend(["--cookies", str(COOKIES_FILE)])

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            print(f"  ! download failed {vid_id}: {result.stderr[:200]}")
            return None
    except subprocess.TimeoutExpired:
        print(f"  ! download timeout {vid_id}")
        return None

    for ext in ("mp4", "webm", "mkv"):
        candidate = VIDEO_DIR / f"{vid_id}.{ext}"
        if candidate.exists():
            return candidate
    return None


# ── Transcription ─────────────────────────────────────────────────────────────

def transcribe(mp4: Path, oai: OpenAI) -> str:
    """Whisper transcript. Cached on disk."""
    txt_path = TRANSCRIPT_DIR / f"{mp4.stem}.txt"
    if txt_path.exists():
        return txt_path.read_text()

    audio = TRANSCRIPT_DIR / f"{mp4.stem}.mp3"
    subprocess.run(
        [FFMPEG, "-y", "-i", str(mp4), "-vn", "-acodec", "libmp3lame",
         "-ar", "16000", "-ac", "1", "-b:a", "32k", str(audio)],
        capture_output=True, timeout=60,
    )
    if not audio.exists():
        return ""

    with open(audio, "rb") as f:
        r = oai.audio.transcriptions.create(model="whisper-1", file=f)
    txt_path.write_text(r.text)
    return r.text


# ── Per-video feature extraction ──────────────────────────────────────────────

def analyze_video(mp4: Path, transcript: str, row: dict, gem: genai.Client) -> dict:
    """Single-video feature extraction via Gemini 2.5 Flash with native video upload."""
    cache = ANALYSIS_DIR / f"{mp4.stem}.json"
    if cache.exists():
        return json.loads(cache.read_text())

    file = gem.files.upload(file=str(mp4))
    while file.state.name == "PROCESSING":
        time.sleep(2)
        file = gem.files.get(name=file.name)
    if file.state.name == "FAILED":
        return {"error": "video_upload_failed", "video_id": row["id"]}

    prompt = f"""Ты — аналитик короткого вертикального видео для селлеров Wildberries.

КОНТЕКСТ ролика:
- views: {row['views']}, likes: {row['likes']}, comments: {row['comments']}
- URL: {row['url']}, платформа: {row['platform']}
- транскрипт: {transcript[:1500]}

Извлеки СТРОГО структурированные признаки. Не пиши что-то «банальное». Если не уверен — ставь null.

Output JSON:
{{
  "first_2s": {{
    "what_shown": "result|problem|face|product|text|hands|environment",
    "voice_or_text": "voice|on_screen_text|both|silence",
    "first_word_or_text": "..."
  }},
  "narrative_structure": "problem_solution|before_after|demo|review|storytelling|haul|comparison",
  "duration_sec": <int>,
  "human_in_frame": {{
    "presence": "talking_head|hands_only|absent|lifestyle_bg",
    "speaks_to_camera": true|false
  }},
  "audio": {{
    "type": "voice_only|trending_audio|original_music|silence",
    "trending_audio_recognized": "..."
  }},
  "product_show_timing": {{
    "first_appearance_sec": <int>,
    "close_up_count": <int>
  }},
  "on_screen_text": {{
    "present": true|false,
    "function": "label|price|hook|punchline|all_caps"
  }},
  "emotion_target": "desire|humor|surprise|recognition|asmr|frustration",
  "pacing": {{
    "cuts_per_10s": <int>,
    "perceived_tempo": "slow|medium|fast"
  }}
}}"""

    resp = gem.models.generate_content(
        model="gemini-2.5-flash",
        contents=[file, prompt],
    )
    try:
        text = resp.text.strip()
        if text.startswith("```"):
            text = text.split("```")[1].lstrip("json\n")
        result = json.loads(text)
    except Exception as e:
        result = {"error": "parse_failed", "raw": resp.text[:200], "exc": str(e)}

    result["_video_id"] = row["id"]
    result["_views"] = row["views"]
    result["_tokens"] = resp.usage_metadata.total_token_count
    cache.write_text(json.dumps(result, ensure_ascii=False, indent=2))
    return result


# ── Tag taxonomy (Step A) ─────────────────────────────────────────────────────

# tag → (Russian name, Russian description) used as fallback when LLM fails
TAG_NAMES: dict[str, tuple[str, str]] = {
    "first2s_result":              ("результат_с_первой_секунды",    "Первые 2 секунды показывают результат или итог"),
    "first2s_problem":             ("проблема_с_первой_секунды",     "Первые 2 секунды обозначают проблему"),
    "first2s_face":                ("лицо_с_первой_секунды",         "Первые 2 секунды — крупный план лица"),
    "first2s_product":             ("товар_с_первой_секунды",        "Первые 2 секунды показывают товар"),
    "first2s_text":                ("текстовый_старт",               "Первые 2 секунды — текстовый экран без товара"),
    "first2s_hands":               ("руки_с_первой_секунды",         "Первые 2 секунды — только руки"),
    "first2s_environment":         ("среда_с_первой_секунды",        "Первые 2 секунды — окружение или обстановка"),
    "narrative_problem_solution":  ("нарратив_проблема_решение",     "Структура: проблема → решение"),
    "narrative_before_after":      ("нарратив_до_после",             "Структура: до/после"),
    "narrative_demo":              ("нарратив_демонстрация",         "Демонстрация товара или процесса"),
    "narrative_review":            ("нарратив_обзор",                "Обзор или отзыв о товаре"),
    "narrative_storytelling":      ("нарратив_история",              "Сторителлинг с личным опытом"),
    "narrative_haul":              ("нарратив_хаул",                 "Хаул или распаковка нескольких товаров"),
    "narrative_comparison":        ("нарратив_сравнение",            "Сравнение товаров или вариантов"),
    "human_talking_head":          ("говорящая_голова",              "Человек снят по плечи, прямо в камеру"),
    "human_hands_only":            ("только_руки",                   "Только руки, без показа лица"),
    "human_absent":                ("нет_человека",                  "Человек отсутствует в кадре"),
    "human_lifestyle_bg":          ("лайфстайл_образ",              "Человек как образ жизни, не продавец"),
    "speaks_to_camera":            ("прямое_обращение_к_камере",    "Прямое обращение к зрителю через камеру"),
    "audio_voice_only":            ("только_голос",                  "Только голос автора, без фоновой музыки"),
    "audio_trending_audio":        ("трендовый_аудиотрек",          "Использование трендового аудио"),
    "audio_original_music":        ("оригинальная_музыка",          "Оригинальная или фоновая музыка"),
    "audio_silence":               ("без_звука",                     "Тишина или очень тихий звук"),
    "has_onscreen_text":           ("есть_текст_на_экране",         "Присутствует наложенный текст"),
    "text_label":                  ("текст_подпись",                 "Текст как подпись или ярлык"),
    "text_price":                  ("текст_цена",                    "Текст с ценой или скидкой"),
    "text_hook":                   ("текст_зацепка",                 "Текст как зацепка в начале"),
    "text_punchline":              ("текст_вывод",                   "Текст как итог или вывод"),
    "text_all_caps":               ("текст_заглавными",             "Текст написан заглавными буквами"),
    "emotion_desire":              ("эмоция_желание",               "Апелляция к желанию приобрести"),
    "emotion_humor":               ("эмоция_юмор",                  "Юмор или шутка"),
    "emotion_surprise":            ("эмоция_удивление",             "Удивление или вау-эффект"),
    "emotion_recognition":         ("эмоция_узнавание",             "Узнавание ситуации «и у меня так»"),
    "emotion_asmr":                ("эмоция_асмр",                  "АСМР или сенсорное удовольствие"),
    "emotion_frustration":         ("эмоция_раздражение",          "Показ боли или раздражения"),
    "pacing_fast":                 ("быстрый_монтаж",               "Быстрый темп монтажа"),
    "pacing_medium":               ("средний_монтаж",               "Средний темп монтажа"),
    "pacing_slow":                 ("медленный_монтаж",             "Медленный темп монтажа"),
    "high_cuts":                   ("много_склеек",                  "4 и более склеек на 10 секунд"),
    "product_early_show":          ("товар_первые_3_секунды",       "Товар появляется в первые 3 секунды"),
}


def extract_tags(features: dict) -> list[str]:
    """Convert structured feature JSON to flat tag list (Python, no LLM)."""
    if "error" in features:
        return []

    tags: list[str] = []

    f2s = features.get("first_2s") or {}
    shown = f2s.get("what_shown") or ""
    # LLM sometimes returns pipe-separated multi-values; tag each individually
    for item in (v.strip() for v in shown.split("|") if v.strip()):
        tags.append(f"first2s_{item}")

    ns = features.get("narrative_structure") or ""
    if ns:
        tags.append(f"narrative_{ns}")

    human = features.get("human_in_frame") or {}
    presence = human.get("presence") or ""
    for item in (v.strip() for v in presence.split("|") if v.strip()):
        tags.append(f"human_{item}")
    if human.get("speaks_to_camera"):
        tags.append("speaks_to_camera")

    audio = features.get("audio") or {}
    audio_type = audio.get("type") or ""
    if audio_type:
        tags.append(f"audio_{audio_type}")

    ost = features.get("on_screen_text") or {}
    if ost.get("present"):
        tags.append("has_onscreen_text")
        func = ost.get("function") or ""
        if func:
            tags.append(f"text_{func}")

    emotion = features.get("emotion_target") or ""
    for item in (v.strip() for v in emotion.split("|") if v.strip()):
        tags.append(f"emotion_{item}")

    pacing = features.get("pacing") or {}
    tempo = pacing.get("perceived_tempo") or ""
    if tempo:
        tags.append(f"pacing_{tempo}")
    if (pacing.get("cuts_per_10s") or 0) >= 4:
        tags.append("high_cuts")

    prod = features.get("product_show_timing") or {}
    first_app = prod.get("first_appearance_sec")
    if first_app is not None and first_app <= 3:
        tags.append("product_early_show")

    return tags


# ── Pattern comparison (Step B) — pure Python, no LLM ────────────────────────

def build_tag_dataframe(top_features: list[dict], mid_features: list[dict]) -> list[dict]:
    """Compute pct_top and pct_bottom per tag across both pools."""
    top_tags = [set(extract_tags(f)) for f in top_features]
    mid_tags = [set(extract_tags(f)) for f in mid_features]

    all_tags: set[str] = set()
    for tags in top_tags + mid_tags:
        all_tags.update(tags)

    n_top = len(top_features)
    n_mid = len(mid_features)

    rows: list[dict] = []
    for tag in sorted(all_tags):
        cnt_top = sum(1 for tags in top_tags if tag in tags)
        cnt_mid = sum(1 for tags in mid_tags if tag in tags)
        pct_top = cnt_top / n_top if n_top > 0 else 0.0
        pct_bot = cnt_mid / n_mid if n_mid > 0 else 0.0
        rows.append({
            "tag": tag,
            "pct_top": pct_top,
            "pct_bottom": pct_bot,
            "cnt_top": cnt_top,
            "cnt_bottom": cnt_mid,
            "n_top": n_top,
            "n_bottom": n_mid,
        })

    return rows


# ── Sharp threshold (Step 3) ──────────────────────────────────────────────────

def apply_sharp_filter(rows: list[dict]) -> list[dict]:
    """Hard cutoff: pct_top ≥ 0.80, pct_bottom ≤ 0.20, diff ≥ 0.60."""
    return [
        p for p in rows
        if p["pct_top"] >= 0.80
        and p["pct_bottom"] <= 0.20
        and (p["pct_top"] - p["pct_bottom"]) >= 0.60
    ]


# ── LOO cross-validation (Step 4) ─────────────────────────────────────────────

def loo_validate(patterns: list[dict], top_features: list[dict]) -> list[dict]:
    """
    Leave-one-out cross-validation. Pure Python, no LLM calls.
    Removes each top video once, recomputes pct_top.
    Pattern is robust if ≥80% of LOO runs still give pct_top ≥ 0.80.
    """
    all_top_tags = [set(extract_tags(f)) for f in top_features]
    loo_n = min(15, len(top_features))
    robust: list[dict] = []

    for p in patterns:
        tag = p["tag"]
        pass_count = 0

        for i in range(loo_n):
            reduced = [tags for j, tags in enumerate(all_top_tags) if j != i]
            cnt = sum(1 for tags in reduced if tag in tags)
            pct = cnt / len(reduced) if reduced else 0.0
            if pct >= 0.80:
                pass_count += 1

        p["loo_pass"] = pass_count
        p["loo_n"] = loo_n
        p["loo_robust"] = pass_count >= max(1, int(loo_n * 0.80))

        if p["loo_robust"]:
            robust.append(p)

    return robust


# ── Russian validator (Step 5) ────────────────────────────────────────────────

def is_russian(text: str) -> bool:
    cyrillic = sum(1 for c in text if 'а' <= c.lower() <= 'я' or c.lower() == 'ё')
    letters = sum(1 for c in text if c.isalpha())
    return letters == 0 or cyrillic / letters >= 0.80


_ENGLISH_MAPPING = (
    "desire → желание\n"
    "hook → зацепка\n"
    "CTA → призыв_к_действию\n"
    "call to action → призыв к действию\n"
    "engagement → вовлечённость\n"
    "conversion → конверсия\n"
    "content → контент\n"
    "trending → трендовый\n"
    "storytelling → сторителлинг\n"
    "haul → хаул\n"
    "punchline → панчлайн\n"
    "before after → до_после\n"
)


def validate_russian(pattern: dict, gem: genai.Client) -> dict:
    """Validate name/description ≥80% Cyrillic; auto-retry with strict instruction."""
    name = pattern.get("name", "")
    description = pattern.get("description", "")

    if is_russian(name) and is_russian(description):
        return pattern

    retry_prompt = (
        "Переведи эти поля СТРОГО на русский язык (≥80% кириллических букв).\n"
        "НЕ используй английские термины — даже в скобках, даже в терминологии.\n\n"
        f"Таблица замен:\n{_ENGLISH_MAPPING}\n"
        f"name: {name}\n"
        f"description: {description}\n\n"
        'Output ONLY JSON без markdown: {"name": "...", "description": "..."}'
    )
    try:
        resp = gem.models.generate_content(model="gemini-2.5-flash", contents=retry_prompt)
        text = resp.text.strip()
        if text.startswith("```"):
            text = text.split("```")[1].lstrip("json\n")
        result = json.loads(text)
        pattern["name"] = result.get("name", name)
        pattern["description"] = result.get("description", description)
    except Exception as e:
        print(f"  ! russian retry parse failed: {e}")

    return pattern


# ── Final description generation (Step C) ─────────────────────────────────────

def generate_pattern_descriptions(
    patterns: list[dict], gem: genai.Client
) -> tuple[list[dict], int]:
    """
    One LLM call to generate Russian descriptions for all LOO-robust patterns.
    Returns (enriched_patterns, tokens_used).
    """
    if not patterns:
        return [], 0

    summaries = []
    for p in patterns:
        name_hint, _ = TAG_NAMES.get(p["tag"], (p["tag"], ""))
        summaries.append({
            "tag": p["tag"],
            "name_hint": name_hint,
            "pct_top": round(p["pct_top"], 2),
            "pct_bottom": round(p["pct_bottom"], 2),
            "cnt_top": p["cnt_top"],
            "cnt_bottom": p["cnt_bottom"],
            "n_top": p["n_top"],
            "n_bottom": p["n_bottom"],
        })

    prompt = (
        "Ты — chief content strategist для ContentRadar (аналитика WB-селлеров).\n\n"
        "Паттерны прошли sharp-порог и LOO-валидацию — они статистически отличают топ от средних.\n"
        "Все поля output СТРОГО на русском языке. НЕ используй английские термины:\n"
        "desire→желание, hook→зацепка, CTA→призыв_к_действию, storytelling→сторителлинг,\n"
        "content→контент, trending→трендовый, haul→хаул.\n\n"
        f"Паттерны:\n{json.dumps(summaries, ensure_ascii=False)}\n\n"
        "Для каждого паттерна:\n"
        "- name: короткое русское название-ярлык (используй name_hint как основу, snake_case кириллицей)\n"
        "- description: 1-2 предложения — что именно делают топ-ролики и почему это важно\n"
        "- distinguishing_signal: факт с цифрами (для UI-карточки)\n"
        "- evidence: «N из M топов vs A из B средних»\n"
        "- actionable: конкретное действие «что создатель делает завтра»\n\n"
        "Output ONLY JSON без markdown:\n"
        '{"patterns": [{"tag": "...", "name": "...", "description": "...", '
        '"distinguishing_signal": "...", "evidence": "...", "actionable": "..."}]}'
    )

    resp = gem.models.generate_content(model="gemini-2.5-flash", contents=prompt)
    tokens = resp.usage_metadata.total_token_count

    try:
        text = resp.text.strip()
        if text.startswith("```"):
            text = text.split("```")[1].lstrip("json\n")
        result = json.loads(text)
        generated = {p["tag"]: p for p in result.get("patterns", [])}

        for p in patterns:
            gen = generated.get(p["tag"], {})
            name_ru, desc_ru = TAG_NAMES.get(p["tag"], (p["tag"], p["tag"]))
            p["name"] = gen.get("name", name_ru)
            p["description"] = gen.get("description", desc_ru)
            p["distinguishing_signal"] = gen.get(
                "distinguishing_signal",
                f"{name_ru}: {round(p['pct_top'] * 100)}% топ vs {round(p['pct_bottom'] * 100)}% средних",
            )
            p["evidence"] = gen.get(
                "evidence",
                f"{p['cnt_top']} из {p['n_top']} топов vs {p['cnt_bottom']} из {p['n_bottom']} средних",
            )
            p["actionable"] = gen.get("actionable", "")
            p["confidence"] = "sharp"

    except Exception as e:
        print(f"  ! generate descriptions parse failed: {e}")
        for p in patterns:
            name_ru, desc_ru = TAG_NAMES.get(p["tag"], (p["tag"], p["tag"]))
            p["name"] = name_ru
            p["description"] = desc_ru
            p["distinguishing_signal"] = (
                f"{name_ru}: {round(p['pct_top'] * 100)}% топ vs {round(p['pct_bottom'] * 100)}% средних"
            )
            p["evidence"] = (
                f"{p['cnt_top']} из {p['n_top']} топов vs {p['cnt_bottom']} из {p['n_bottom']} средних"
            )
            p["actionable"] = ""
            p["confidence"] = "sharp"

    return patterns, tokens


# ── Telegram alert ────────────────────────────────────────────────────────────

def send_telegram(message: str) -> None:
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.getenv("TELEGRAM_CHAT_ID", "")
    if not bot_token or not chat_id:
        return
    try:
        import urllib.request
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        payload = json.dumps({"chat_id": chat_id, "text": message, "parse_mode": "HTML"}).encode()
        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        print(f"  ! telegram failed: {e}")


# ── State file for consecutive failure tracking ───────────────────────────────

def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except Exception:
            pass
    return {}


def save_state(state: dict) -> None:
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2))


# ── Per-tenant run ────────────────────────────────────────────────────────────

def run_tenant(tenant: dict, conn, gem: genai.Client, oai: OpenAI) -> str:
    """Returns "ok" | "skipped:<reason>" | "failed:<reason>"."""
    tenant_id = str(tenant["id"])
    tenant_name = tenant["name"]

    print(f"\n{'='*60}")
    print(f"Tenant: {tenant_name} ({tenant_id})")

    videos = get_tenant_videos(conn, tenant_id)
    passes, reason = check_gate(videos)
    if not passes:
        print(f"  Gate: SKIP — {reason}")
        return f"skipped:{reason}"

    print(f"  Gate: OK — {len(videos)} videos")
    top, mid = split_top_middle(videos, TOP_N, MID_N)
    pool = top + mid
    print(f"  Pool: top={len(top)}, mid={len(mid)}")

    # Download
    with ThreadPoolExecutor(max_workers=3) as ex:
        downloads = list(ex.map(download_video, pool))
    pool_mp4 = [(r, mp4) for r, mp4 in zip(pool, downloads) if mp4]
    print(f"  Downloads: {len(pool_mp4)}/{len(pool)}")

    if len(pool_mp4) < 6:
        return "failed:too few downloads"

    # Transcribe
    transcripts: dict[str, str] = {}
    for r, mp4 in pool_mp4:
        try:
            transcripts[r["id"]] = transcribe(mp4, oai)
        except Exception as e:
            print(f"  ! whisper failed {r['id']}: {e}")
            transcripts[r["id"]] = ""

    # Per-video feature extraction (Step A — LLM per video, cached)
    total_tokens = 0
    features: list[dict] = []
    for r, mp4 in pool_mp4:
        feat = analyze_video(mp4, transcripts.get(r["id"], ""), r, gem)
        feat["_bucket"] = "top" if r in top else "mid"
        features.append(feat)
        total_tokens += feat.get("_tokens", 0)
        print(f"  analyzed {r['id']} ({feat.get('_bucket')}) tokens={feat.get('_tokens', 0)}")

    top_feats = [f for f in features if f.get("_bucket") == "top" and "error" not in f]
    mid_feats = [f for f in features if f.get("_bucket") == "mid" and "error" not in f]

    if len(top_feats) < 3 or len(mid_feats) < 3:
        return f"failed:not enough valid features top={len(top_feats)} mid={len(mid_feats)}"

    cost_usd = (total_tokens / 1_000_000) * 0.30

    period_end = date.today()
    period_start = period_end - timedelta(days=6)

    # Step B: Python-only tag comparison (no LLM — LOO can recompute this cheaply)
    all_patterns = build_tag_dataframe(top_feats, mid_feats)

    # Step 3: Sharp threshold hard cutoff
    sharp = apply_sharp_filter(all_patterns)
    print(f"  Sharp patterns: {len(sharp)}/{len(all_patterns)}")

    if not sharp:
        cold = {
            "patterns": [],
            "cold_state": True,
            "reason": "недостаточно данных для уверенного вывода, накапливаем",
        }
        save_insight(conn, tenant_id, period_start, period_end, cold, len(pool_mp4), cost_usd)
        print("  Cold state: no patterns passed sharp threshold")
        return "ok"

    # Step 4: LOO cross-validation (Python, no LLM)
    robust = loo_validate(sharp, top_feats)
    print(f"  LOO-robust patterns: {len(robust)}/{len(sharp)}")

    if not robust:
        cold = {
            "patterns": [],
            "cold_state": True,
            "reason": "недостаточно данных для уверенного вывода, накапливаем",
        }
        save_insight(conn, tenant_id, period_start, period_end, cold, len(pool_mp4), cost_usd)
        print("  Cold state: no patterns survived LOO validation")
        return "ok"

    # Cap at MAX_PATTERNS, pick highest pct_top
    robust.sort(key=lambda p: -(p["pct_top"] - p["pct_bottom"]))
    robust = robust[:MAX_PATTERNS]

    # Step C: One LLM call for surviving patterns
    robust, desc_tokens = generate_pattern_descriptions(robust, gem)
    total_tokens += desc_tokens

    # Step 5: Russian validator with auto-retry per pattern
    validated: list[dict] = []
    for p in robust:
        p = validate_russian(p, gem)
        if is_russian(p.get("name", "")) and is_russian(p.get("description", "")):
            validated.append(p)
        else:
            print(f"  ! pattern {p.get('tag')} dropped: failed Russian after retry")

    cost_usd = (total_tokens / 1_000_000) * 0.30

    if not validated:
        cold = {
            "patterns": [],
            "cold_state": True,
            "reason": "недостаточно данных для уверенного вывода, накапливаем",
        }
        save_insight(conn, tenant_id, period_start, period_end, cold, len(pool_mp4), cost_usd)
        return "ok"

    patterns_dict = {"patterns": validated}

    if cost_usd > COST_BUDGET_USD:
        print(f"  ! cost ${cost_usd:.3f} exceeds budget ${COST_BUDGET_USD}")
    else:
        print(f"  Cost: ${cost_usd:.4f} ({total_tokens} tokens)")

    save_insight(conn, tenant_id, period_start, period_end,
                 patterns_dict, len(pool_mp4), cost_usd)

    n_patterns = len(validated)
    print(f"  Saved: {n_patterns} patterns, period {period_start} → {period_end}")
    return "ok"


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tenant-id", help="Run for one tenant only (debug)")
    args = ap.parse_args()

    gem = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    oai = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    conn = get_conn()

    tenants = get_tenants_for_analysis(conn, args.tenant_id)
    print(f"Tenants to process: {len(tenants)}")

    state = load_state()
    results: dict[str, str] = {}

    for tenant in tenants:
        tid = str(tenant["id"])
        try:
            status = run_tenant(tenant, conn, gem, oai)
        except Exception as e:
            status = f"failed:{e}"
            print(f"  !! exception for {tenant['name']}: {e}")

        results[tid] = status

        # Track consecutive failures per tenant
        prev_failures = state.get(tid, {}).get("consecutive_failures", 0)
        if status.startswith("failed"):
            consecutive = prev_failures + 1
            state[tid] = {"consecutive_failures": consecutive, "last_status": status}
            if consecutive >= 3:
                send_telegram(
                    f"⚠️ <b>ContentRadar pipeline</b>\n"
                    f"Tenant <code>{tenant['name']}</code> failed {consecutive} times in a row.\n"
                    f"Last error: {status}"
                )
        else:
            state[tid] = {"consecutive_failures": 0, "last_status": status}

    save_state(state)

    ok = sum(1 for s in results.values() if s == "ok")
    skipped = sum(1 for s in results.values() if s.startswith("skipped"))
    failed = sum(1 for s in results.values() if s.startswith("failed"))

    summary = f"pattern_analysis: ok={ok} skipped={skipped} failed={failed}"
    print(f"\n{summary}")

    db_status = "ok" if failed == 0 else "partial" if ok > 0 else "fail"
    update_scraper_state(conn, db_status, summary)
    conn.close()

    if failed > 0 and ok == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
