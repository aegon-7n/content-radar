"""
TRU-344: Production pattern-analysis pipeline.

Queries prod DB, downloads top videos via yt-dlp, analyzes with Gemini 2.5 Flash,
saves results to tenant_insights.  Runs weekly via cron (Monday 04:00 UTC).

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


# ── Comparative analysis → JSON patterns ─────────────────────────────────────

def comparative_analysis(top_features: list[dict], mid_features: list[dict],
                         gem: genai.Client) -> tuple[dict, int]:
    """
    Returns (patterns_dict, total_tokens).
    patterns_dict = {"patterns": [{distinguishing_signal, evidence, actionable, confidence}]}
    """
    prompt = f"""Ты — chief content strategist для ContentRadar (аналитика WB-селлеров).

ВХОДНЫЕ ДАННЫЕ:
- TOP-{len(top_features)} ролики (по просмотрам): {json.dumps(top_features, ensure_ascii=False)}
- MIDDLE-{len(mid_features)} ролики (медиана): {json.dumps(mid_features, ensure_ascii=False)}

ЗАДАЧА: Найди РОВНО 2-3 ОТЛИЧАЮЩИХ паттерна (не больше 3).
Паттерн должен пройти ОБА теста:
1. Тест отличия: встречается ≥70% top vs ≤30% middle (или наоборот).
2. Тест применимости: «креатор прочитал и завтра конкретно делает Y».

ЗАПРЕЩЕНО (банальности):
- «используйте сильный хук», «снимайте динамично», «добавьте текст»
- обобщения без числовой поддержки

Для каждого паттерна:
- confidence: "sharp" (≥70/30 разрыв надёжно) или "medium" (50-70% разрыв, но тест пройден)

Output ТОЛЬКО JSON без markdown-обёртки:
{{
  "patterns": [
    {{
      "distinguishing_signal": "конкретный сигнал с цифрами",
      "evidence": "X из Y топов vs A из B средних",
      "actionable": "конкретное действие завтра",
      "confidence": "sharp"
    }}
  ]
}}"""

    resp = gem.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
    )

    try:
        text = resp.text.strip()
        if text.startswith("```"):
            text = text.split("```")[1].lstrip("json\n")
        result = json.loads(text)
    except Exception as e:
        print(f"  ! comparative parse failed: {e}")
        result = {"patterns": []}

    tokens = resp.usage_metadata.total_token_count
    return result, tokens


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

    # Per-video analysis
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

    # Comparative analysis
    patterns_dict, cmp_tokens = comparative_analysis(top_feats, mid_feats, gem)
    total_tokens += cmp_tokens

    # Cost estimate: Gemini 2.5 Flash = $0.075/1M input + ~$0.30/1M output
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
