# Fact check: every product claim in the narration

Checked 2026-11-10 against `main` (README.md, GLOSSARY.md, src/ui/colours.ts, src/ui/styles.css), the app thread's PR #19 (welcome card and "?" button), and the master spec.

| Beat | Claim | Source |
| --- | --- | --- |
| 2.1 | Idea from Jason Fried's Write_On; "not version control, but alternative control" | Fried's launch post, quoted in README.md and the spec |
| 2.4 | Caret on a word + Ctrl+Shift+A gives that word variants | README "Use it": "Alternatives for the word at the caret … Ctrl+Shift+A" |
| 2.5 | Hover and arrow keys flip variants in place | README: "Flip versions: hover and ← →" |
| 2.6 | Three grains; word = thin violet wave, sentence = lower rose wave, paragraph = copper margin bar | GLOSSARY "Grain"; colours.ts `--word`, `--sentence`, `--paragraph` cues |
| 2.7 | A flip is not an edit; nothing to undo | GLOSSARY "Flip": "A flip is not an edit and is never an undo step." |
| 3.2 | Ctrl+/ ghosts: fades almost to nothing, stays in place | README; GLOSSARY "Ghost"; spec: about 11% opacity |
| 3.3 | Ghosted text can be revived | GLOSSARY: "Its reverse is Revive" |
| 3.4 | Ctrl+Shift+X sends text to Overflow, which keeps it to use later | README; GLOSSARY "Stash" / "Use" |
| 4.1 | Green kept, amber undecided, red rejected | colours.ts COLOUR_MEANINGS; README |
| 4.2 | Ctrl+Shift+L opens the timeline | README |
| 4.3 | Zoom from session to moment; a moment shows what changed | GLOSSARY "Timeline", "Moment", "What changed"; spec timeline section |
| 4.4 | Replay, then "edit here" from any moment | Spec "The event-log timeline"; commit 89ce6bc "zoom, replay, what changed, edit here" |
| 5.5 | Opens in read mode with a word count; Ctrl+Shift+R brings tools in; "?" brings the video back | README; GLOSSARY "Read mode"; PR #19 (card one click away from "?") |
| 6.2 | "Shorter 8 of 10" as a pattern | Spec's worked Bradley-Terry example; presented as an illustration, not a shipped feature |
| 6.3 | Today: no AI; writing stays in your browser and files | ADR-0005 (Phase 0 has no AI); README "Your writing never leaves your browser and your files" |
| 6.3 | Planned: learn from choices and past writing, nudges as questions, editor personas | Spec: learning layer, nudge ladder, ADR-0006 personas (Phase 1) |
| 6.4 | It never writes the piece for you | Spec principle 1 and anti-goals; personas only offer labelled, inactive variants (ADR-0006), which the video does not contradict |
