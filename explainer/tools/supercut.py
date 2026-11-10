"""Supercut of the maker's recording: clips in source seconds, cut at quiet points, joined with room tone.

The recording itself is private and is not in this repo. Point VOICE_DIR at a folder holding
full_proc.wav (the recording after the voice chain in docs/decisions) and roomtone.wav (its pauses).
A clip is (start, end) or (start, end, snap_start, snap_end); 0 keeps that edge exactly where it is.
"""
import json, os, subprocess
from pathlib import Path

import numpy as np, pyloudnorm as pl, soundfile as sf

VOICE_DIR = Path(os.environ.get("VOICE_DIR", "."))
VIDEO_DIR = Path(__file__).resolve().parents[1]
os.chdir(VOICE_DIR)

CLIPS = [  # (start, end, caption, cue)
    [(0.0, 2.17, 0, 0)], [(2.6, 5.3)], [(5.77, 11.34, 0, 0)],
    [(21.95, 25.9)], [(38.6, 40.8)], [(44.27, 47.5, 0, 1)], [(51.35, 54.1)],
    [(61.25, 63.3)], [(71.45, 75.8)], [(77.0, 81.2, 1, 0)],
    [(89.4, 95.1, 0, 0)], [(96.0, 104.6)],
    [(110.75, 113.25), (113.7, 116.05, 1, 0)],
    [(122.65, 125.9)], [(128.75, 131.4, 0, 1)],
    [(133.8, 135.1)], [(136.8, 138.5), (139.1, 140.1)],
    [(144.85, 148.9), (149.2, 150.5)],
    [(159.1, 161.9)], [(162.7, 164.6)], [(166.66, 169.4, 0, 1)],
    [(58.55, 59.76, 1, 0)],
]
CAPTIONS = ["Hi, I am Ashish.", "Today, 10th November,", "Anthropic released Claude Fable 5.2.",
            "What can I do that has not been done before?", "A true thought partner, as you write.",
            "Writing is thinking, and if you outsource your thinking,", "that's actually atrophying your thinking.",
            "Full credit to Jason Fried.", "Let me take that as the starting point, not as the end point.",
            "Did a bunch of deep research, using again Fable 5.2.", "Shout-out to Poteto, @poteto,",
            "whose suite of skills, PStack, had a skill called unslop, which I tweaked for my personal writing.",
            "Use LLMs to write better, and avoid losing your own voice.",
            "Reading a bunch of stuff by David Perell,", "all my free time on Substack,",
            "all the people I admire,", "ML in health and drug discovery.",
            "Shout-out to Jasmine Sun, shout-out to Celine Nguyen.",
            "The code is open for now,", "happy to take pull requests,", "brickbats and praise welcome.",
            "Here's my attempt."]
CUES = ["hi", "date", "fable", "what", "partner", "thinking", "atrophy", "fried", "startpoint", "research",
        "potato", "unslop", "voice", "perell", "substack", "admire", "mlhealth", "names",
        "open", "prs", "brickbats", "attempt"]
GAP = 0.22
LEAD, TAIL = 0.4, 1.0

x, r = sf.read("full_proc.wav")
w = int(0.01 * r)
env = np.sqrt(np.convolve(x ** 2, np.ones(w) / w, mode="same"))


db = 20 * np.log10(env + 1e-9)
QUIET = np.median(db[db > -60]) - 13
RUN = int(0.06 * r)


def quiet_at(i):
    return (db[i:i + RUN] < QUIET).all()


def snap_end(t, reach=0.7):
    """Extend forward to the first pause, so the last word is whole."""
    i, stop = int(t * r), int((t + reach) * r)
    step = int(0.005 * r)
    while i < stop:
        if quiet_at(i):
            return i / r + 0.03
        i += step
    return t + 0.15


def snap_start(t, reach=0.5):
    """Move back to the end of the pause before, so the first word is whole."""
    if t < 0.2:
        return 0.0
    i, stop = int(t * r), int((t - reach) * r)
    step = int(0.005 * r)
    while i > stop:
        if quiet_at(i - RUN):
            return i / r - 0.03
        i -= step
    return t - 0.1


tone, _ = sf.read("roomtone.wav")
rng = np.random.default_rng(0)


def roomtone(sec):
    n = int(sec * r)
    reps = np.tile(tone, n // len(tone) + 2)
    off = rng.integers(0, len(tone))
    return reps[off: off + n] * 0.6


fade = int(0.015 * r)
parts, cursor, timeline = [np.zeros(int(LEAD * r))], LEAD, []
for clip, cap, cue in zip(CLIPS, CAPTIONS, CUES):
    start = cursor
    for k, c in enumerate(clip):
        a, b, sa, sb = (*c, 1, 1)[:4]
        a = snap_start(a) if sa else a
        b = snap_end(b) if sb else b
        print(f'  {cue}: {a:.2f}-{b:.2f}')
        seg = x[int(a * r): int(b * r)].copy()
        seg[:fade] *= np.linspace(0, 1, fade)
        seg[-fade:] *= np.linspace(1, 0, fade)
        parts.append(seg)
        cursor += len(seg) / r
        if k < len(clip) - 1:
            parts.append(roomtone(0.06)); cursor += 0.06
    timeline.append({"id": f"i.{cue}", "kind": "voice", "start": round(start, 3), "speech": round(cursor - start, 3),
                     "end": round(cursor, 3), "display_text": cap})
    gap = GAP if cue != "brickbats" else 0.6
    parts.append(roomtone(gap)); cursor += gap
parts.append(np.zeros(int(TAIL * r)))
y = np.concatenate(parts)
L = pl.Meter(r).integrated_loudness(y)
y *= 10 ** ((-15.7 - L) / 20)
lim = 10 ** (-1.5 / 20)
if np.abs(y).max() > lim:
    y = np.tanh(y / lim) * lim
sf.write("/tmp/scene_99_raw.wav", y, r, subtype="PCM_16")
# Gentle downward expander on the pauses, plus a little presence, so the laptop mic sits nearer the narrator.
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", "/tmp/scene_99_raw.wav", "-af",
                "agate=threshold=0.0126:ratio=3:range=0.63:attack=8:release=200,"
                "equalizer=f=350:t=q:w=1:g=-2.5", "-c:a", "pcm_s16le", str(VIDEO_DIR) + "/audio/scene_99.wav"], check=True)
y, _ = sf.read(str(VIDEO_DIR) + "/audio/scene_99.wav")
fr = r // 30
n = len(y) // fr
e = np.sqrt((y[: n * fr].reshape(n, fr) ** 2).mean(1))
json.dump({"scene": 99, "title": "MakerIntro", "duration": round(len(y) / r, 3), "beats": timeline,
           "envelope": (e / e.max()).round(4).tolist()}, open(VIDEO_DIR / "timings/scene_99.json", "w"))
json.dump([{"start": b["start"], "end": b["end"], "text": b["display_text"]} for b in timeline],
          open(str(VIDEO_DIR) + "/timings/scene_99_captions.json", "w"), indent=1)
print(f"duration {len(y)/r:.1f}s  loudness {pl.Meter(r).integrated_loudness(y):.1f} LUFS")
