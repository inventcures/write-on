# write-on

An editor for thinking on the page. Any word, sentence or paragraph can hold quiet alternatives you flip between in place; text you're unsure of can be ghosted instead of deleted; lines you love but can't use here wait in Overflow. A timeline lets you replay how a piece was written and jump back into any moment.

It reproduces the workbench of Jason Fried's [Write_On](https://x.com/jasonfried/status/2105403067793584590) (alternative control, not version control) as Phase 0 of a writing thought partner that will learn your style and nudge, but never write for you.

## Use it

| Do this | Keys |
| --- | --- |
| Tools in or out (it opens in read mode) | Ctrl+Shift+R, or click the word count |
| Alternatives for the word at the caret, or the selected sentence or paragraph | Ctrl+Shift+A |
| Flip versions | hover and ← →, or Ctrl+[ / Ctrl+] |
| Ghost it / revive it | Ctrl+/ |
| Stash in Overflow / open Overflow / use from Overflow | Ctrl+Shift+X / Ctrl+Shift+D / Ctrl+Return |
| Timeline | Ctrl+Shift+L |
| Save / open (one Markdown file) | Ctrl+S / Ctrl+O |

Every shortcut can be changed in the shortcuts sheet (the ⌨ icon), which also explains the colours: green kept, amber undecided, red rejected.

Your writing never leaves your browser and your files. A piece is one Markdown file: the piece as it reads, then Overflow, then a `write_on` comment holding the alternatives and ghosts.

## Develop

```sh
npm install
npm run dev          # http://localhost:5173
npm test             # editor core, headless (Vitest)
npm run test:e2e     # the real app in Chromium (Playwright)
npm run build && npm start   # production build served on $PORT
```

Deployed on Railway from this repo (`railway.json`). Design decisions and their reasons: `docs/decisions/`, `docs/adr/`, `GLOSSARY.md`. Phase 0 spec: issue #2.

## Credits

The idea and interaction design are Jason Fried's; this is an independent reproduction built from his public demo. Not affiliated with 37signals.
