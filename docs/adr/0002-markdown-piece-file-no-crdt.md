# The Markdown piece file is the source of truth, and there is no CRDT in Phase 0

A piece is one Markdown file in Fried's format: the piece as it currently reads, then `<!-- overflow -->` and the Overflow text, then a `<!-- write_on {json} -->` comment holding the full document (alternative groups and ghosts) and a hash of the Markdown body it was written with. Browser storage is only an autosave of that file. We deliberately skip the master spec's Yjs CRDT for now: Phase 0 is one writer on one device, ProseMirror's history gives undo, and a second document model would have to be kept in step with ProseMirror for no current benefit. Revisit in Phase 3 (multi-device sync, Yjs attribution for the authorship ledger).

## Consequences

If the Markdown body is edited in another app, the hash no longer matches: the outside edit wins, the body loads as plain Markdown, and the variants of any group that can no longer be placed move into Overflow.
