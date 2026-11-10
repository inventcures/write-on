"""Assemble beat clips into one 48 kHz, -16 LUFS narration track per scene.

Writes audio/scene_XX.wav, timings/scene_XX.json (where each beat's speech starts in
its scene; the Manim scenes sync to these) and audio/manifest.json (every beat's duration).
"""

import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import pyloudnorm
import soundfile as sf
from scipy.signal import resample_poly

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tts"))
from build_audio import beat_paths  # noqa: E402
from synth import CONFIG, VIDEO_DIR  # noqa: E402

A = CONFIG["audio"]
RATE = A["rate"]
SILENCE_DB = -45.0
EDGE_MARGIN_S = 0.06


def trimmed(clip: np.ndarray, rate: int) -> np.ndarray:
    loud = np.where(np.abs(clip) > 10 ** (SILENCE_DB / 20))[0]
    margin = int(EDGE_MARGIN_S * rate)
    return clip[max(loud[0] - margin, 0): min(loud[-1] + margin, len(clip))]


def load_beat(beat_id: str) -> np.ndarray:
    clip, rate = sf.read(beat_paths(beat_id)[0], dtype="float64")
    if clip.ndim > 1:
        clip = clip.mean(axis=1)
    return resample_poly(trimmed(clip, rate), RATE, rate)


def silence(seconds: float) -> np.ndarray:
    return np.zeros(int(round(seconds * RATE)))


def build_scene(scene: dict, tail: float) -> tuple[np.ndarray, dict]:
    parts, cursor, beats = [silence(A["scene_lead"])], A["scene_lead"], []
    for beat in scene["beats"]:
        clip = load_beat(beat["id"])
        speech = len(clip) / RATE
        gap = A["gap_after"][beat["kind"]]
        beats.append({"id": beat["id"], "kind": beat["kind"], "start": round(cursor, 3),
                      "speech": round(speech, 3), "end": round(cursor + speech + gap, 3),
                      "display_text": beat["display_text"]})
        parts += [clip, silence(gap)]
        cursor += speech + gap
    parts.append(silence(tail))
    track = np.concatenate(parts)
    return track, {"scene": scene["scene"], "title": scene["title"],
                   "duration": round(len(track) / RATE, 3), "beats": beats}


def tempo_and_loudness(track: np.ndarray, out_path: Path, tempo: float) -> float:
    with tempfile.NamedTemporaryFile(suffix=".wav") as raw:
        sf.write(raw.name, track, RATE, subtype="FLOAT")
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", raw.name, "-af",
             f"atempo={tempo},loudnorm=I={A['lufs']}:TP={A['true_peak']}:LRA=11",
             "-ar", str(RATE), "-ac", "1", "-c:a", "pcm_s16le", str(out_path)],
            check=True,
        )
    return sf.info(out_path).duration


def rescale(timings: dict, factor: float, duration: float) -> dict:
    for beat in timings["beats"]:
        for key in ("start", "speech", "end"):
            beat[key] = round(beat[key] * factor, 3)
    timings["duration"] = round(duration, 3)
    return timings


def main() -> None:
    scenes = json.loads((VIDEO_DIR / "narration" / "beats.json").read_text())
    (VIDEO_DIR / "timings").mkdir(exist_ok=True)
    meter = pyloudnorm.Meter(RATE)
    manifest, total = {}, 0.0
    for scene in scenes:
        tail = A["final_tail"] if scene is scenes[-1] else A["scene_tail"]
        track, timings = build_scene(scene, tail)
        n = scene["scene"]
        out_path = VIDEO_DIR / "audio" / f"scene_{n:02d}.wav"
        duration = tempo_and_loudness(track, out_path, A["tempo_by_scene"].get(n, A["tempo"]))
        timings = rescale(timings, duration / timings["duration"], duration)
        (VIDEO_DIR / "timings" / f"scene_{n:02d}.json").write_text(
            json.dumps(timings, indent=2, ensure_ascii=False) + "\n")
        for beat in timings["beats"]:
            manifest[beat["id"]] = {"scene": n, "start_in_scene": beat["start"], "duration": beat["speech"]}
        total += duration
        lufs = meter.integrated_loudness(sf.read(out_path)[0])
        print(f"scene {n:02d}  {duration:6.1f}s  {lufs:6.1f} LUFS  {scene['title']}")
    (VIDEO_DIR / "audio" / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"total {int(total // 60)}:{total % 60:04.1f}")


if __name__ == "__main__":
    main()
