"""
TRU-344 / TRU-368: Production pattern-analysis pipeline.

Queries prod DB, downloads top videos via yt-dlp, analyzes with Gemini 2.5 Flash,
saves results to tenant_insights.  Runs weekly via cron (Monday 04:00 UTC).

Quality gates (TRU-368):
- Top vs BOTTOM (not middle); bottom excludes <100 views.
- Sharp threshold: pct_top ≥ 0.80 AND pct_bottom ≤ 0.20 AND diff ≥ 0.60 — in Python, not prompt.
- LOO-robust: ≥80% of leave-one-out top runs still pass sharp threshold.
- Russian-only output (≥80% Cyrillic): auto-retry if LLM returns English.

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
from concurrent.futures import ThreadPoolExecutor
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
    YT_DLP = "yt-dlp"
FFMPEG = os.getenv("FFMPEG_BIN", "ffmpeg")
SOCKS_PROXY = os.getenv("SOCKS_PROXY", "")
COOKIES_FILE = APP_DIR / "scraper" / "youtube_cookies.txt"

# Gate thresholds
GATE_MIN_VIDEOS = 10
GATE_TOP_QUARTILE_RECENT = 3
GATE_RECENT_DAYS = 7

TOP_N = 15
BOTTOM_N = 15
BOTTOM_MIN_VIEWS = 100   # exclude zero-view noise from bottom group
MAX_PATTERNS = 3

# Sharp quality gates (TRU-368)
SHARP_PCT_TOP = 0.80
SHARP_PCT_BOTTOM = 0.20
SHARP_DIFF = 0.60
LOO_ROBUST_RATIO = 0.80  # ≥80% of LOO runs must pass

RUSSIAN_MIN_RATIO = 0.80  # ≥80% Cyrillic in name+description
RUSSIAN_MAX_RETRIES = 2

COST_BUDGET_USD = 0.15


# ── Database ──────────────────────────────────────────────────────────────────

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def get_tenants_for_analysis(conn, tenant_id_filter: str | None = None) -> list[dict]:
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    if tenant_id_filter:
        cur.execute("SELECT id, name FROM tenants WHERE id = %s", (tenant_id_filter,))
    else:
        cur.execute("SELECT id, name FROM tenants")
    return [dict(r) for r in cur.fetchall()]


def get_tenant_videos(conn, tenant_id: str) -> list[dict]:
    """Return all active videos with latest metrics, sorted by views DESC."""
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
    if len(videos) < GATE_MIN_VIDEOS:
        return False, f"only {len(videos)} videos (need {GATE_MIN_VIDEOS})"

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


def split_top_bottom(videos: list[dict], top_n: int, bottom_n: int) -> tuple[list, list]:
    """
    Top-N: highest views (already sorted desc).
    Bottom-N: lowest views, excluding videos with <BOTTOM_MIN_VIEWS (zero-view noise).
    """
    top = videos[:top_n]
    eligible_bottom = [v for v in videos if (v["views"] or 0) >= BOTTOM_MIN_VIEWS]
    bottom = list(reversed(eligible_bottom))[:bottom_n]
    # Exclude any overlap with top (shouldn't happen, but defensive)
    top_ids = {v["id"] for v in top}
    bottom = [v for v in bottom if v["id"] not in top_ids]
    return top, bottom


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


# ── Per-video feature extraction (Stage A) ────────────────────────────────────

def analyze_video(mp4: Path, transcript: str, row: dict, gem: genai.Client) -> dict:
    """
    Tag a single video with fixed taxonomy via Gemini 2.5 Flash.
    Cached per video_id — LOO reuses cache without extra LLM calls.
    """
    cache = ANALYSIS_DIR / f"{mp4.stem}.json"
    if cache.exists():
        stored = json.loads(cache.read_text())
        # Invalidate if previous run had a parse error
        if "error" not in stored:
            return stored

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

Извлеки СТРОГО структурированные признаки по ТОЧНОЙ таксономии ниже.
Если не уверен — ставь null. Не выдумывай.

Output JSON (только JSON, без markdown-обёртки):
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
  "emotion_target": "желание|юмор|удивление|узнавание|асмр|раздражение",
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


# ── Pattern computation (Stage B) — pure Python, no LLM ─────────────────────

def _flatten(feat: dict) -> dict:
    """Flatten nested feature dict to key.subkey = value pairs."""
    flat: dict = {}
    for k, v in feat.items():
        if k.startswith("_"):
            continue
        if isinstance(v, dict):
            for sk, sv in v.items():
                if sv is not None and not isinstance(sv, (dict, list)):
                    flat[f"{k}.{sk}"] = sv
        elif v is not None and not isinstance(v, list):
            flat[k] = v
    return flat


def compute_sharp_patterns(top_feats: list[dict], bottom_feats: list[dict]) -> list[dict]:
    """
    Compute pattern frequencies across top vs bottom groups.
    Returns patterns passing hard sharp thresholds:
      pct_top ≥ SHARP_PCT_TOP AND pct_bottom ≤ SHARP_PCT_BOTTOM AND diff ≥ SHARP_DIFF
    or the symmetric bottom-dominant version.
    """
    top_flat = [_flatten(f) for f in top_feats]
    bottom_flat = [_flatten(f) for f in bottom_feats]
    n_top, n_bottom = len(top_flat), len(bottom_flat)
    if n_top == 0 or n_bottom == 0:
        return []

    all_keys: set[str] = set()
    for row in top_flat + bottom_flat:
        all_keys.update(row.keys())

    patterns: list[dict] = []
    for key in all_keys:
        all_values: set = set()
        for row in top_flat + bottom_flat:
            v = row.get(key)
            if v is not None:
                all_values.add(v)

        for val in all_values:
            pct_top = sum(1 for r in top_flat if r.get(key) == val) / n_top
            pct_bottom = sum(1 for r in bottom_flat if r.get(key) == val) / n_bottom
            diff = pct_top - pct_bottom

            if pct_top >= SHARP_PCT_TOP and pct_bottom <= SHARP_PCT_BOTTOM and diff >= SHARP_DIFF:
                patterns.append({
                    "feature": key, "value": val,
                    "pct_top": round(pct_top, 3), "pct_bottom": round(pct_bottom, 3),
                    "differential": round(diff, 3),
                    "direction": "top_dominant",
                    "count_top": sum(1 for r in top_flat if r.get(key) == val),
                    "count_bottom": sum(1 for r in bottom_flat if r.get(key) == val),
                    "n_top": n_top, "n_bottom": n_bottom,
                })
            elif pct_bottom >= SHARP_PCT_TOP and pct_top <= SHARP_PCT_BOTTOM and (-diff) >= SHARP_DIFF:
                # Top avoids this — equally informative signal
                patterns.append({
                    "feature": key, "value": val,
                    "pct_top": round(pct_top, 3), "pct_bottom": round(pct_bottom, 3),
                    "differential": round(-diff, 3),
                    "direction": "bottom_dominant",
                    "count_top": sum(1 for r in top_flat if r.get(key) == val),
                    "count_bottom": sum(1 for r in bottom_flat if r.get(key) == val),
                    "n_top": n_top, "n_bottom": n_bottom,
                })

    # Sort by differential descending for deterministic output
    patterns.sort(key=lambda p: p["differential"], reverse=True)
    return patterns


def loo_validate(patterns: list[dict], top_feats: list[dict], bottom_feats: list[dict]) -> list[dict]:
    """
    Leave-one-out cross-validation across top group.
    For each pattern, remove one top video at a time and recompute pct_top.
    Robust if ≥ LOO_ROBUST_RATIO of runs still satisfy the sharp threshold.
    This is cheap — reuses cached tag data, no LLM calls.
    """
    top_flat = [_flatten(f) for f in top_feats]
    bottom_flat = [_flatten(f) for f in bottom_feats]
    n_top = len(top_flat)
    min_passes = max(1, round(n_top * LOO_ROBUST_RATIO))

    robust: list[dict] = []
    for p in patterns:
        key, val, direction = p["feature"], p["value"], p["direction"]
        passes = 0
        for i in range(n_top):
            loo_top = [r for j, r in enumerate(top_flat) if j != i]
            n_loo = len(loo_top)
            if n_loo == 0:
                continue
            pct_top_loo = sum(1 for r in loo_top if r.get(key) == val) / n_loo
            if direction == "top_dominant" and pct_top_loo >= SHARP_PCT_TOP:
                passes += 1
            elif direction == "bottom_dominant" and pct_top_loo <= SHARP_PCT_BOTTOM:
                passes += 1

        p["loo_passes"] = passes
        p["loo_total"] = n_top
        p["loo_robust"] = passes >= min_passes
        if p["loo_robust"]:
            robust.append(p)

    return robust


# ── Russian validator ─────────────────────────────────────────────────────────

def is_russian(text: str) -> bool:
    cyrillic = sum(1 for c in text if 'а' <= c.lower() <= 'я' or c.lower() == 'ё')
    letters = sum(1 for c in text if c.isalpha())
    return letters == 0 or cyrillic / letters >= RUSSIAN_MIN_RATIO


def _check_patterns_russian(patterns: list[dict]) -> bool:
    for p in patterns:
        combined = p.get("distinguishing_signal", "") + " " + p.get("actionable", "")
        if not is_russian(combined):
            return False
    return True


# ── Pattern description (Stage C) — LLM generates Russian text ───────────────

def describe_patterns_russian(sharp_patterns: list[dict], gem: genai.Client) -> tuple[dict, int]:
    """
    Given pre-computed sharp+LOO-robust patterns, ask LLM to generate
    Russian-language descriptions. Auto-retries if output is not Russian.

    Returns (patterns_dict, total_tokens).
    patterns_dict = {"patterns": [{distinguishing_signal, evidence, actionable, confidence}]}
    If no sharp patterns passed: returns empty patterns dict with cold_state flag.
    """
    if not sharp_patterns:
        return {
            "patterns": [],
            "cold_state": "недостаточно данных для уверенного вывода — накапливаем",
        }, 0

    patterns_summary = json.dumps(sharp_patterns[:MAX_PATTERNS], ensure_ascii=False)
    total_tokens = 0

    for attempt in range(1 + RUSSIAN_MAX_RETRIES):
        russian_instruction = "" if attempt == 0 else (
            "\n\nКРИТИЧЕСКИ ВАЖНО: выводи ТОЛЬКО на русском языке. "
            "Никаких английских слов, даже 'desire', 'hook', 'talking head', 'CTA'. "
            "Замени: desire→желание, hook→цепляющий старт, talking head→говорящая голова, "
            "before_after→до/после, demo→демонстрация, punchline→панчлайн/развязка."
        )

        prompt = f"""Ты — chief content strategist ContentRadar для WB-селлеров.

Ниже — статистически проверенные паттерны (уже прошли sharp + LOO-тест в Python):
{patterns_summary}

Для КАЖДОГО паттерна напиши краткое описание на русском языке:
- distinguishing_signal: что именно отличает топ от худших (с цифрами)
- evidence: «X из Y топ-роликов vs A из B худших»
- actionable: конкретное действие которое креатор делает завтра иначе
- confidence: "sharp" (всегда, т.к. уже прошли gate)

Output ТОЛЬКО JSON без markdown-обёртки:
{{
  "patterns": [
    {{
      "distinguishing_signal": "...",
      "evidence": "...",
      "actionable": "...",
      "confidence": "sharp"
    }}
  ]
}}{russian_instruction}"""

        resp = gem.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
        )
        total_tokens += resp.usage_metadata.total_token_count

        try:
            text = resp.text.strip()
            if text.startswith("```"):
                text = text.split("```")[1].lstrip("json\n")
            result = json.loads(text)
        except Exception as e:
            print(f"  ! describe_patterns parse failed (attempt {attempt}): {e}")
            result = {"patterns": []}

        out_patterns = result.get("patterns", [])
        if _check_patterns_russian(out_patterns):
            return result, total_tokens

        print(f"  ! Russian check failed (attempt {attempt}), retrying...")

    # Return whatever we have after exhausting retries
    print("  ! Could not get Russian output after retries — returning last result")
    return result, total_tokens


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
    top, bottom = split_top_bottom(videos, TOP_N, BOTTOM_N)
    if len(bottom) < 3:
        reason = f"not enough bottom videos (got {len(bottom)}, need 3)"
        print(f"  Split: SKIP — {reason}")
        return f"skipped:{reason}"

    pool = top + bottom
    print(f"  Pool: top={len(top)}, bottom={len(bottom)}")

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

    # Stage A: per-video feature tagging
    total_tokens = 0
    features: list[dict] = []
    top_ids = {v["id"] for v in top}
    for r, mp4 in pool_mp4:
        feat = analyze_video(mp4, transcripts.get(r["id"], ""), r, gem)
        feat["_bucket"] = "top" if r["id"] in top_ids else "bottom"
        features.append(feat)
        total_tokens += feat.get("_tokens", 0)
        print(f"  analyzed {r['id']} ({feat.get('_bucket')}) tokens={feat.get('_tokens', 0)}")

    top_feats = [f for f in features if f.get("_bucket") == "top" and "error" not in f]
    bottom_feats = [f for f in features if f.get("_bucket") == "bottom" and "error" not in f]

    if len(top_feats) < 3 or len(bottom_feats) < 3:
        return f"failed:not enough valid features top={len(top_feats)} bottom={len(bottom_feats)}"

    # Stage B: compute sharp patterns in Python
    sharp = compute_sharp_patterns(top_feats, bottom_feats)
    print(f"  Sharp patterns (pre-LOO): {len(sharp)}")

    # LOO cross-validation (no LLM calls)
    robust = loo_validate(sharp, top_feats, bottom_feats)
    print(f"  LOO-robust patterns: {len(robust)}")
    if not robust:
        print("  → 0 robust patterns: INSERT empty with cold_state")

    # Stage C: LLM generates Russian descriptions
    patterns_dict, desc_tokens = describe_patterns_russian(robust, gem)
    total_tokens += desc_tokens

    # Cost estimate: Gemini 2.5 Flash ~$0.30/1M tokens blended
    cost_usd = (total_tokens / 1_000_000) * 0.30

    if cost_usd > COST_BUDGET_USD:
        print(f"  ! cost ${cost_usd:.3f} exceeds budget ${COST_BUDGET_USD}")
    else:
        print(f"  Cost: ${cost_usd:.4f} ({total_tokens} tokens)")

    period_end = date.today()
    period_start = period_end - timedelta(days=6)

    save_insight(conn, tenant_id, period_start, period_end,
                 patterns_dict, len(pool_mp4), cost_usd)

    n_patterns = len(patterns_dict.get("patterns", []))
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
