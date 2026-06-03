"""
TRU-368: Frame sampling benchmark.

Tests 3 strategies for visual element detection on TikTok/YT short videos:
  a) Native Gemini video upload (~1 fps baseline)
  b) ffmpeg-extracted frames at 2 fps as image[] in Gemini Flash
  c) ffmpeg-extracted frames at 3 fps as image[] in Gemini Flash

Metrics per strategy × video: unique_elements, cost_usd, latency_sec.

Usage on VPS (needs GEMINI_API_KEY):
    cd /root/content-radar
    source scraper/venv/bin/activate
    pip install google-genai  # if not already
    python scripts/bench_frame_sampling.py \\
        --video-dir /tmp/tru310/videos \\
        --output /tmp/tru310/bench_results.json

    # optionally restrict to specific video IDs:
    python scripts/bench_frame_sampling.py \\
        --video-ids a3e4ed95 0ab0dbe5 1b0ed650 6572d4ad 4f8c3350

Results are written to --output as JSON and also printed as a markdown table.
"""

import argparse
import json
import os
import subprocess
import tempfile
import time
from pathlib import Path

# ── Gemini pricing (2025-06) ──────────────────────────────────────────────────
# gemini-2.5-flash: $0.30/1M output tokens, $0.075/1M input text tokens
# image tokens: 258 tokens per 1024x1024 image (standard pricing)
# video (native): billed as if images, processed internally at ~1fps
COST_PER_1M_TOKENS = 0.30

# Selected benchmark videos: 2 top, 2 bottom, 1 mid
# Override with --video-ids if needed
DEFAULT_VIDEO_IDS = [
    "a3e4ed95",  # top1 — 5M views
    "0ab0dbe5",  # top2 — 3.8M views
    "1b0ed650",  # top3 — 2.7M views (TikTok)
    "6572d4ad",  # bot1 — 8.8K views (TikTok)
    "4f8c3350",  # mid  — 899K views
]

PROMPT = """Ты — аналитик видео для ContentRadar.

Перечисли ВСЕ уникальные визуальные элементы, действия и on-screen текст которые ты видишь в этом видео.
Будь максимально детальным — каждый отдельный текстовый блок, действие, объект, смена сцены.

Output JSON:
{
  "elements": ["элемент1", "элемент2", ...],
  "total_unique": <int>
}"""


def get_video_path(video_dir: Path, video_id_prefix: str) -> Path | None:
    for ext in ("mp4", "webm", "mkv"):
        for candidate in video_dir.glob(f"{video_id_prefix}*.{ext}"):
            return candidate
    return None


def count_unique(elements: list) -> int:
    return len(set(str(e).lower().strip() for e in elements))


def strategy_a_native(video_path: Path, gem) -> dict:
    """Native Gemini video upload (~1 fps internally)."""
    t0 = time.time()

    file = gem.files.upload(file=str(video_path))
    while file.state.name == "PROCESSING":
        time.sleep(2)
        file = gem.files.get(name=file.name)

    if file.state.name == "FAILED":
        return {"error": "upload_failed"}

    resp = gem.models.generate_content(
        model="gemini-2.5-flash",
        contents=[file, PROMPT],
    )

    latency = time.time() - t0
    tokens = resp.usage_metadata.total_token_count
    cost = (tokens / 1_000_000) * COST_PER_1M_TOKENS

    try:
        text = resp.text.strip()
        if text.startswith("```"):
            text = text.split("```")[1].lstrip("json\n")
        result = json.loads(text)
        elements = result.get("elements", [])
    except Exception:
        elements = []

    return {
        "strategy": "a_native",
        "unique_elements": count_unique(elements),
        "elements_raw": elements[:20],
        "tokens": tokens,
        "cost_usd": round(cost, 5),
        "latency_sec": round(latency, 1),
    }


def extract_frames(video_path: Path, fps: float, out_dir: Path) -> list[Path]:
    """Extract frames at given fps using ffmpeg."""
    out_dir.mkdir(parents=True, exist_ok=True)
    pattern = out_dir / "frame_%04d.jpg"
    cmd = [
        "ffmpeg", "-y", "-i", str(video_path),
        "-vf", f"fps={fps}",
        "-q:v", "3",
        str(pattern),
    ]
    result = subprocess.run(cmd, capture_output=True, timeout=60)
    if result.returncode != 0:
        print(f"  ! ffmpeg failed: {result.stderr[:200]}")
        return []
    frames = sorted(out_dir.glob("frame_*.jpg"))
    return frames


def strategy_images(video_path: Path, fps: float, label: str, gem) -> dict:
    """Extract at given fps, send as image[] to Gemini Flash."""
    t0 = time.time()

    with tempfile.TemporaryDirectory() as tmpdir:
        frames = extract_frames(video_path, fps, Path(tmpdir))
        if not frames:
            return {"error": "ffmpeg_failed", "strategy": label}

        n_frames = len(frames)

        # Upload frames as inline images
        from google.genai import types as genai_types

        parts = []
        for frame_path in frames:
            with open(frame_path, "rb") as f:
                image_bytes = f.read()
            parts.append(genai_types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"))
        parts.append(genai_types.Part.from_text(text=PROMPT))

        resp = gem.models.generate_content(
            model="gemini-2.5-flash",
            contents=genai_types.Content(parts=parts, role="user"),
        )

    latency = time.time() - t0
    tokens = resp.usage_metadata.total_token_count
    cost = (tokens / 1_000_000) * COST_PER_1M_TOKENS

    try:
        text = resp.text.strip()
        if text.startswith("```"):
            text = text.split("```")[1].lstrip("json\n")
        result = json.loads(text)
        elements = result.get("elements", [])
    except Exception:
        elements = []

    return {
        "strategy": label,
        "fps": fps,
        "n_frames": n_frames,
        "unique_elements": count_unique(elements),
        "elements_raw": elements[:20],
        "tokens": tokens,
        "cost_usd": round(cost, 5),
        "latency_sec": round(latency, 1),
    }


def bench_video(video_path: Path, video_id: str, gem) -> dict:
    """Run all 3 strategies on one video."""
    print(f"\n  Video: {video_id} ({video_path.name})")

    results = {}

    print("    → strategy a (native)...")
    results["a"] = strategy_a_native(video_path, gem)
    print(f"       unique={results['a'].get('unique_elements')} "
          f"cost=${results['a'].get('cost_usd')} "
          f"lat={results['a'].get('latency_sec')}s")

    print("    → strategy b (2 fps)...")
    results["b"] = strategy_images(video_path, 2.0, "b_2fps", gem)
    print(f"       unique={results['b'].get('unique_elements')} "
          f"frames={results['b'].get('n_frames')} "
          f"cost=${results['b'].get('cost_usd')} "
          f"lat={results['b'].get('latency_sec')}s")

    print("    → strategy c (3 fps)...")
    results["c"] = strategy_images(video_path, 3.0, "c_3fps", gem)
    print(f"       unique={results['c'].get('unique_elements')} "
          f"frames={results['c'].get('n_frames')} "
          f"cost=${results['c'].get('cost_usd')} "
          f"lat={results['c'].get('latency_sec')}s")

    return {"video_id": video_id, "strategies": results}


def print_summary(all_results: list[dict]) -> str:
    """Print markdown summary table and return recommendation."""
    lines = []
    lines.append("\n## Frame Sampling Benchmark Results\n")
    lines.append("| Video | Strategy A (native) | Strategy B (2fps) | Strategy C (3fps) |")
    lines.append("|-------|---------------------|-------------------|-------------------|")

    totals = {"a": [], "b": [], "c": []}

    for r in all_results:
        vid = r["video_id"][:8]
        s = r["strategies"]

        def fmt(strat_key):
            d = s.get(strat_key, {})
            if "error" in d:
                return f"ERR"
            return (f"u={d.get('unique_elements',0)} "
                    f"${d.get('cost_usd',0):.4f} "
                    f"{d.get('latency_sec',0)}s")

        lines.append(f"| {vid}... | {fmt('a')} | {fmt('b')} | {fmt('c')} |")

        for k in ("a", "b", "c"):
            d = s.get(k, {})
            if "error" not in d:
                totals[k].append(d.get("unique_elements", 0))

    lines.append("\n### Averages\n")
    for k, label in [("a", "Native ~1fps"), ("b", "2fps"), ("c", "3fps")]:
        vals = totals[k]
        if vals:
            avg = sum(vals) / len(vals)
            lines.append(f"- **{label}**: avg {avg:.1f} unique elements")

    # Recommendation
    avg_a = sum(totals["a"]) / len(totals["a"]) if totals["a"] else 0
    avg_b = sum(totals["b"]) / len(totals["b"]) if totals["b"] else 0
    avg_c = sum(totals["c"]) / len(totals["c"]) if totals["c"] else 0

    lines.append("\n### Recommendation\n")
    if avg_b >= avg_a * 1.5:
        rec = "**B (2fps)** — ≥1.5× больше элементов vs native, разумная стоимость."
    elif avg_c >= avg_a * 1.5:
        rec = "**C (3fps)** — ≥1.5× больше элементов vs native (B не дотянул)."
    else:
        rec = "**A (native)** — прирост от ffmpeg < 1.5×, смысла переходить нет."

    lines.append(f"Рекомендация: {rec}")
    lines.append("\n_Per decision rule TRU-367: переход на 2–3 fps только если detect ≥1.5× и sharpness паттернов улучшится._")

    report = "\n".join(lines)
    print(report)
    return report


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video-dir", default="/tmp/tru310/videos",
                    help="Directory containing mp4 files")
    ap.add_argument("--video-ids", nargs="+", default=DEFAULT_VIDEO_IDS,
                    help="Video ID prefixes to benchmark (space-separated)")
    ap.add_argument("--output", default="/tmp/tru310/bench_results.json",
                    help="Output JSON file path")
    args = ap.parse_args()

    from google import genai
    gem = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

    video_dir = Path(args.video_dir)
    all_results = []

    print(f"Benchmarking {len(args.video_ids)} videos × 3 strategies")

    for vid_id in args.video_ids:
        video_path = get_video_path(video_dir, vid_id)
        if not video_path:
            print(f"  ! video not found for id prefix: {vid_id}")
            continue
        result = bench_video(video_path, vid_id, gem)
        all_results.append(result)

    report = print_summary(all_results)

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({
        "results": all_results,
        "report": report,
    }, ensure_ascii=False, indent=2))
    print(f"\nRaw results saved to {output}")


if __name__ == "__main__":
    main()
