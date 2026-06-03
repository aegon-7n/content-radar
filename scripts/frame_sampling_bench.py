"""
TRU-368: Frame sampling benchmark.

Tests 3 strategies on 5 sample TikTok videos:
  a) native: Gemini video upload (~1fps internally)
  b) 2fps:   ffmpeg-extracted frames as image[] in Gemini
  c) 3fps:   ffmpeg-extracted frames as image[] in Gemini

Metrics per video × strategy:
  - unique visual elements detected (scene segments, actions, text overlays)
  - estimated cost ($)
  - latency (seconds)

Decision rule: switch to 2-3fps ONLY if ≥1.5× more unique elements detected.
Cost consideration: image[] at 2fps ≈ 2× tokens vs native for short clips.

Usage:
    GEMINI_API_KEY=... python scripts/frame_sampling_bench.py \
        --videos /tmp/tru310/videos \
        --out /tmp/bench_results.json

    # Optionally specify video IDs:
    --video-ids id1,id2,id3,id4,id5

Requirements: pip install google-genai
Binaries: ffmpeg on PATH (or ~/.local/bin/ffmpeg)
"""

import argparse
import base64
import json
import os
import subprocess
import time
from pathlib import Path

from google import genai

FFMPEG = os.getenv("FFMPEG_BIN", "ffmpeg")
if not Path(FFMPEG).exists():
    # Try common locations
    for candidate in ("~/.local/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"):
        p = Path(candidate).expanduser()
        if p.exists():
            FFMPEG = str(p)
            break

ELEMENT_PROMPT = """Ты — аналитик видео. Перечисли ВСЕ уникальные визуальные элементы:
- смены сцены / cut-переходы
- действия (демонстрация товара, распаковка, примерка и т.д.)
- текст на экране (точные слова если видны)
- эмоции / мимика говорящего
- продукт (когда появляется, как крупно)

Формат ответа — JSON:
{
  "scene_cuts": <int>,
  "unique_actions": ["...", "..."],
  "on_screen_texts": ["...", "..."],
  "product_appearances": <int>,
  "total_unique_elements": <int>
}
Только JSON, без markdown."""

# Gemini pricing: $0.075/1M input tokens (Flash)
# Each image ≈ 258 tokens; video uses ~1 token/frame internally up to a cap
COST_PER_1M_TOKENS = 0.075


def extract_frames(mp4: Path, fps: float, out_dir: Path) -> list[Path]:
    """Extract frames at given fps into out_dir. Returns sorted list of PNG paths."""
    out_dir.mkdir(parents=True, exist_ok=True)
    pattern = out_dir / "frame_%04d.png"
    cmd = [
        FFMPEG, "-y", "-i", str(mp4),
        "-vf", f"fps={fps}",
        "-q:v", "2",
        str(pattern),
    ]
    result = subprocess.run(cmd, capture_output=True, timeout=60)
    if result.returncode != 0:
        print(f"  ffmpeg failed: {result.stderr[:200]}")
        return []
    return sorted(out_dir.glob("frame_*.png"))


def run_native(mp4: Path, gem: genai.Client) -> dict:
    """Strategy a: native video upload."""
    t0 = time.time()
    file = gem.files.upload(file=str(mp4))
    while file.state.name == "PROCESSING":
        time.sleep(1)
        file = gem.files.get(name=file.name)
    if file.state.name == "FAILED":
        return {"error": "upload_failed"}

    resp = gem.models.generate_content(
        model="gemini-2.5-flash",
        contents=[file, ELEMENT_PROMPT],
    )
    latency = time.time() - t0
    tokens = resp.usage_metadata.total_token_count
    cost = tokens / 1_000_000 * COST_PER_1M_TOKENS

    try:
        text = resp.text.strip().lstrip("```json\n").rstrip("```")
        result = json.loads(text)
    except Exception:
        result = {"raw": resp.text[:200]}

    result["_strategy"] = "native"
    result["_tokens"] = tokens
    result["_cost_usd"] = round(cost, 6)
    result["_latency_s"] = round(latency, 2)
    return result


def run_frames(mp4: Path, fps: float, gem: genai.Client, tmp_dir: Path) -> dict:
    """Strategy b/c: ffmpeg frames as image array."""
    frames = extract_frames(mp4, fps, tmp_dir)
    if not frames:
        return {"error": "no_frames"}

    t0 = time.time()
    # Build content parts: images + prompt
    parts = []
    for frame_path in frames:
        img_bytes = frame_path.read_bytes()
        parts.append({
            "inline_data": {
                "mime_type": "image/png",
                "data": base64.b64encode(img_bytes).decode(),
            }
        })
    parts.append({"text": ELEMENT_PROMPT})

    resp = gem.models.generate_content(
        model="gemini-2.5-flash",
        contents=[{"parts": parts}],
    )
    latency = time.time() - t0
    tokens = resp.usage_metadata.total_token_count
    cost = tokens / 1_000_000 * COST_PER_1M_TOKENS

    try:
        text = resp.text.strip().lstrip("```json\n").rstrip("```")
        result = json.loads(text)
    except Exception:
        result = {"raw": resp.text[:200]}

    result["_strategy"] = f"{fps}fps"
    result["_frame_count"] = len(frames)
    result["_tokens"] = tokens
    result["_cost_usd"] = round(cost, 6)
    result["_latency_s"] = round(latency, 2)
    return result


def bench_video(mp4: Path, gem: genai.Client, tmp_root: Path) -> dict:
    vid_id = mp4.stem
    print(f"\n  Video: {vid_id}")
    results = {}

    # a) native
    print("    strategy: native ... ", end="", flush=True)
    r = run_native(mp4, gem)
    results["native"] = r
    print(f"elements={r.get('total_unique_elements', '?')} cost=${r.get('_cost_usd', '?')} latency={r.get('_latency_s', '?')}s")

    # b) 2fps
    tmp_2 = tmp_root / vid_id / "2fps"
    print("    strategy: 2fps ... ", end="", flush=True)
    r = run_frames(mp4, 2.0, gem, tmp_2)
    results["2fps"] = r
    print(f"frames={r.get('_frame_count', '?')} elements={r.get('total_unique_elements', '?')} cost=${r.get('_cost_usd', '?')} latency={r.get('_latency_s', '?')}s")

    # c) 3fps
    tmp_3 = tmp_root / vid_id / "3fps"
    print("    strategy: 3fps ... ", end="", flush=True)
    r = run_frames(mp4, 3.0, gem, tmp_3)
    results["3fps"] = r
    print(f"frames={r.get('_frame_count', '?')} elements={r.get('total_unique_elements', '?')} cost=${r.get('_cost_usd', '?')} latency={r.get('_latency_s', '?')}s")

    return results


def summarize(all_results: dict) -> dict:
    """Aggregate across videos and emit recommendation."""
    strategy_totals: dict[str, dict] = {}
    for _vid, strategies in all_results.items():
        for strategy, r in strategies.items():
            if "error" in r:
                continue
            t = strategy_totals.setdefault(strategy, {"elements": [], "cost": [], "latency": []})
            el = r.get("total_unique_elements")
            if el is not None:
                t["elements"].append(el)
            t["cost"].append(r.get("_cost_usd", 0))
            t["latency"].append(r.get("_latency_s", 0))

    summary: dict[str, dict] = {}
    for strategy, t in strategy_totals.items():
        n = len(t["elements"])
        summary[strategy] = {
            "avg_elements": round(sum(t["elements"]) / n, 1) if n else None,
            "avg_cost_usd": round(sum(t["cost"]) / len(t["cost"]), 5),
            "avg_latency_s": round(sum(t["latency"]) / len(t["latency"]), 1),
        }

    # Decision rule: switch from native only if 2fps gives ≥1.5× elements
    native_el = summary.get("native", {}).get("avg_elements") or 0
    fps2_el = summary.get("2fps", {}).get("avg_elements") or 0
    fps3_el = summary.get("3fps", {}).get("avg_elements") or 0

    if native_el > 0 and fps2_el >= native_el * 1.5:
        recommendation = "2fps" if fps2_el >= fps3_el * 0.9 else "3fps"
        rationale = f"2fps detects {fps2_el / native_el:.1f}× more elements vs native (threshold 1.5×)"
    else:
        recommendation = "native"
        rationale = (
            f"2fps gain ({fps2_el / native_el:.1f}×) below 1.5× threshold — "
            f"cost savings of native outweigh marginal element gain"
            if native_el > 0
            else "insufficient data"
        )

    return {"per_strategy": summary, "recommendation": recommendation, "rationale": rationale}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--videos", default="/tmp/tru310/videos", help="Directory with mp4 files")
    ap.add_argument("--video-ids", help="Comma-separated video IDs to test (default: 5 largest)")
    ap.add_argument("--out", default="/tmp/bench_results.json")
    ap.add_argument("--tmp-dir", default="/tmp/bench_frames")
    args = ap.parse_args()

    gem = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    videos_dir = Path(args.videos)
    tmp_dir = Path(args.tmp_dir)

    if args.video_ids:
        ids = [vid_id.strip() for vid_id in args.video_ids.split(",")]
        mp4s = [videos_dir / f"{vid_id}.mp4" for vid_id in ids]
        mp4s = [p for p in mp4s if p.exists()]
    else:
        all_mp4s = sorted(videos_dir.glob("*.mp4"), key=lambda p: p.stat().st_size, reverse=True)
        mp4s = all_mp4s[:5]

    if not mp4s:
        print("No videos found.")
        return

    print(f"Benchmarking {len(mp4s)} videos × 3 strategies...")
    all_results: dict[str, dict] = {}

    for mp4 in mp4s:
        all_results[mp4.stem] = bench_video(mp4, gem, tmp_dir)

    summary = summarize(all_results)

    out = {
        "videos": all_results,
        "summary": summary,
    }
    Path(args.out).write_text(json.dumps(out, ensure_ascii=False, indent=2))
    print(f"\n=== Summary ===")
    for strategy, stats in summary["per_strategy"].items():
        print(f"  {strategy}: elements={stats['avg_elements']} cost=${stats['avg_cost_usd']} latency={stats['avg_latency_s']}s")
    print(f"\nRecommendation: {summary['recommendation']}")
    print(f"Rationale: {summary['rationale']}")
    print(f"\nFull results saved to {args.out}")


if __name__ == "__main__":
    main()
