# ProseMirror directly, with no UI framework

Alternative groups, ghosts, flips that bypass history and the hand-drawn overlay all live at ProseMirror's level (marks, node attributes, plugins, decorations), so we use ProseMirror directly instead of TipTap (the master spec's recommendation), Lexical, CodeMirror or a hand-rolled contenteditable. The chrome around the page is small, so it is plain TypeScript and DOM code rather than React. ProseMirror's state layer runs in Node with no DOM, which is what makes the editor core testable headless.

## Considered options

- **TipTap**: its value is the extension API and React bindings, which we would mostly route around for custom marks and history-free flips.
- **Lexical**: weaker Markdown round-tripping.
- **CodeMirror 6**: shows Markdown syntax, which Write_On does not.
