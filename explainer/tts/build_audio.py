"""Synthesize every beat to audio/beats/<beat>.wav, cached by (provider, model, voice, style, text).

A beat is re-requested only when its cache key changes; the key never includes an API key.
Usage: build_audio.py [--provider gemini|cartesia] [--scene N]
"""

import argparse
import json
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from synth import CONFIG, VIDEO_DIR, cache_key, style_for, synthesize, voice_for  # noqa: E402

WORKERS = 4
BEATS_DIR = VIDEO_DIR / "audio" / "beats"


def beat_paths(beat_id: str) -> tuple[Path, Path]:
    scene, n = beat_id.split(".")
    stem = f"s{int(scene):02d}_b{int(n):02d}"
    return BEATS_DIR / f"{stem}.wav", BEATS_DIR / f"{stem}.json"


def is_fresh(meta: Path, key: str) -> bool:
    return meta.exists() and json.loads(meta.read_text()).get("key") == key


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--provider", default=CONFIG["provider"])
    parser.add_argument("--scene", type=int)
    args = parser.parse_args()
    jobs = []
    for scene in json.loads((VIDEO_DIR / "narration" / "beats.json").read_text()):
        if args.scene and scene["scene"] != args.scene:
            continue
        for beat in scene["beats"]:
            role = beat.get("voice", "narrator")
            voice = voice_for(args.provider, role)
            key = cache_key(args.provider, voice, style_for(beat["kind"], role), beat["spoken_text"])
            wav, meta = beat_paths(beat["id"])
            if not is_fresh(meta, key):
                jobs.append((beat, key, wav, meta, voice, role))
    if not jobs:
        print("All beats are up to date.")
        return

    print(f"Synthesizing {len(jobs)} beats with {args.provider}", flush=True)
    lock, done, failures = threading.Lock(), 0, []

    def run(job):
        beat, key, wav, meta, voice, role = job
        synthesize(beat["spoken_text"], wav, beat["kind"], provider=args.provider, voice=voice, role=role)
        meta.write_text(json.dumps({"key": key, "provider": args.provider, "voice": voice,
                                    "beat": beat["id"], "spoken_text": beat["spoken_text"]}, indent=2))

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(run, job): job[0]["id"] for job in jobs}
        for future in as_completed(futures):
            with lock:
                done += 1
                try:
                    future.result()
                    status = futures[future]
                except Exception as exc:
                    failures.append(futures[future])
                    status = f"{futures[future]} FAILED ({type(exc).__name__})"
                filled = 30 * done // len(jobs)
                print(f"[{'#' * filled}{'.' * (30 - filled)}] {done}/{len(jobs)} {status}", flush=True)
    if failures:
        sys.exit(f"{len(failures)} beats failed: {', '.join(sorted(failures))}")


if __name__ == "__main__":
    main()
