# Write_On

An editor where any word, sentence or paragraph can hold quiet alternatives, and where text can be ghosted back or moved into Overflow instead of deleted. Later phases add a thought partner that learns how the writer writes and nudges, never writes.

## The piece

**Piece**:
The one document being written, as it currently reads.
_Avoid_: Doc, note, draft (as a noun for the file)

**Piece file**:
The Markdown file that holds a piece, its Overflow, and its alternative groups and ghosts in a trailing `write_on` comment.
_Avoid_: Save file, project

**Read mode**:
The state in which only the text and the word count show; all tools are hidden.
_Avoid_: Preview, focus mode

## Alternatives

**Grain**:
The size of text an alternative group works on: word, sentence or paragraph. A short phrase counts as the word grain.
_Avoid_: Scope, level, granularity

**Alternative group**:
A place in the piece that holds two or more variants, exactly one of them showing.
_Avoid_: Span, alternate, alt set, version

**Variant**:
One way of saying the text of an alternative group.
_Avoid_: Alternative (for a single option), version, option

**Active variant**:
The variant currently showing in the piece.
_Avoid_: Selected, current version

**Flip**:
Changing which variant is active. A flip is not an edit and is never an undo step.
_Avoid_: Switch, swap, toggle

**Original**:
The variant that was active when the writer began flipping a group; landing back on it plays the lower tick.
_Avoid_: First variant, default

## Ghost and Overflow

**Ghost**:
To fade text in place to near-invisible without removing it; ghosted text stays editable and counts. Its reverse is **Revive**.
_Avoid_: Dim, hide, strike

**Overflow**:
The plain-text area beside the piece that holds text the writer wants to keep but not use here.
_Avoid_: Stash (as a noun), scratchpad, clipboard

**Stash**:
To move text out of the piece into Overflow. Its reverse is **Use**: moving text from Overflow back into the piece.
_Avoid_: Cut, park

## Learning (later phases)

**Event log**:
The append-only record of what the writer did with variants, ghosts and Overflow, kept per piece; the learning layer's source.
_Avoid_: History, telemetry, analytics

**Timeline**:
The replayable record of a piece: the document it started from and every moment since, kept beside the piece, never in its file.
_Avoid_: History (that's undo), version history, changelog

**Moment**:
One step on the timeline: a burst of writing or one choice (a flip, a ghost, a stash), shown with what changed.
_Avoid_: Entry, revision, commit, diff

**What changed**:
How a moment is shown: the passage as it reads afterwards, with added words marked green and cut words struck through in red.
_Avoid_: Diff, delta, patch

**Lab**:
The AI that marks and trims a piece but never writes new sentences into it.
_Avoid_: Assistant, AI rewrite

**Nudge**:
A small dismissable signal that points at a spot in the piece and says one thing, grounded in the writer's own writing.
_Avoid_: Suggestion, correction
