"""Mux each rendered scene with its narration, concatenate, and write captions.

Usage:
    assemble.py            # low-quality preview -> output/preview.mp4
    assemble.py --final    # 1080p60 -> output/write-on-orientation.mp4 + .srt
"""

import argparse
import json
import subprocess
import tempfile
import textwrap
from pathlib import Path

from render import SCENES, VIDEO_DIR, video_path

MAX_CAPTION_CHARS = 84
LINE_CHARS = 44


def probe_duration(path: Path) -> float:
    out = subprocess.run(["ffmpeg", "-i", str(path)], capture_output=True, text=True).stderr
    h, m, s = out.split("Duration: ")[1].split(",")[0].split(":")
    return int(h) * 3600 + int(m) * 60 + float(s)


def mux(number: int, final: bool, out: Path) -> None:
    audio = VIDEO_DIR / "audio" / f"scene_{number:02d}.wav"
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(video_path(number, final)), "-i", str(audio),
         "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
         "-shortest", str(out)],
        check=True,
    )


def timestamp(seconds: float) -> str:
    ms = int(round(seconds * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def caption_chunks(text: str) -> list[str]:
    sentences, chunk = [], ""
    for word in text.split():
        candidate = f"{chunk} {word}".strip()
        if len(candidate) > MAX_CAPTION_CHARS and chunk:
            sentences.append(chunk)
            chunk = word
        else:
            chunk = candidate
        if chunk.endswith((".", "?", "!")) and len(chunk) > MAX_CAPTION_CHARS * 0.5:
            sentences.append(chunk)
            chunk = ""
    if chunk:
        sentences.append(chunk)
    return sentences


def write_captions(offsets: dict[int, float], out: Path) -> None:
    entries = []
    for number in sorted(offsets):
        timing = json.loads((VIDEO_DIR / "timings" / f"scene_{number:02d}.json").read_text())
        for beat in timing["beats"]:
            chunks = caption_chunks(beat["display_text"])
            total_chars = sum(len(c) for c in chunks)
            cursor = offsets[number] + beat["start"]
            for chunk in chunks:
                span = beat["speech"] * len(chunk) / total_chars
                entries.append((cursor, cursor + span, "\n".join(textwrap.wrap(chunk, LINE_CHARS, break_on_hyphens=False))))
                cursor += span
    out.write_text("".join(f"{i}\n{timestamp(a)} --> {timestamp(b)}\n{t}\n\n"
                           for i, (a, b, t) in enumerate(entries, 1)))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--final", action="store_true")
    args = parser.parse_args()

    final_dir = VIDEO_DIR / "output"
    final_dir.mkdir(exist_ok=True)
    name = "write-on-orientation.mp4" if args.final else "preview.mp4"
    offsets, cursor = {}, 0.0
    with tempfile.TemporaryDirectory() as tmp:
        parts = []
        for i, number in enumerate(sorted(SCENES), 1):
            part = Path(tmp) / f"scene_{number:02d}.mp4"
            mux(number, args.final, part)
            offsets[number] = cursor
            cursor += probe_duration(part)
            parts.append(part)
            print(f"[{'#' * i}{'.' * (len(SCENES) - i)}] muxed scene {number:02d}", flush=True)
        listing = Path(tmp) / "list.txt"
        listing.write_text("".join(f"file '{p}'\n" for p in parts))
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(listing),
                        "-c", "copy", "-movflags", "+faststart", str(final_dir / name)], check=True)
    captions = final_dir / ("write-on-orientation.srt" if args.final else "preview.srt")
    write_captions(offsets, captions)
    print(f"{final_dir / name}  ({int(cursor // 60)}:{cursor % 60:04.1f})")
    print(captions)


if __name__ == "__main__":
    main()
