"""write-on orientation, scene by scene. Render with: manimgl wo_scenes.py Scene00Hook -w --hd

Structure follows the 3b1b habit seen in Grant's neural-network video (3b1b/videos _2017/nn/part1.py):
one concrete example first, then name the idea, then break it into parts, one idea on screen at a time,
and be honest about what is not yet known (here: what is not built yet).
"""

import random

from style import *  # noqa: F401,F403

SENTENCE = "The meeting was really productive."


# ---------------------------------------------------------------- 0. Keep or delete
class Scene00Hook(TimedScene):
    scene_number = 0

    def construct(self):
        self.at("0.1")
        sent = page(SENTENCE, size=44).shift(UP * 1.2)
        cur = caret(sent)
        self.play(ShowIncreasingSubsets(sent, run_time=1.6, rate_func=linear))
        self.add(cur)
        self.play(FadeOut(cur, rate_func=there_and_back), run_time=0.8)
        self.remove(cur)

        self.at("0.1", 0.58)
        word = sent["productive"]
        u1 = DashedLine(word.get_corner(DL) + DOWN * 0.1, word.get_corner(DR) + DOWN * 0.1).set_stroke(UND, 3)
        self.play(ShowCreation(u1), word.animate.set_fill(UND), run_time=0.7)
        self.at("0.1", 0.8)
        brace = bracket(sent)
        self.play(FadeOut(u1), word.animate.set_fill(INK), ShowCreation(brace), run_time=0.7)

        self.at("0.2")
        keep = button("KEEP", KEPT, width=2.6)
        delete = button("DELETE", REJ, width=2.6)
        VGroup(keep, delete).arrange(RIGHT, buff=2.8).shift(DOWN * 1.3)
        self.play(FadeOut(brace), LaggedStart(FadeIn(keep, shift=UP * 0.2), FadeIn(delete, shift=UP * 0.2), lag_ratio=0.4))

        # Delete: the first try is gone for good
        self.at("0.3", 0.02)
        self.play(Indicate(delete, color=REJ, scale_factor=1.08), run_time=0.6)
        ghost_copy = sent.copy()
        self.play(LaggedStart(*[
            FadeOut(ch, shift=DOWN * random.uniform(0.6, 1.4) + RIGHT * random.uniform(-0.4, 0.4))
            for ch in sent.copy().set_fill(REJ)
        ], lag_ratio=0.03), FadeOut(sent), run_time=1.6)
        gone = label("gone for good", color=REJ).move_to(UP * 1.2)
        self.play(FadeIn(gone), run_time=0.4)

        # Keep: the better version never gets written
        self.at("0.3", 0.36)
        self.play(FadeOut(gone), FadeIn(ghost_copy), run_time=0.5)
        sent = ghost_copy
        self.play(Indicate(keep, color=KEPT, scale_factor=1.08), run_time=0.6)
        empty = DashedLine(LEFT * 3.4, RIGHT * 3.4).set_stroke(INK_FAINT, 2).next_to(sent, DOWN, buff=0.55)
        never = label("the better version, never written", size=22, color=INK_FAINT).next_to(empty, DOWN, buff=0.15)
        self.play(ShowCreation(empty), FadeIn(never), run_time=0.9)

        self.at("0.3", 0.7)
        decide = label("decide now, before you've finished thinking", size=28, color=UND).to_edge(UP, buff=0.7)
        self.play(FadeIn(decide, shift=DOWN * 0.2), run_time=0.7)

        # A third move
        self.at("0.4")
        both = button("KEEP BOTH", WORD, width=3.4)
        both.move_to(VGroup(keep, delete))
        self.play(
            FadeOut(decide), FadeOut(empty), FadeOut(never),
            keep.animate.set_opacity(0.25), delete.animate.set_opacity(0.25),
            FadeIn(both, scale=0.8), run_time=0.8,
        )
        w = wave(sent["productive"])
        alt = page("useful", size=44, color=WORD).set_opacity(0.35)
        alt.next_to(sent["productive"], DOWN, buff=0.45, aligned_edge=LEFT)
        self.play(ShowCreation(w), FadeIn(alt, shift=DOWN * 0.15), run_time=0.9)
        self.finish()


# ---------------------------------------------------------------- 1. Title
class Scene01Title(TimedScene):
    scene_number = 1

    def construct(self):
        # Origin: the day Fable 5.2 came out
        self.at("1.0")
        date = label("10 November 2026", size=40, color=INK, weight=BOLD).to_edge(UP, buff=0.6)
        sub0 = label("Anthropic releases Fable 5.2", size=28, color=INK_SOFT).next_to(date, DOWN, buff=0.2)
        self.play(FadeIn(date, shift=DOWN * 0.2), FadeIn(sub0), run_time=0.8)
        topics = ["one-shot hardware", "multi-step chemistry", "agents that ship apps", "a game in an hour",
                  "one-shot hardware, v2", "a lab notebook agent", "chemistry, step by step", "everything, at once"]
        posts = VGroup()
        for i, t in enumerate(topics * 2):
            card = panel(5.2, 0.8, color=INK_FAINT)
            dot = Dot(radius=0.14, fill_color=[WORD, SENT, PARA, MACHINE][i % 4]).move_to(card.get_left() + RIGHT * 0.4)
            txt = label(t, size=24, color=INK_SOFT).next_to(dot, RIGHT, buff=0.3)
            posts.add(VGroup(card, dot, txt))
        posts.arrange(DOWN, buff=0.2).next_to(sub0, DOWN, buff=0.4).align_to(sub0, ORIGIN)
        posts.set_x(0)
        clip_top = sub0.get_bottom()[1] - 0.2
        posts.add_updater(lambda m: [c.set_opacity(1 if c.get_y() < clip_top else 0) for c in m])
        self.add(posts)
        self.at("1.0", 0.15)
        self.play(posts.animate.shift(UP * 9), run_time=5.5, rate_func=lambda t: smooth(t) ** 0.8)
        posts.clear_updaters()
        self.at("1.0", 0.6)
        q = label("how do you write more, and more thoughtfully,\nwithout handing your thinking to the machine?",
                  size=38, color=INK, alignment="CENTER")
        self.play(FadeOut(posts), FadeOut(sub0), FadeOut(date), run_time=0.6)
        self.play(Write(q), run_time=2.2)

        self.at("1.1")
        self.play(FadeOut(q), run_time=0.5)
        title = page("write-on", size=96)
        w = wave(title["on"], amp=0.06, period=0.3, buff=0.14, width=4)
        sub = label("an orientation", size=34).next_to(title, DOWN, buff=0.7)
        self.play(Write(title), run_time=1.4)
        self.play(ShowCreation(w), FadeIn(sub, shift=UP * 0.2), run_time=0.9)

        self.at("1.1", 0.62)
        bend = label("it bends to how you think", size=30, color=INK).next_to(sub, DOWN, buff=0.5)
        self.play(FadeIn(bend, shift=UP * 0.1), run_time=0.7)

        self.at("1.2")
        self.play(VGroup(title, w).animate.scale(0.55).to_edge(UP, buff=0.6), FadeOut(sub), FadeOut(bend), run_time=0.9)
        ideas = VGroup(*[
            VGroup(label(n, size=54, color=c, weight=BOLD), label(t, size=24, color=INK))
            .arrange(DOWN, buff=0.25)
            for n, t, c in [
                ("1", "alternatives", WORD), ("2", "ghost & Overflow", UND),
                ("3", "colours & timeline", KEPT), ("4", "the mental model", SENT),
            ]
        ]).arrange(RIGHT, buff=1.1).shift(DOWN * 0.2)
        self.play(LaggedStartMap(FadeIn, ideas, shift=UP * 0.25, lag_ratio=0.25), run_time=2.0)
        self.at("1.2", 0.7)
        habits = label("especially if your hands already know another editor", size=24, color=INK_SOFT)
        habits.next_to(ideas, DOWN, buff=0.9)
        bksp = keycap("Backspace", size=24, color=REJ).next_to(habits, DOWN, buff=0.35)
        self.play(FadeIn(habits), FadeIn(bksp), run_time=0.8)
        self.play(Indicate(bksp, color=REJ), run_time=0.8)
        self.finish()


# ---------------------------------------------------------------- 2. Alternative control
class Scene02Alternatives(TimedScene):
    scene_number = 2

    def construct(self):
        self.at("2.1")
        l1 = label("not version control,", size=48, color=INK_SOFT)
        l2 = label("but alternative control", size=56, color=WORD, weight=BOLD)
        VGroup(l1, l2).arrange(DOWN, buff=0.4)
        credit = label("the idea: Jason Fried's Write_On", size=22, color=INK_SOFT).to_edge(DOWN, buff=0.6)
        self.play(FadeIn(l1, shift=UP * 0.2), run_time=0.8)
        self.at("2.1", 0.6)
        self.play(FadeIn(l2, shift=UP * 0.2), FadeIn(credit), run_time=0.9)

        # Version control: in time
        self.at("2.2")
        self.play(FadeOut(VGroup(l1, credit)), l2.animate.scale(0.0001).set_opacity(0), run_time=0.6)
        self.remove(l2)
        left_title = label("version control: in time", size=32, color=INK).move_to(LEFT * 3.6 + UP * 2.9)
        pages = VGroup()
        for i, day in enumerate(["Mon", "Tue", "Wed"]):
            sheet = panel(1.9, 2.5, color=INK_SOFT)
            lines = VGroup(*[Line(LEFT * 0.65, RIGHT * (0.65 - 0.25 * (j % 2))).set_stroke(INK_FAINT, 3)
                             for j in range(6)]).arrange(DOWN, buff=0.22, aligned_edge=LEFT).move_to(sheet)
            tag = label(day, size=22, color=INK_SOFT).next_to(sheet, DOWN, buff=0.2)
            pages.add(VGroup(sheet, lines, tag))
        pages.arrange(RIGHT, buff=0.35).move_to(LEFT * 3.6 + UP * 0.2)
        axis = Arrow(pages.get_corner(DL) + DOWN * 0.85, pages.get_corner(DR) + DOWN * 0.85, buff=0)
        axis.set_stroke(INK_SOFT, 2).set_fill(INK_SOFT)
        tlabel = label("time", size=22).next_to(axis, DOWN, buff=0.12)
        self.play(FadeIn(left_title), LaggedStartMap(FadeIn, pages, shift=RIGHT * 0.3, lag_ratio=0.35), run_time=1.6)
        self.play(GrowArrow(axis), FadeIn(tlabel), run_time=0.7)
        self.at("2.2", 0.7)
        dig = SurroundingRectangle(pages[0], buff=0.08).set_stroke(UND, 2.5)
        self.play(ShowCreation(dig), run_time=0.5)
        self.play(dig.animate.move_to(pages[1]), run_time=0.5)
        self.play(dig.animate.move_to(pages[2]), run_time=0.5)
        self.play(FadeOut(dig), run_time=0.3)

        # Alternative control: in place
        self.at("2.3")
        divider = DashedLine(UP * 3.3, DOWN * 3.3).set_stroke(INK_FAINT, 1.5)
        right_title = label("alternative control: in place", size=32, color=WORD).move_to(RIGHT * 3.6 + UP * 2.9)
        active = page(SENTENCE, size=27).move_to(RIGHT * 3.6 + UP * 0.9)
        r = wave(active, color=SENT, amp=0.03, buff=0.14)
        alts = VGroup(
            page("The meeting moved us forward.", size=27, color=SENT),
            page("We left the room with a plan.", size=27, color=SENT),
        ).arrange(DOWN, buff=0.3, aligned_edge=LEFT).next_to(active, DOWN, buff=0.5, aligned_edge=LEFT)
        alts.set_opacity(0.35)
        self.play(ShowCreation(divider), FadeIn(right_title), FadeIn(active), run_time=0.9)
        self.play(ShowCreation(r), LaggedStartMap(FadeIn, alts, shift=DOWN * 0.15, lag_ratio=0.4), run_time=1.2)
        self.at("2.3", 0.75)
        flip = page("The meeting moved us forward.", size=27).move_to(active, aligned_edge=LEFT)
        self.play(Transform(active, flip), run_time=0.8)

        # Ctrl+Shift+A on a word
        self.at("2.4")
        self.clear_all(0.5)
        sent = page(SENTENCE, size=48).shift(UP * 0.8)
        word = sent["productive"]
        self.play(FadeIn(sent), run_time=0.5)
        cur = caret(word[0], side=LEFT, color=WORD).shift(RIGHT * 0.03)
        self.play(FadeIn(cur), run_time=0.3)
        self.at("2.4", 0.4)
        keys = keycap("Ctrl+Shift+A").to_edge(DOWN, buff=0.9)
        self.play(FadeIn(keys, shift=UP * 0.2), run_time=0.5)
        self.play(Indicate(keys, color=WORD, scale_factor=1.05), run_time=0.6)
        w = wave(word)
        self.play(FadeOut(cur), ShowCreation(w), word.animate.set_fill(WORD), run_time=0.6)
        self.at("2.4", 0.78)
        variants = VGroup(page("useful", size=32, color=WORD), page("worth it", size=32, color=WORD))
        variants.arrange(DOWN, buff=0.2, aligned_edge=LEFT).next_to(word, DOWN, buff=0.45, aligned_edge=LEFT)
        variants.set_opacity(0.4)
        self.play(LaggedStartMap(FadeIn, variants, shift=DOWN * 0.15, lag_ratio=0.3), run_time=0.8)

        # Flip with the arrows: reflow in context
        self.at("2.5")
        arrows = keycap("←+→").next_to(keys, UP, buff=0.3)
        self.play(FadeOut(variants), FadeIn(arrows), run_time=0.5)
        texts = ["The meeting was really useful.", "The meeting was really worth it.", SENTENCE]
        words = ["useful", "worth it", "productive"]
        for i, (t, wd) in enumerate(zip(texts, words)):
            new = page(t, size=48).move_to(sent)
            new[wd].set_fill(WORD)
            nw = wave(new[wd])
            prev = (["productive"] + words)[i]
            self.play(Indicate(arrows[2 if i < 2 else 0], color=WORD, scale_factor=1.1),
                      *flip_anims(sent, new, prev, wd, ["The meeting was really", "."]),
                      Transform(w, nw), run_time=0.8)
            self.remove(sent)
            self.add(new)
            sent = new
            self.wait(0.7)

        # Three grains
        self.at("2.6")
        self.clear_all(0.5)
        g1 = page("really productive", size=38)
        g1w = wave(g1["productive"], color=WORD)
        g1[ "productive"].set_fill(WORD)
        g2 = page("The meeting moved us forward.", size=38)
        g2w = wave(g2, color=SENT, buff=0.16, amp=0.03)
        g3 = VGroup(page("We met for an hour. Three", size=38), page("decisions came out of it,", size=38),
                    page("and one of them was mine.", size=38)).arrange(DOWN, buff=0.18, aligned_edge=LEFT)
        g3b = margin_bar(g3)
        rows = VGroup(VGroup(g1, g1w), VGroup(g2, g2w), VGroup(g3, g3b))
        rows.arrange(DOWN, buff=0.8, aligned_edge=LEFT).shift(LEFT * 2.2 + DOWN * 0.3)
        names = VGroup(
            label("word: thin violet wave", color=WORD), label("sentence: lower rose wave", color=SENT),
            label("paragraph: copper margin bar", color=PARA),
        )
        for n, r in zip(names, rows):
            n.move_to([4.4, r.get_center()[1], 0])
        title = heading("three grains")
        self.play(FadeIn(title), run_time=0.5)
        self.at("2.6", 0.3)
        self.play(FadeIn(g1), ShowCreation(g1w), FadeIn(names[0], shift=LEFT * 0.2), run_time=0.9)
        self.at("2.6", 0.52)
        self.play(FadeIn(g2), ShowCreation(g2w), FadeIn(names[1], shift=LEFT * 0.2), run_time=0.9)
        self.at("2.6", 0.75)
        self.play(FadeIn(g3), ShowCreation(g3b), FadeIn(names[2], shift=LEFT * 0.2), run_time=0.9)

        # A flip is not an edit
        self.at("2.7")
        self.play(FadeOut(VGroup(title, names, rows[1], rows[2])), rows[0].animate.move_to(LEFT * 2.5 + UP * 0.5),
                  run_time=0.7)
        undo = panel(3.6, 2.4, color=INK_SOFT).move_to(RIGHT * 3.3 + UP * 0.5)
        undo_t = label("undo history", size=24).next_to(undo, UP, buff=0.2)
        empty = label("(empty)", size=24, color=INK_FAINT).move_to(undo)
        self.play(FadeIn(undo), FadeIn(undo_t), FadeIn(empty), run_time=0.6)
        g = rows[0][0]
        prev = "productive"
        for wd in ["useful", "worth it", "productive"]:
            new = page(f"really {wd}", size=38).move_to(g, aligned_edge=LEFT)
            new[wd].set_fill(WORD)
            self.play(*flip_anims(g, new, prev, wd, ["really"]), Transform(rows[0][1], wave(new[wd])), run_time=0.6)
            self.remove(g)
            self.add(new)
            g, prev = new, wd
            self.wait(0.15)
        note = label("a flip is not an edit: nothing to undo, nothing lost", size=28, color=INK).to_edge(DOWN, buff=1.0)
        self.play(FadeIn(note, shift=UP * 0.2), Indicate(empty, color=KEPT), run_time=0.9)
        self.finish()


# ---------------------------------------------------------------- 3. Ghost and Overflow
PARAGRAPH = ["Most meetings end with a list.", "This one ended with a decision.",
             "Honestly, I almost skipped it."]


def para_mob(size=36):
    lines = VGroup(*[page(t, size=size) for t in PARAGRAPH]).arrange(DOWN, buff=0.28, aligned_edge=LEFT)
    return lines


class Scene03GhostOverflow(TimedScene):
    scene_number = 3

    def construct(self):
        # Delete is a cliff
        self.at("3.1")
        title = heading("softer than delete")
        ground = VMobject().set_points_as_corners([LEFT * 6 + UP * 0.6, RIGHT * 2.2 + UP * 0.6, RIGHT * 2.2 + DOWN * 2.8])
        ground.set_stroke(INK_SOFT, 3)
        cliff = label("delete", size=32, color=REJ, weight=BOLD).next_to(RIGHT * 2.2 + DOWN * 1.2, RIGHT, buff=0.3)
        card = panel(2.6, 1.0, color=INK_SOFT).move_to(LEFT * 4.6 + UP * 1.2)
        card_lines = VGroup(*[Line(LEFT * 0.9, RIGHT * 0.9).set_stroke(INK_FAINT, 3) for _ in range(3)])
        card_lines.arrange(DOWN, buff=0.18).move_to(card)
        VGroup(ground, cliff, card, card_lines).shift(DOWN * 0.9)
        self.play(FadeIn(title), ShowCreation(ground), FadeIn(VGroup(card, card_lines)), run_time=1.2)
        self.play(FadeIn(cliff, shift=LEFT * 0.2), run_time=0.5)
        self.at("3.1", 0.55)
        slope = VMobject().set_points_as_corners([LEFT * 1.6 + UP * 0.6, LEFT * 0.2 + DOWN * 0.3, RIGHT * 1.4 + DOWN * 1.2,
                                                  RIGHT * 2.2 + DOWN * 1.5])
        slope.set_stroke(UND, 4)
        VGroup(slope).shift(DOWN * 0.9)
        s1 = label("ghost", size=30, color=UND).next_to(LEFT * 0.9 + DOWN * 1.0, DL, buff=0.15)
        s2 = label("Overflow", size=30, color=UND).next_to(RIGHT * 0.6 + DOWN * 1.7, DL, buff=0.15)
        self.play(ShowCreation(slope), run_time=1.0)
        self.play(FadeIn(s1), FadeIn(s2), run_time=0.6)

        # Ghost
        self.at("3.2")
        self.clear_all(0.5)
        para = para_mob().shift(UP * 0.6)
        self.play(FadeIn(para), run_time=0.6)
        keys = keycap("Ctrl+/").to_edge(DOWN, buff=0.9)
        self.at("3.2", 0.3)
        self.play(FadeIn(keys, shift=UP * 0.2), run_time=0.5)
        self.play(Indicate(keys, color=UND, scale_factor=1.05), para[2].animate.set_opacity(GHOST_OPACITY), run_time=1.0)
        self.at("3.2", 0.75)
        note = label("still there, still editable, still counted", size=28, color=UND).next_to(para, DOWN, buff=0.8)
        self.play(FadeIn(note, shift=UP * 0.1), run_time=0.6)

        # Read around it
        self.at("3.3")
        bar = Rectangle(width=0.15, height=para[0].get_height() + 0.2).set_stroke(width=0).set_fill(WORD, 0.25)
        bar.next_to(para[0], LEFT, buff=0)
        self.play(FadeOut(note), run_time=0.3)
        for line in para[:2]:
            bar.move_to(line.get_left() + RIGHT * 0.05)
            self.play(bar.animate.stretch_to_fit_width(line.get_width() + 0.1).move_to(line), run_time=0.9, rate_func=linear)
            self.play(FadeOut(bar), run_time=0.15)
            bar = bar.copy().set_fill(opacity=0.25)
        self.at("3.3", 0.6)
        reads = label("reads better?  leave it.   if not:  revive", size=28, color=INK).next_to(para, DOWN, buff=0.8)
        self.play(FadeIn(reads), run_time=0.5)
        self.play(para[2].animate.set_opacity(1).set_fill(KEPT), run_time=0.8)
        self.play(para[2].animate.set_fill(INK), run_time=0.4)

        # Overflow
        self.at("3.4")
        self.play(FadeOut(reads), FadeOut(keys), para.animate.shift(LEFT * 2.2), run_time=0.7)
        tray = panel(4.6, 4.6, color=UND).to_edge(RIGHT, buff=0.5).shift(DOWN * 0.2)
        tray_t = label("Overflow", size=28, color=UND, weight=BOLD).next_to(tray.get_top(), DOWN, buff=0.25)
        keys = keycap("Ctrl+Shift+X").to_edge(DOWN, buff=0.6).shift(LEFT * 2.2)
        self.play(FadeIn(tray), FadeIn(tray_t), FadeIn(keys, shift=UP * 0.2), run_time=0.8)
        self.at("3.4", 0.5)
        line = para[2]
        origin = line.get_left()
        slot = Line(origin, origin + RIGHT * line.get_width()).set_stroke(INK_FAINT, 2)
        slot = DashedVMobject(slot, num_dashes=20)
        target = line.copy().scale(0.62).move_to(tray.get_center() + UP * 0.9)
        target.set_fill(UND)
        self.play(Indicate(keys, color=UND, scale_factor=1.05), run_time=0.5)
        self.bring_to_front(line)
        self.play(Transform(line, target, path_arc=-40 * DEGREES), FadeIn(slot), run_time=1.2)
        thread = DashedLine(slot.get_right() + RIGHT * 0.1, target.get_left() + LEFT * 0.1).set_stroke(UND, 1.5)
        self.play(ShowCreation(thread), run_time=0.6)
        self.at("3.4", 0.9)
        waits = label("waits here, and remembers\nwhere it came from", size=24, color=UND).next_to(target, DOWN, buff=0.35)
        self.play(FadeIn(waits), run_time=0.5)

        # The dial
        self.at("3.5")
        self.clear_all(0.5)
        stops = [("keep", KEPT), ("variant", WORD), ("ghost", UND), ("Overflow", UND), ("delete", REJ)]
        track = Line(LEFT * 5.2, RIGHT * 5.2).set_stroke(INK_FAINT, 4).shift(DOWN * 0.2)
        dots, names = VGroup(), VGroup()
        for i, (n, c) in enumerate(stops):
            x = -5.2 + i * 2.6
            dots.add(Dot([x, -0.2, 0], radius=0.14, fill_color=c))
            names.add(label(n, size=30, color=c).next_to([x, -0.2, 0], DOWN, buff=0.4))
        t = heading("not keep-or-delete, but a dial")
        self.play(FadeIn(t), ShowCreation(track), run_time=0.7)
        knob = Circle(radius=0.26).set_stroke(INK, 3).move_to(dots[0])
        for i in range(5):
            self.play(FadeIn(dots[i], scale=0.5), FadeIn(names[i], shift=UP * 0.1),
                      knob.animate.move_to(dots[i]) if i else FadeIn(knob), run_time=0.7)
            self.wait(0.6 if i < 4 else 0.2)
        last = label("only then", size=24, color=REJ).next_to(names[4], DOWN, buff=0.2)
        self.play(FadeIn(last), run_time=0.4)
        self.finish()


# ---------------------------------------------------------------- 4. Colours and the timeline
class Scene04Timeline(TimedScene):
    scene_number = 4

    def construct(self):
        self.at("4.1")
        t = heading("one colour, one meaning")
        self.play(FadeIn(t), run_time=0.5)
        rows = VGroup()
        specs = [(KEPT, "green", "kept", "struggle"), (UND, "amber", "undecided", "honestly"),
                 (REJ, "red", "rejected", "tension")]
        for c, name, meaning, word in specs:
            sw = RoundedRectangle(width=0.9, height=0.6, corner_radius=0.1).set_stroke(width=0).set_fill(c, 1)
            nm = label(f"{name}:", size=34, color=c, weight=BOLD)
            mn = label(meaning, size=34, color=INK)
            ex = page(word, size=34)
            if meaning == "kept":
                hl = SurroundingRectangle(ex, buff=0.06).set_stroke(width=0).set_fill(c, 0.25)
                ex = VGroup(hl, ex.set_fill(c))
            elif meaning == "undecided":
                ex.set_fill(c).set_opacity(0.4)
            else:
                ex.set_fill(c)
                ex = VGroup(ex, strike(ex))
            rows.add(VGroup(sw, nm, mn, ex))
        for r in rows:
            r[1].next_to(r[0], RIGHT, buff=0.4)
            r[2].next_to(r[1], RIGHT, buff=0.2)
            r[3].move_to(r[0]).shift(RIGHT * 6.2)
        rows.arrange(DOWN, buff=0.7, aligned_edge=LEFT).move_to(DOWN * 0.2 + LEFT * 0.6)
        for i, frac in enumerate([0.4, 0.6, 0.8]):
            self.at("4.1", frac)
            self.play(FadeIn(rows[i], shift=RIGHT * 0.2), run_time=0.6)

        # The timeline
        self.at("4.2")
        self.clear_all(0.5)
        keys = keycap("Ctrl+Shift+L").to_edge(UP, buff=0.6)
        axis = Line(LEFT * 6.3, RIGHT * 6.3).set_stroke(INK_SOFT, 2).shift(DOWN * 0.4)
        self.play(FadeIn(keys, shift=DOWN * 0.2), run_time=0.5)
        self.play(ShowCreation(axis), run_time=1.0)
        random.seed(7)
        ticks = VGroup()
        bursts = [(-5.6, -3.2, KEPT), (-2.9, -2.0, WORD), (-1.6, 0.4, KEPT), (0.7, 2.2, REJ), (2.5, 3.2, UND),
                  (3.5, 5.9, KEPT)]
        for a, b, c in bursts:
            x = a
            while x < b:
                h = random.uniform(0.25, 0.9)
                ticks.add(Line([x, -0.4, 0], [x, -0.4 + h, 0]).set_stroke(c, 3))
                x += random.uniform(0.07, 0.16)
        self.play(LaggedStartMap(ShowCreation, ticks, lag_ratio=0.02), run_time=2.2)

        # Zoom out / zoom in
        self.at("4.3")
        b1 = bracket(VGroup(*[t for t in ticks if t.get_x() < 0.5 and t.get_x() > -1.7]), color=KEPT, buff=0.15)
        b2 = bracket(VGroup(*[t for t in ticks if 0.6 < t.get_x() < 2.3]), color=REJ, buff=0.15)
        l1 = label("drafting", size=26, color=KEPT).next_to(b1, DOWN, buff=0.25)
        l2 = label("cutting", size=26, color=REJ).next_to(b2, DOWN, buff=0.25)
        self.play(ShowCreation(b1), FadeIn(l1), run_time=0.6)
        self.play(ShowCreation(b2), FadeIn(l2), run_time=0.6)
        self.at("4.3", 0.55)
        tick = min([t for t in ticks if 0.6 < t.get_x() < 2.3], key=lambda t: abs(t.get_x() - 1.4))
        self.play(FadeOut(VGroup(b1, b2, l1, l2, keys)), self.frame.animate.set_height(1.6).move_to(tick), run_time=1.4)
        moment = VGroup(page("The", size=8), page("tension", size=8, color=REJ), page("struggle", size=8, color=KEPT),
                        page("was real.", size=8)).arrange(RIGHT, buff=0.06)
        moment.add(strike(moment[1], width=1))
        card = panel(moment.get_width() + 0.3, 0.42, color=INK_SOFT)
        card.set_stroke(width=1)
        mom = VGroup(card, moment).next_to(tick, UP, buff=0.08)
        self.play(FadeIn(mom, shift=UP * 0.05), tick.animate.set_stroke(width=6), run_time=0.7)

        # Replay and edit here
        self.at("4.4")
        self.play(FadeOut(mom), self.frame.animate.to_default_state(), run_time=1.0)
        head = Triangle(fill_color=INK, fill_opacity=1).set_stroke(width=0).scale(0.12).rotate(PI)
        head.move_to([-6.3, 0.75, 0])
        self.play(head.animate.move_to([1.4, 0.75, 0]), run_time=1.6, rate_func=linear)
        here = button("edit here", KEPT, size=22).next_to([1.4, 0.75, 0], UP, buff=0.3)
        self.play(FadeIn(here, scale=0.8), run_time=0.4)
        self.play(Indicate(here, color=KEPT), run_time=0.6)
        self.finish()


# ---------------------------------------------------------------- 5. The mental model
class Scene05MentalModel(TimedScene):
    scene_number = 5

    def construct(self):
        self.at("5.1")
        line = page(SENTENCE, size=36)
        self.play(FadeIn(line), run_time=0.6)
        self.at("5.1", 0.22)
        root = Dot(LEFT * 4.6 + DOWN * 0.3, radius=0.1, fill_color=INK)
        self.play(ReplacementTransform(line, root), run_time=0.8)
        tree, leaves = VGroup(), []
        random.seed(3)

        def grow(p, depth, spread):
            if depth == 0:
                leaves.append(p)
                return
            for dy in (-spread, spread) if depth != 2 else (-spread, 0, spread):
                q = p + RIGHT * 2.9 + UP * dy
                tree.add(Line(p, q).set_stroke(INK_SOFT, 2))
                tree.add(Dot(q, radius=0.07, fill_color=INK_SOFT))
                grow(q, depth - 1, spread * 0.45)

        grow(root.get_center(), 3, 1.55)
        self.play(LaggedStartMap(ShowCreation, tree, lag_ratio=0.03), run_time=2.4)
        tl = label("a draft is a tree of possibilities", size=34, color=INK).to_edge(UP, buff=0.5)
        self.play(FadeIn(tl), run_time=0.5)
        self.at("5.1", 0.7)
        lines = [m for m in tree if isinstance(m, Line)]
        path = [lines[0], lines[1], lines[2]]
        self.play(*[l.animate.set_stroke(KEPT, 5) for l in path], run_time=0.8)
        self.at("5.1", 0.88)
        others = VGroup(*[l for l in lines if l not in path])
        self.play(others.animate.set_stroke(UND, 2, opacity=0.6), run_time=0.6)
        never = label("or never", size=26, color=UND).to_edge(DOWN, buff=0.5)
        self.play(FadeIn(never), run_time=0.4)

        # Three habits
        self.at("5.2")
        self.clear_all(0.5)
        habits = [("torn between two?", "add a variant", "Ctrl+Shift+A", WORD),
                  ("unsure it belongs?", "ghost it", "Ctrl+/", UND),
                  ("love it, but it doesn't fit?", "Overflow it", "Ctrl+Shift+X", UND)]
        cards = VGroup()
        for q, a, k, c in habits:
            box = panel(4.1, 3.6, color=c)
            qq = label(q, size=28, color=INK_SOFT)
            aa = label(a, size=40, color=c, weight=BOLD)
            kk = keycap(k, size=22)
            VGroup(qq, aa, kk).arrange(DOWN, buff=0.45).move_to(box)
            cards.add(VGroup(box, qq, aa, kk))
        cards.arrange(RIGHT, buff=0.35).shift(DOWN * 0.2)
        ht = heading("three habits")
        self.play(FadeIn(ht), run_time=0.4)
        for i, beat in enumerate(["5.2", "5.3", "5.4"]):
            self.at(beat, 0.2 if i == 0 else 0.0)
            self.play(FadeIn(cards[i], shift=UP * 0.3), run_time=0.6)

        # The first minute: read mode, then tools
        self.at("5.5")
        self.clear_all(0.5)
        screen = panel(11.5, 5.0, color=INK_FAINT, fill=PAGE).shift(DOWN * 0.1)
        wc = page("123 words", size=22, color=INK_SOFT).move_to(screen.get_corner(UL) + RIGHT * 0.9 + DOWN * 0.35)
        body = VGroup(page("Write it three ways", size=40, weight=BOLD),
                      page("Every sentence starts as a sketch.", size=28),
                      page("The trick is not to throw the first", size=28),
                      page("try away, but to keep it close.", size=28)).arrange(DOWN, buff=0.25, aligned_edge=LEFT)
        body.move_to(screen).shift(LEFT * 1.4 + UP * 0.3)
        rail = panel(2.4, 4.2, color=UND).move_to(screen.get_right() + LEFT * 1.45)
        rail_t = label("Overflow", size=26, color=UND).next_to(rail.get_top(), DOWN, buff=0.2)
        w1 = wave(body[1]["sketch"], color=WORD)
        body[1]["sketch"].set_fill(WORD)
        mode = label("first visit: a welcome card, then a short tour", size=28, color=INK).next_to(screen, UP, buff=0.25)
        self.play(FadeIn(screen), FadeIn(wc), FadeIn(body), FadeIn(rail), FadeIn(rail_t), ShowCreation(w1),
                  FadeIn(mode), run_time=0.8)
        welcome = panel(5.6, 3.0, color=INK_SOFT).move_to(screen)
        wt = VGroup(page("Write_On", size=34, weight=BOLD), label("an editor for thinking on the page", size=24, color=INK_SOFT),
                    button("start the tour", KEPT, size=22)).arrange(DOWN, buff=0.3).move_to(welcome)
        self.play(FadeIn(VGroup(welcome, wt), scale=0.95), run_time=0.6)
        self.at("5.5", 0.2)
        steps = VGroup(*[label(t, size=22, color=c) for t, c in [("1  flip", WORD), ("2  add a variant", WORD),
                         ("3  ghost", UND), ("4  stash", UND), ("5  timeline", KEPT)]]).arrange(RIGHT, buff=0.45)
        steps.next_to(screen, DOWN, buff=0.3)
        self.play(FadeOut(VGroup(welcome, wt)), LaggedStartMap(FadeIn, steps, lag_ratio=0.3), run_time=1.6)
        self.at("5.5", 0.42)
        keys = keycap("Ctrl+Shift+R").next_to(screen, DOWN, buff=0.25)
        tools = label("tools out: just your words", size=28, color=INK).next_to(screen, UP, buff=0.25)
        self.play(FadeOut(steps), FadeIn(keys, shift=UP * 0.2), run_time=0.4)
        self.play(Indicate(keys, color=KEPT, scale_factor=1.05), FadeOut(rail), FadeOut(rail_t), FadeOut(w1),
                  body[1]["sketch"].animate.set_fill(INK), FadeTransform(mode, tools), run_time=0.9)
        self.play(FadeIn(rail), FadeIn(rail_t), FadeIn(w1), body[1]["sketch"].animate.set_fill(WORD), run_time=0.7)
        self.at("5.5", 0.8)
        q = VGroup(Circle(radius=0.24).set_stroke(INK, 2).set_fill(PANEL, 1), label("?", size=26, color=INK, weight=BOLD))
        q[1].move_to(q[0])
        q.move_to(screen.get_corner(DL) + RIGHT * 0.5 + UP * 0.45)
        ql = label("the card and this video, again", size=26, color=INK).next_to(q, RIGHT, buff=0.2)
        self.play(FadeIn(q, scale=0.6), FadeIn(ql), run_time=0.5)
        self.play(Indicate(q, color=WORD), run_time=0.6)

        # Write the way you always do
        self.at("5.6")
        self.play(FadeOut(VGroup(keys, ql, q)), run_time=0.3)
        more = page("It saves the ideas you'd throw away.", size=28).next_to(body, DOWN, buff=0.25, aligned_edge=LEFT)
        self.play(ShowIncreasingSubsets(more, run_time=1.4, rate_func=linear))
        as_always = label("write the way you always do", size=30, color=INK).next_to(screen, DOWN, buff=0.3).shift(LEFT * 1.2)
        self.play(FadeIn(as_always), run_time=0.4)
        self.at("5.6", 0.6)
        urge = keycap("Backspace", size=24, color=REJ).next_to(as_always, RIGHT, buff=0.5)
        arrow = Arrow(urge.get_top(), rail.get_bottom() + LEFT * 0.4, buff=0.15, path_arc=60 * DEGREES)
        arrow.set_stroke(UND, 3).set_fill(UND)
        self.play(FadeIn(urge), run_time=0.3)
        self.play(GrowArrow(arrow), rail.animate.set_stroke(UND, 4), run_time=0.8)
        self.finish()


# ---------------------------------------------------------------- 6. It adapts to you
class Scene06AdaptsToYou(TimedScene):
    scene_number = 6

    def construct(self):
        self.at("6.1")
        para = para_mob(size=30).shift(UP * 1.6)
        para[0]["list"].set_fill(WORD)
        w = wave(para[0]["list"])
        para[2].set_opacity(GHOST_OPACITY)
        self.play(FadeIn(para), ShowCreation(w), run_time=0.8)
        random.seed(11)
        dots = VGroup(*[Dot(radius=0.06, fill_color=random.choice([WORD, UND, KEPT, KEPT, REJ, SENT]))
                        .move_to(para.get_center() + RIGHT * random.uniform(-3, 3) + UP * random.uniform(-0.6, 0.6))
                        for _ in range(60)])
        self.play(LaggedStartMap(FadeIn, dots, scale=0.4, lag_ratio=0.02), run_time=1.2)
        self.at("6.1", 0.45)
        # dots settle into a pattern: a cluster per kind of choice
        centers = {WORD: LEFT * 3 + DOWN * 1.3, UND: LEFT * 1 + DOWN * 1.8, KEPT: RIGHT * 1 + DOWN * 1.2,
                   REJ: RIGHT * 3 + DOWN * 1.9, SENT: LEFT * 0 + DOWN * 2.6}
        anims = []
        for d in dots:
            c = d.get_fill_color()
            key = min(centers, key=lambda k: np.linalg.norm(color_to_rgb(k) - color_to_rgb(c)))
            anims.append(d.animate.move_to(centers[key] + np.array([random.gauss(0, 0.28), random.gauss(0, 0.2), 0])))
        self.play(*anims, run_time=1.8)
        trace = label("your decisions: a trace of how you think", size=30, color=INK).to_edge(DOWN, buff=0.4)
        self.play(FadeIn(trace), run_time=0.6)

        # 8 of 10
        self.at("6.2")
        self.clear_all(0.5)
        pairs = VGroup()
        picks_short = [1, 1, 0, 1, 1, 1, 1, 0, 1, 1]
        for s in picks_short:
            short = Rectangle(width=1.0, height=0.22).set_stroke(width=0)
            long = Rectangle(width=2.4, height=0.22).set_stroke(width=0)
            short.set_fill(KEPT if s else INK_FAINT, 1)
            long.set_fill(INK_FAINT if s else KEPT, 1)
            pairs.add(VGroup(short, long).arrange(RIGHT, buff=0.3, aligned_edge=LEFT))
        pairs.arrange(DOWN, buff=0.18, aligned_edge=LEFT).scale(1.35).shift(LEFT * 2.8 + DOWN * 0.2)
        hdr = VGroup(label("short", size=24), label("long", size=24))
        hdr[0].next_to(pairs[0][0], UP, buff=0.25)
        hdr[1].next_to(pairs[0][1], UP, buff=0.25)
        self.play(FadeIn(hdr), LaggedStartMap(FadeIn, pairs, shift=RIGHT * 0.2, lag_ratio=0.12), run_time=1.8)
        count = label("8 of 10", size=60, color=KEPT, weight=BOLD).move_to(RIGHT * 3.3 + UP * 0.5)
        sub = label("you pick the shorter one", size=28, color=INK).next_to(count, DOWN, buff=0.3)
        self.at("6.2", 0.45)
        self.play(FadeIn(count, scale=0.8), FadeIn(sub), run_time=0.7)
        self.at("6.2", 0.8)
        yours = label("a pattern that belongs to you", size=26, color=INK_SOFT).next_to(sub, DOWN, buff=0.4)
        self.play(FadeIn(yours), run_time=0.5)

        # Today vs planned
        self.at("6.3")
        self.clear_all(0.5)
        today = panel(5.9, 4.9, color=KEPT)
        planned = panel(5.9, 4.9, color=MACHINE, dashed=True)
        VGroup(today, planned).arrange(RIGHT, buff=0.6).shift(DOWN * 0.3)
        tt = label("TODAY", size=34, color=KEPT, weight=BOLD).next_to(today.get_top(), DOWN, buff=0.35)
        pt = label("PLANNED", size=34, color=MACHINE, weight=BOLD).next_to(planned.get_top(), DOWN, buff=0.35)

        def items(lines, box, color):
            g = VGroup(*[label(l, size=28, color=color) for l in lines])
            g.arrange(DOWN, buff=0.38, aligned_edge=LEFT).move_to(box).shift(DOWN * 0.35)
            return g

        ti = items(["the workbench: alternatives,\nghost, Overflow, timeline", "optional: Ctrl+Shift+G gives\n3 suggestions, in blue",
                    "they never replace\nyour words"], today, INK)
        ti[1].set_fill(MACHINE)
        pi = items(["learns from your choices\nand your past writing", "quiet nudges that ask\nquestions",
                    "editor personas who critique"], planned, INK_SOFT)
        self.play(FadeIn(today), FadeIn(tt), run_time=0.6)
        for item, frac in zip(ti, [0.06, 0.22, 0.38]):
            self.at("6.3", frac)
            self.play(FadeIn(item, shift=RIGHT * 0.1), run_time=0.6)
        self.at("6.3", 0.5)
        self.play(FadeIn(planned), FadeIn(pt), run_time=0.6)
        self.at("6.3", 0.6)
        self.play(LaggedStartMap(FadeIn, pi, shift=RIGHT * 0.1, lag_ratio=0.6), run_time=3.5)

        # It never writes the piece
        self.at("6.4")
        self.clear_all(0.5)
        big = label("It never writes the piece for you.", size=48, color=INK, weight=BOLD).shift(UP * 1.6)
        self.play(FadeIn(big, shift=UP * 0.2), run_time=0.8)
        sent = page("The meeting was really very productive.", size=34).shift(DOWN * 0.3)
        self.play(FadeIn(sent), run_time=0.5)
        self.at("6.4", 0.45)
        mark = DashedLine(sent["really very"].get_corner(DL) + DOWN * 0.1, sent["really very"].get_corner(DR) + DOWN * 0.1)
        mark.set_stroke(MACHINE, 3)
        ask = VGroup(label("?", size=30, color=MACHINE, weight=BOLD),
                     label("What was the progress?", size=28, color=MACHINE)).arrange(RIGHT, buff=0.2)
        ask.next_to(sent, DOWN, buff=0.7)
        self.play(ShowCreation(mark), FadeIn(ask, shift=UP * 0.1), run_time=0.8)
        self.at("6.4", 0.8)
        you = label("it asks. you write.", size=28, color=INK_SOFT).to_edge(DOWN, buff=0.6)
        self.play(FadeIn(you), run_time=0.5)
        self.finish()


# ---------------------------------------------------------------- 7. Close
class Scene07Close(TimedScene):
    scene_number = 7

    def construct(self):
        self.at("7.1")
        sent = page(SENTENCE, size=44).shift(UP * 1.2)
        delete = button("DELETE", REJ, width=2.6).shift(DOWN * 0.6)
        self.play(FadeIn(sent), FadeIn(delete), run_time=0.6)
        self.at("7.1", 0.3)
        keys = keycap("Ctrl+Shift+A", size=30).move_to(delete)
        self.play(FadeTransform(delete, keys), run_time=0.7)
        w = wave(sent["productive"])
        self.play(ShowCreation(w), sent["productive"].animate.set_fill(WORD), run_time=0.6)
        self.at("7.1", 0.75)
        wo = page("Write on.", size=80, weight=BOLD)
        self.play(FadeOut(VGroup(sent, w, keys)), FadeIn(wo, scale=1.1), run_time=1.0)
        self.wait(1.2)
        self.play(wo.animate.scale(0.6).to_edge(UP, buff=1.2), run_time=0.8)
        credits = VGroup(
            label("Inspired by Jason Fried's Write_On", size=28, color=INK),
            label("Animated with Grant Sanderson's manim (3b1b/manim)", size=26, color=INK_SOFT),
            label("Narration: Gemini TTS, voice Sulafat", size=26, color=INK_SOFT),
            page("write-on.up.railway.app", size=28, color=WORD),
        ).arrange(DOWN, buff=0.4).shift(DOWN * 0.6)
        self.play(LaggedStartMap(FadeIn, credits, shift=UP * 0.15, lag_ratio=0.3), run_time=1.6)
        self.finish()
