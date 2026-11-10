"""Shared look for the write-on orientation (ManimGL, 3b1b/manim).

One meaning per colour, taken from the app itself (src/ui/styles.css), so the video and the
editor teach the same vocabulary. Scenes sync to the narration with TimedScene.at(beat, frac).
"""

import json
import sys
from pathlib import Path

import numpy as np
from manimlib import *  # noqa: F401,F403

VIDEO_DIR = Path(__file__).resolve().parents[1]

# The app's palette
PAGE = "#050a1c"
PANEL = "#0a1128"
INK = "#f5d1c0"
INK_SOFT = "#a8908a"
INK_FAINT = "#4a4552"
WORD = "#b69cff"       # violet: word grain
SENT = "#f29bb8"       # rose: sentence grain
PARA = "#c98a5b"       # copper: paragraph grain
KEPT = "#7fcf8f"       # green: kept
REJ = "#e86a5c"        # red: rejected
UND = "#f0b84e"        # amber: undecided
MACHINE = "#4fb4ff"    # electric blue: machine (planned)

MONO = "IBM Plex Mono"
SANS = "Inter"
GHOST_OPACITY = 0.11


def page(text, size=34, color=INK, **kw):
    """Text as it looks on the write-on page."""
    return Text(text, font=MONO, font_size=size, fill_color=color, **kw)


def label(text, size=30, color=INK_SOFT, weight=NORMAL, **kw):
    return Text(text, font=SANS, font_size=size, fill_color=color, weight=weight, **kw)


def heading(text, size=40, color=INK, **kw):
    return label(text, size=size, color=color, weight=BOLD, **kw).to_edge(UP, buff=0.55)


def wave(mob, color=WORD, amp=0.035, period=0.18, buff=0.07, width=2.2):
    """The pen-like wavy underline write-on draws under a word or sentence."""
    left, right = mob.get_corner(DL), mob.get_corner(DR)
    y = left[1] - buff
    x0, x1 = left[0], right[0]
    curve = ParametricCurve(
        lambda t: np.array([t, y + amp * np.sin(TAU * (t - x0) / period), 0]),
        t_range=(x0, x1, period / 12),
    )
    curve.set_stroke(color, width)
    return curve


def margin_bar(mob, color=PARA, buff=0.25, width=5):
    bar = Line(mob.get_corner(UL), mob.get_corner(DL)).shift(LEFT * buff)
    return bar.set_stroke(color, width)


def bracket(mob, color=UND, buff=0.2, depth=0.15, width=3):
    """A square bracket under a span (Brace needs LaTeX packages we don't have)."""
    l, r = mob.get_corner(DL) + DOWN * buff, mob.get_corner(DR) + DOWN * buff
    path = VMobject().set_points_as_corners([l + UP * depth, l, (l + r) / 2, (l + r) / 2 + DOWN * depth,
                                              (l + r) / 2, r, r + UP * depth])
    return path.set_stroke(color, width)


def strike(mob, color=REJ, width=3):
    return Line(mob.get_left(), mob.get_right()).set_stroke(color, width)


def keycap(text, size=26, color=INK):
    """A keyboard shortcut drawn as caps joined by plus signs, e.g. 'Ctrl+Shift+A'."""
    parts = VGroup()
    for i, key in enumerate(text.split("+") if text != "Ctrl+/" else ["Ctrl", "/"]):
        if i:
            parts.add(label("+", size=size * 0.8, color=INK_SOFT))
        t = Text(key, font=MONO, font_size=size, fill_color=color)
        box = RoundedRectangle(width=max(t.get_width() + 0.32, 0.55), height=t.get_height() + 0.34,
                               corner_radius=0.08)
        box.set_stroke(color, 1.6).set_fill(PANEL, 1)
        t.move_to(box)
        parts.add(VGroup(box, t))
    parts.arrange(RIGHT, buff=0.12)
    return parts


def button(text, color, width=None, size=26):
    t = Text(text, font=SANS, font_size=size, fill_color=color, weight=BOLD)
    box = RoundedRectangle(width=width or t.get_width() + 0.6, height=t.get_height() + 0.45, corner_radius=0.12)
    box.set_stroke(color, 2.5).set_fill(PANEL, 1)
    t.move_to(box)
    return VGroup(box, t)


def panel(width, height, color=INK_FAINT, dashed=False, fill=PANEL):
    rect = RoundedRectangle(width=width, height=height, corner_radius=0.15)
    rect.set_stroke(color, 2).set_fill(fill, 1)
    if dashed:
        outline = DashedVMobject(rect.copy().set_fill(opacity=0), num_dashes=70)
        outline.set_stroke(color, 2)
        rect.set_stroke(width=0)
        return VGroup(rect, outline)
    return rect


def caret(mob, side=RIGHT, color=INK):
    line = Line(UP * 0.22, DOWN * 0.22).set_stroke(color, 3)
    line.next_to(mob, side, buff=0.06)
    return line


def flip_anims(old, new, old_word, new_word, shared):
    """Flip one variant in place: the rest of the sentence slides to its new spot, the word swaps."""
    anims = [ReplacementTransform(old[s], new[s]) for s in shared]
    anims += [FadeOut(old[old_word], shift=UP * 0.3), FadeIn(new[new_word], shift=UP * 0.3)]
    return anims


def load_timings(n):
    return json.loads((VIDEO_DIR / "timings" / f"scene_{n:02d}.json").read_text())


class TimedScene(Scene):
    """A scene whose beats start where the narration track says they do."""

    scene_number = 0
    DRIFT_TOLERANCE = 0.3

    def setup(self):
        super().setup()
        self.timing = load_timings(self.scene_number)
        self.beat = {b["id"]: b for b in self.timing["beats"]}
        self.drift = []

    def speech(self, beat_id):
        return self.beat[beat_id]["speech"]

    def at(self, beat_id, frac=0.0):
        target = self.beat[beat_id]["start"] + frac * self.beat[beat_id]["speech"]
        delta = target - self.time
        if delta > 1 / 30:
            self.wait(delta)
        elif -delta > self.DRIFT_TOLERANCE:
            self.drift.append((beat_id, frac, round(-delta, 2)))

    def finish(self):
        remaining = self.timing["duration"] - self.time
        if remaining > 1 / 30:
            self.wait(remaining)
        elif -remaining > self.DRIFT_TOLERANCE:
            self.drift.append(("end", 1.0, round(-remaining, 2)))
        if self.drift:
            print(f"DRIFT scene {self.scene_number}: {self.drift}", file=sys.stderr)

    def clear_all_but(self, *keep, run_time=0.5):
        others = [m for m in self.mobjects if m is not self.frame and m not in keep]
        if others:
            self.play(*[FadeOut(m) for m in others], run_time=run_time)
            self.remove(*others)

    def clear_all(self, run_time=0.6):
        others = [m for m in self.mobjects if m is not self.frame]
        if others:
            self.play(*[FadeOut(m) for m in others], run_time=run_time)
            self.remove(*others)
