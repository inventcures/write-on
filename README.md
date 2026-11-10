# write-on

An editor for thinking on the page. Any word, sentence or paragraph can hold quiet alternatives you flip between in place; text you're unsure of can be ghosted instead of deleted; lines you love but can't use here wait in Overflow. A timeline lets you replay how a piece was written and jump back into any moment.

It reproduces the workbench of Jason Fried's [Write_On](https://x.com/jasonfried/status/2105403067793584590) (alternative control, not version control) as Phase 0 of a writing thought partner that will learn your style and nudge, but never write for you.

A pairing partner for your writing, as in [pair programming](https://martinfowler.com/articles/on-pair-programming.html): you drive, Write_On navigates. It keeps you on track without getting in the way, helps when you ask, then steps back. A pairing writer, not a ghostwriter.

**Try it: https://write-on.up.railway.app** (your writing stays in your browser; only a passage you ask suggestions for is sent, to the server and on to Gemini).

## Use it

| Do this | Keys |
| --- | --- |
| Tools in or out (it opens in read mode) | Ctrl+Shift+R, or click the word count |
| Alternatives for the word at the caret, or the selected sentence or paragraph | Ctrl+Shift+A |
| Suggest 3 more, from the machine (in blue; yours stays until you flip) | Ctrl+Shift+G, or ✦ in the panel |
| Flip alternatives | hover and ← →, or Ctrl+[ / Ctrl+] |
| Ghost it / revive it | Ctrl+/ |
| Stash in Overflow / open Overflow / use from Overflow | Ctrl+Shift+X / Ctrl+Shift+D / Ctrl+Return |
| Timeline | Ctrl+Shift+L |
| Your writing: every piece and moment on one line; sign in | Ctrl+Shift+H, or the button by the word count |
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

Deployed on Railway (project `write-on`, https://write-on.up.railway.app) from this repo (`railway.json`). Design decisions and their reasons: `docs/decisions/`, `docs/adr/`, `GLOSSARY.md`. Phase 0 spec: issue #2.

## Credits

The idea and interaction design are Jason Fried's; this is an independent reproduction built from his public demo. Not affiliated with 37signals.

## Machine suggestions (optional)

Off unless the server has both variables set (ADR-0007):

| Variable | What |
| --- | --- |
| `GEMINI_API_KEY` | Google AI Studio key. Server-side only; never reaches the page. |
| `WRITE_ON_ACCESS_CODE` | A phrase you choose. The page asks for it once, so strangers can't spend your key. |
| `GEMINI_MODEL` | Optional, default `gemini-3.8-flash`. |

Limits: 30 requests an hour per caller, 500 a day in all.

## Accounts (optional)

Off unless the server has lasting storage (ADR-0008). On Railway, add a volume mounted at `/data` and set `DATA_DIR=/data`. Writers then sign in with email and password; each writer's pieces, timelines and event log are theirs alone. Signed out, everything stays in the browser as before.
