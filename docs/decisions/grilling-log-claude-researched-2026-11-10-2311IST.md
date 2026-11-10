# Grilling log: Write_On Phase 0

Produced with Matt Pocock's `grill-with-docs` skill (which runs `grilling` and `domain-modeling`) against the master spec (`docs/spec/` in PR #1, also `/mnt/project-files/spec/`), the SOTA research report, and our frames of Jason Fried's 6:55 demo.

**How this log was made.** The person (tp53) asked not to be prompted: "make apt and judicious choices yourself ... record your reasoning and justification." So every question below was asked by the grilling skill and answered by Claude, using what we know about the project and about tp53: writing is their tool for thinking, and the product must assist and nudge, never write for them. Each entry gives the question, the options, the answer, and why. Anything tp53 disagrees with can be reopened; the ones that are hard to reverse are also ADRs in `docs/adr/`.

The design tree was worked in three rounds. A question only enters a round when the questions it depends on are settled.

---

## Round 1: the roots

### Q1. What does this build cycle cover?

Options: (a) Phase 0 only, the workbench with no AI; (b) Phase 0 plus the original's AI features (`??` alternatives, the Lab); (c) Phases 0 and 1 (adds the style card and rung 1 marks).

**Answer: (a) Phase 0 only.** The spec's roadmap gates each phase on real use: "Gate: you draft a real essay in it and prefer it to your editor." If alternatives, Ghost and Overflow don't make writing better on their own, no model on top will save it. Phase 1 needs the event log that Phase 0 produces, so building Phase 0 first is also the dependency order. (b) is tempting because Fried's original has AI, but adding AI before the gate would blur what the gate measures. See ADR-0005.

### Q2. Where does it run?

Options: web app; desktop (Tauri); Obsidian or VS Code plugin.

**Answer: a web app, deployed to Railway.** The spec recommends web for speed of iteration, and tp53 has since chosen Railway for the first deploy. A browser app served as static files is the simplest thing Railway can build and run. Tauri stays a later port; nothing here blocks it.

### Q3. What is the canonical file?

Options: (a) Fried's format: one Markdown file, ordinary Markdown for the piece as it currently reads, `<!-- overflow -->` then Overflow text, then a `<!-- write_on {json} -->` comment holding alternatives and ghosts; (b) our own JSON file; (c) browser storage only.

**Answer: (a).** Fried: "it's all Markdown, too. Alternatives, overflow, etc." Other tools still see a readable piece, which matters for a person whose writing outlives any one app (spec principle 8, "your model is yours"). Browser storage is used only as an autosave of the current file, never as the source of truth. See ADR-0002.

### Q4. What do we call things?

The spec uses two vocabularies: its own (alternate, dim, stash) and Fried's (Alternatives, Ghost, Overflow, Lab).

**Answer: Fried's names everywhere, in code and UI.** Two names for one thing is how code and conversation drift apart. Fried's names are already on screen, and "Ghost" says more than "dim" (the text is still there, still editable). Recorded in `GLOSSARY.md`.

### Q5. How faithful to the video?

Options: pixel-faithful; faithful in behavior but our own look; our own taste throughout.

**Answer: faithful in behavior and look first, then our own taste** (the roadmap's words: "Match the video's behavior first, then our own taste"). That means the navy page, peach IBM Plex Mono at 20 px in a 780 px column, Caveat for labels, wavy hand-drawn marks, dots per variant, the tick sounds with the lower "home" tick, the delete explosion, read mode on open, and the Control-key shortcuts. Left out: Post to X, the LinkedIn joke button, the Lab and `??` (Q1). Fonts are bundled from their open-licensed npm packages so the app works offline and loads nothing from Google at runtime.

### Q6. Which issue tracker do the skills use?

Options: GitHub Issues on `inventcures/write-on`; local Markdown under `.scratch/`.

**Answer: GitHub Issues.** The skills were designed for it, the repo is already on GitHub, and native sub-issues and blocking edges show the task graph. The repo is public, so the issues are too; they contain only our spec, never Fried's video or frames.

---

## Round 2: depends on Q1 to Q3

### Q7. Which editor core?

Options: (a) ProseMirror directly; (b) TipTap (a ProseMirror wrapper, the spec's recommendation); (c) Lexical; (d) CodeMirror 6 over raw Markdown; (e) hand-rolled contenteditable.

**Answer: (a) ProseMirror directly, with plain TypeScript and no UI framework.** Everything distinctive here (alternative groups, ghosts, flips that aren't undo steps, the wavy overlay) lives at ProseMirror's level anyway: marks, node attributes, plugins, decorations. TipTap's main value is its extension API and React bindings, which we'd mostly route around. Lexical has a weaker Markdown story. CodeMirror would show Markdown syntax, which isn't what Fried shows. Hand-rolled contenteditable is months of edge cases. ProseMirror's state layer also runs in Node with no DOM, which gives us a fast test seam (Q14). The UI chrome is small (two side panels, a few icons, a help sheet), so plain DOM code is enough and keeps the dependency list short. See ADR-0001.

### Q8. Do we need Yjs (a CRDT) in Phase 0?

The spec proposes Yjs for undo, local-first storage and later sync.

**Answer: no.** Phase 0 is one person on one device. ProseMirror's own history gives undo, and the Markdown file gives storage. Yjs adds a second document model to keep in step with ProseMirror and a sync story we don't need until Phase 3. Its attribution features (useful for the authorship ledger) can be adopted then. See ADR-0002.

### Q9. Where do a group's variants live?

Options: (a) inside the ProseMirror document, as attributes on the group's mark (word and sentence) or on the paragraph node (paragraph); (b) in a side store keyed by group id.

**Answer: (a).** Then save, load, copy and undo all see one structure, and a group can never point at text that no longer exists. The active variant is the live text in the page; the other variants are kept in the attribute. See ADR-0003.

### Q10. Are flips undo steps?

**Answer: no, matching the clips** ("which version shows is state, not an edit"). A flip is applied with `addToHistory: false`, so Ctrl+Z walks back through your writing, not your browsing. Adding a variant, deleting a variant, ghosting and stashing are edits and are undoable.

### Q11. Can groups nest?

Options: (a) flat, as in both clones; (b) nested (the spec's Phase 2 idea).

**Answer: flat in Phase 0**, as the spec already decided. The open sub-question is what happens when you make a sentence group over word groups. The replica flattens and silently drops the inner variants. That breaks spec principle 2, "nothing is ever lost". **Our answer: flatten, keep each inner group's active text, and move its other variants into Overflow** with a short label of where they came from. See ADR-0004.

*Revised while implementing:* a paragraph group may hold word and sentence groups inside its variants. Variants are stored as document content (Q9), so inner groups simply travel with the paragraph variant they were made in, and nothing has to be flattened or lost. Only word-over-word and sentence-over-word overlaps flatten.

### Q12. What happens if someone edits the Markdown body in another app?

**Answer: the JSON comment stores a hash of the body it was written with.** On open, if the hash matches, we restore the full document from the JSON. If it doesn't, the outside edit wins: we load the Markdown body as plain text and put the variants of any group we can no longer place into Overflow, again so nothing is lost. A small notice says this happened.

### Q13. Where does the event log go?

**Answer: an append-only log per document in the browser's IndexedDB**, with an export to JSON lines. It records exactly the `EditEvent` kinds from the spec's data model that Phase 0 can produce (variant added, selected, deleted; ghosted, revived; stashed, used). It is not written into the Markdown file: it's the learning layer's training data, it grows without bound, and the piece itself should stay clean. Phase 1 reads it.

---

## Round 3: interaction details

### Q14. Where are the tests?

Options: unit tests on internals; one high seam; only browser end-to-end tests.

**Answer: one main seam, the editor core**: create a state from a file, run commands on it (make a group, add a variant, flip, ghost, stash, use), and serialize back to a file. It runs headless in Vitest with no browser, so it is fast and doesn't break when the UI changes. A second, thin seam is a handful of Playwright tests that drive the real app with the keyboard (open, read mode toggle, make alternatives, cycle, ghost, stash, save). Nothing tests private helpers.

### Q15. How does a selection decide the grain?

**Answer: the replica's rule.** A whole paragraph selected makes a paragraph group, whole sentences make a sentence group, anything else (a word or short phrase) makes a word group. With no selection, Ctrl+Shift+A acts on the word under the caret.

### Q16. Who owns the arrow keys?

Fried cycles by hovering and pressing arrows. Spec principle 9 says keyboard first.

**Answer: both.** While the pointer is over a group and was the last thing you used, Left/Right flip it (Fried's behavior); typing hands the arrows back to the caret. For keyboard-only use, Ctrl+[ and Ctrl+] flip the group under the caret. These don't clash with browser or OS shortcuts on Chrome, Firefox or Safari.

### Q17. What is "the original" for the lower tick?

**Answer: the variant that was active when you started cycling that group.** A cycling session ends when you move away from the group or start typing. Landing back on it plays the lower tick. Sounds are synthesized with the Web Audio API (no sound files), and there's a mute toggle.

### Q18. Does grammar follow a flip ("a thumbtack" to "an eraser")?

**Answer: yes, for a/an only.** When a word group flips and the word before it is "a" or "an", we fix the article for the new word (with the common exceptions: "an hour", "a university", "a one-off"). It's mechanical agreement, not prose, so it fits the thesis. It applies only to the article right before the group, and it's part of the flip, so it isn't an undo step either.

### Q19. What does Delete do on a group?

**Answer: while the pointer owns the arrows, Delete or Backspace removes the showing variant** with a small explosion, and the next one shows. If one variant would be left, the group dissolves into plain text. It is undoable. While you're typing, Delete is ordinary deletion. The explosion respects "reduce motion".

### Q20. What does Ghost do to word count and export?

**Answer: ghosted text stays in the page, stays editable, and counts** (as in the clip). Save keeps it, since the file must hold everything. A separate **Export** writes a clean Markdown copy with ghosted text, Overflow and the JSON comment all left out (the spec's "our export leaves it out by default").

### Q21. Overflow: plain text area or a list with back-links?

**Answer: a plain text area, as in Fried's.** Ctrl+Shift+X stashes the selection (or the paragraph at the caret) at the end of Overflow; Ctrl+Return in Overflow (or drag into the page) uses the paragraph at Overflow's caret, inserting it at the page's last caret position. Where each item came from is recorded in the event log, not in the UI, which keeps the panel as simple as Fried's. A list with back-links can come later if real use asks for it.

### Q22. Saving and opening on the web?

**Answer: the File System Access API where the browser has it** (Chrome, Edge), so Ctrl+S writes back to the same `.md` file on your laptop. Elsewhere, Open uses a file picker and Save downloads the file. Every change is also autosaved to the browser so a closed tab loses nothing. A new visitor sees a short sample piece that demonstrates every feature (our own text, not Fried's).

### Q23. What runs on Railway?

**Answer: a static build served by a tiny Node server** (`npm run build`, then `npm start` serving `dist/` on `$PORT`). No database, no accounts: your pieces stay in your browser and your files. The deploy itself is the last ticket, run from tp53's laptop where the Railway CLI is logged in, creating a project named `write-on`.

---

## What changes in the master spec

The master spec stays the source for the long-term design. This log narrows it for Phase 0 in these places, which should flow back into the spec: Q7 (ProseMirror, not TipTap), Q8 (no Yjs yet), Q11 (flattening sends inner variants to Overflow), Q12 (the body hash), Q13 (event log outside the file), Q16 (Ctrl+[ and Ctrl+]), Q23 (Railway).

## Check your understanding

1. You hold three variants of a sentence, flip to the second, type a word into it, then press Ctrl+Z. What gets undone, and why isn't it the flip?
2. You make a sentence group over a sentence that contains the word group "paperclip / thumbtack / eraser", with "thumbtack" showing. Where does each of the three words end up?
3. You open your piece in another Markdown editor, fix a typo in paragraph 2, and reopen it in Write_On. What does Q12 do, and what would you see if paragraph 2 had a paragraph group?

---

## Round 4: new asks from tp53 during implementation (2026-11-10)

tp53 asked for (1) multiple views of the event log, starting with a horizontal timeline of every edit that can be zoomed from "10,000 feet" down to single events, replayed, and used to drop into editing that passage; and (2) persona-based adversarial review of every atomic piece (word, phrase, line, paragraph, opening, close, cold open) in the voices of a New Yorker, NYT or Vanity Fair editor, a favourite writer, or "you, from your own history".

### Q24. Can the existing event log support a replay?

No. It records choices (flips, ghosts, stashes), not typing. A replay needs every change. **Answer: record every document change as ProseMirror steps**, coalesced into one entry per burst of typing (a pause of over a second, or any choice, starts a new entry), with a timestamp and a label (typed, deleted, flipped, ghosted…). Steps replay exactly from the first recorded document. Kept in IndexedDB per piece, never in the piece file, which stays clean Markdown.

### Q25. Which views ship now?

**Answer: the horizontal timeline only**, with zoom, scrubbing, play/pause, a per-event "before → after" view, and "edit here" (jump to that passage in the current piece, mapped forward through later edits, and open the alternatives panel there). Other views (lanes per paragraph, by kind of change) wait until real use shows which one is missing. Phase 0, two new tickets before the deploy.

### Q26. Where do personas go?

**Answer: Phase 1**, the first AI phase, as its own spec issue. They need a model, and Phase 0's gate is about the no-AI workbench (ADR-0005).

### Q27. How do persona rewrites square with "the human writes every sentence that ships"?

The master spec's gray-zone rule says help at sentence level or above arrives as a question, never as drop-in text. tp53 explicitly asked for persona rephrasings of lines, openings and closes. **Answer: persona output comes in two forms.** A critique (questions and notes in that editor's voice, as marginalia), and rewrites that arrive only as extra variants under the writer's own text: labelled with the persona, never active until the writer flips to them, and marked as machine-written in the authorship ledger. The writer still chooses, edits and owns every line; the piece never changes on its own. This deliberately loosens the spec's rule, at the writer's request, and is recorded as ADR-0006. The blind voice test and ownership score from the spec are the tripwires if it starts to homogenise their voice.

### Q28. How does the timeline show what changed, for writers who've never heard the word "diff"?

tp53 asked for "clever diffing" designed from a perception and HCI point of view. Options: (a) a programmer's red/green line diff; (b) side-by-side before and after; (c) an editor's marked-up page.

**Answer: (c), the way an editor marks a page, and no jargon in the UI** (the word "diff" never appears; the view is "What changed"). The reasons, each tied to how people read:

- **Words, not characters or lines.** People read in words and phrases; a character-level change ("clo" → "kna") is noise. Changes are computed word by word over the sentence.
- **Whole sentence in context.** A change only means something inside its sentence (the same reason Write_On flips variants in place). We show the full sentence as it reads afterwards, not a fragment.
- **Familiar marks.** Added words get a soft highlighter wash; cut words stay where they were, faded and struck through with the app's hand-drawn pen line. Writers already know proofreading marks and tracked changes; the pen line ties it to the rest of Write_On. Colour is never the only signal (strike-through and fade also carry it), so it works for colour-blind readers.
- **A plain caption first.** "Changed ‘close’ to ‘knack’", "Cut 14 words", "Added 2 sentences", "Tried another version of this sentence", "Ghosted a sentence", "Moved a paragraph to Overflow". The caption answers "what happened here?" before the eye parses any marks.
- **Motion for change, focus for place.** Change blindness means people miss static differences between two pictures; during replay, added words fade in and cut words fade out so the eye catches each change. The rest of the piece dims (as with the alternatives panel) and the view scrolls to the passage, so there's never a hunt.
- **Typing is grouped into moments.** A burst of typing is one moment, so the timeline reads as a sequence of decisions, not keystrokes.

### Q29. Keybindings: fixed or customisable?

tp53: "default sensible keybinds, but allow the user to customise those through a simple visual UI". **Answer: one table of actions with Write_On's Control-key defaults; the shortcuts sheet is the editor.** Click a binding, press the keys, done. If those keys belonged to another action, the sheet says so and that action becomes "not set" (rather than silently swapping, which surprises people). Reset per row and reset all. Stored in this browser only. The hover keys (arrows and Delete over a group), undo/redo and bold/italic stay fixed: they are part of editing itself, and changing them would break muscle memory from every other editor. Button tooltips and the right-click menu always show the current keys.

A bug found while testing this: a shortcut pressed right after a click could act on the previous selection, because the browser reports the new selection a moment later. Shortcuts now read the latest selection before acting.

### Q30. What do colours mean?

tp53 set the core: **red = rejected or "bad", amber = unsure or "mid", green = accepted or "good"**, and invited more colours and meanings. The vocabulary, used everywhere (editor, panels, timeline, replay):

| Colour | Meaning | Second cue (so it reads without colour) |
| --- | --- | --- |
| Green | Kept: words added that stay, the version chosen, text brought back | Solid highlight |
| Red | Rejected: words cut, versions dropped | Hand-drawn strike-through |
| Amber | Undecided: ghosted text, Overflow, versions held but not showing | Faded (ghost) or striped/dashed (Overflow) |
| Violet / rose / copper | Which grain an alternative is at: word / sentence / paragraph (Fried's marks) | Thin underline / lower underline / margin bar |
| Electric blue | Reserved for machine-suggested text (Phase 1) | Robot mark and a label |

Why: a colour that always means one thing becomes a scaffold the writer reads without thinking (like traffic lights, which tp53 chose on purpose). Judgement colours (green, amber, red) are kept apart from location colours (the grain marks), so "this is a sentence alternative" never reads as "this is bad". Machine text gets a colour nothing else uses, following iA Writer's finding that a quiet grey for AI text was "too quiet". The shortcuts sheet carries a colour key.

## Round 5: code review outcome (2026-11-10)

The code-review step ran two reviewers side by side: one against the repo's standards (glossary, ADRs, code hygiene) and one against the spec and tickets. Everything they found is fixed except what is listed under "kept on purpose".

**Standards review, fixed**
- Glossary terms in code and copy: "version" became "alternative", the `history` module and variables became `moments` / `pieceTimeline` (glossary: Timeline, Moment, What changed; avoid History, Entry, Diff).
- One event vocabulary: the event log and the timeline now share the same kinds (`variant-added`, `flipped`, `variant-dropped`, `ghosted`, `revived`, `stashed`, `used`), and `variant-dropped` is coloured as cutting everywhere.
- A data-loss bug: edits made while the stored timeline was still loading were thrown away. Now they are appended after the stored moments.
- Small hygiene: comma operators, a dead line, a redundant start call.

**Spec review, fixed**
- Recovery after an outside edit now picks the occurrence of a group's text nearest its old place, not the first one, and the notice also counts ghosted passages that could not be found.
- "What changed" crops to whole sentences around each change, so a caption never starts mid-sentence.
- Keybindings: a shortcut must use Ctrl, Alt or ⌘ (so it can't swallow typing), the editor's own keys (undo, redo, bold, italic, copy, paste, cut, select all) can't be taken, and resetting one row takes its default back from any action that had borrowed it, saying so.
- Dragging an item out of Overflow onto the page now logs a `used` event, the same as Ctrl+Enter.

**Kept on purpose (revisions of earlier answers)**
- Q21 revision: Use puts the item in as a new paragraph after the paragraph holding the page caret, not at the caret. Dropping a paragraph into the middle of a sentence was never what a writer wanted in testing, and a paragraph keeps any paragraph group it carries. Drag-and-drop is there for exact placement.
- Small scope beyond the tickets, each cheap and each in service of the spec: Markdown input rules (`# ` for headings, `**bold**`, `*italic*`), a New button, a replay speed control on the timeline, `/healthz` and two safety headers (nosniff, no-referrer) in the server for Railway; the server also survives a malformed URL instead of crashing.

## Round 6: deploy (2026-11-10)

- **Where it lives:** https://write-on.up.railway.app, Railway project `write-on` in tp53's personal workspace, service `write-on`. tp53 chose the subdomain.
- **How it got there:** a fresh shallow clone of the branch on tp53's laptop, `railway whoami` checked against their account first, tests and build run before upload. Their own checkout (with an uncommitted `.gitignore` and local video files) was never touched or uploaded. Claude Code's safety check on the laptop refused the production upload, so tp53 ran `railway add` / `railway up` / `railway domain` themselves. No environment variables are needed: Railway sets `PORT`, and Phase 0 has no secrets.
- **Next:** connect the GitHub repo (branch `main`) in the Railway project's settings so every merge deploys itself.
