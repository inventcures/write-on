"""Mux each rendered scene with its narration, concatenate, and write captions.

Usage:
    assemble.py            # low-quality preview -> output/preview.mp4
    assemble.py --final    # 1080p60 -> output/vaani_sakhi_explainer.mp4 + .srt
"""

import argparse
import json
import subprocess
import tempfile
import textwrap
from pathlib import Path

from render import ORDER, SCENES, VIDEO_DIR, video_path

MAX_CAPTION_CHARS = 84
# Seconds over which the maker's voice and picture ease into the narrated video. The narrator's first
# word lands just after the maker's last, so the two voices never talk over each other.
CROSSFADE = 1.6
LINE_CHARS = 44


def probe_duration(path: Path) -> float:
    out = subprocess.run(["ffmpeg", "-i", str(path)], capture_output=True, text=True).stderr
    h, m, s = out.split("Duration: ")[1].split(",")[0].split(":")
    return int(h) * 3600 + int(m) * 60 + float(s)


# The synthesized narration is studio-dry. A short, quiet early reflection and a softer top end place it in
# the same small room as the maker's recorded voice (scene 99), which gets no filter here.
NARRATION_ROOM = "aecho=1.0:0.9:11|19|29:0.10|0.07|0.04,highshelf=f=7000:g=-2.5,volume=0.7dB,alimiter=limit=0.84:level=false"


def mux(number: int, final: bool, out: Path) -> None:
    audio = VIDEO_DIR / "audio" / f"scene_{number:02d}.wav"
    room = [] if number == 99 else ["-af", NARRATION_ROOM]
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(video_path(number, final)), "-i", str(audio),
         "-map", "0:v:0", "-map", "1:a:0", *room, "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
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
    for number in ORDER:
        own = VIDEO_DIR / "timings" / f"scene_{number:02d}_captions.json"
        if own.exists():  # the maker's recording: captions from its transcript
            for seg in json.loads(own.read_text()):
                entries.append((offsets[number] + seg["start"], offsets[number] + seg["end"],
                                "\n".join(textwrap.wrap(seg["text"], LINE_CHARS, break_on_hyphens=False))))
            continue
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


def lay_bed(src: Path, out: Path) -> None:
    """Lay one quiet room-tone bed (audio/bed.wav, looped) under the whole video, so the maker's recorded
    voice and the synthesized narration sound like the same room. Without a bed, copy as is."""
    bed = VIDEO_DIR / "audio" / "bed.wav"
    if not bed.exists():
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-c", "copy", str(out)], check=True)
        return
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-stream_loop", "-1", "-i", str(bed),
         "-filter_complex", "[0:a][1:a]amix=inputs=2:duration=first:normalize=0[a]",
         "-map", "0:v:0", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
         "-movflags", "+faststart", str(out)],
        check=True,
    )


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
        for i, number in enumerate(ORDER, 1):
            part = Path(tmp) / f"scene_{number:02d}.mp4"
            mux(number, args.final, part)
            offsets[number] = cursor
            cursor += probe_duration(part)
            parts.append(part)
            print(f"[{'#' * i}{'.' * (len(SCENES) - i)}] muxed scene {number:02d}", flush=True)
        first, rest = parts[0], parts[1:]
        if ORDER[0] == 99:  # the maker's voice blends into the narrated video instead of cutting
            listing = Path(tmp) / "list.txt"
            listing.write_text("".join(f"file '{p}'\n" for p in rest))
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(listing),
                            "-c", "copy", str(Path(tmp) / "rest.mp4")], check=True)
            offset = probe_duration(first) - CROSSFADE
            subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error", "-i", str(first), "-i", str(Path(tmp) / "rest.mp4"),
                 "-filter_complex",
                 f"[0:v][1:v]xfade=transition=fade:duration={CROSSFADE}:offset={offset:.3f},format=yuv420p[v];"
                 f"[0:a][1:a]acrossfade=d={CROSSFADE}:c1=qsin:c2=qsin[a]",
                 "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-crf", "20", "-preset", "medium",
                 "-c:a", "aac", "-b:a", "192k", "-ar", "48000", str(Path(tmp) / "joined.mp4")], check=True)
            for number in ORDER[1:]:
                offsets[number] -= CROSSFADE
            cursor -= CROSSFADE
        else:
            listing = Path(tmp) / "list.txt"
            listing.write_text("".join(f"file '{p}'\n" for p in parts))
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(listing),
                            "-c", "copy", str(Path(tmp) / "joined.mp4")], check=True)
        lay_bed(Path(tmp) / "joined.mp4", final_dir / name)
    captions = final_dir / ("write-on-orientation.srt" if args.final else "preview.srt")
    write_captions(offsets, captions)
    print(f"{final_dir / name}  ({int(cursor // 60)}:{cursor % 60:04.1f})")
    print(captions)


if __name__ == "__main__":
    main()
