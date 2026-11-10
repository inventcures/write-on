# Word and sentence groups do not nest; flattening sends inner variants to Overflow

As in both open-source clones, word and sentence groups never overlap in Phase 0. Making one over text that already contains word or sentence groups flattens them: each inner group's showing variant becomes ordinary text, and its other variants are appended to Overflow with a "from …" note. The clones drop those variants; we keep them, because "nothing is ever lost" is a core principle. For the same reason, if ordinary editing deletes all of a group's text, its other variants go to Overflow too.

A paragraph group is different: it may contain word and sentence groups, which are stored inside the paragraph variant they were made in and come back when that variant shows again. This fell out of storing variants as document content (ADR-0003), loses nothing, and is the first step of the master spec's Phase 2 nesting idea, so we kept it rather than forbid word groups inside paragraph groups.
