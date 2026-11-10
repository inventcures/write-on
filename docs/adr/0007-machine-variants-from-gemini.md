# Machine variants come from Gemini, through our server, behind an access code

tp53 asked (2026-11-10) for Gemini, with their own key, to power rephrasing. This is the first Phase 1 feature: Fried's "AI alternatives for selection" (his `??` and Ctrl+Shift+G).

**What the writer gets.** In the alternatives panel, "✦ suggest 3" (or Ctrl+Shift+G) asks for three other ways to say the word, sentence or paragraph. They are added to the group as machine variants: never active, electric blue, labelled "suggested", with a blue dot on the page. The writer's text stays on the page until they flip. Editing one makes it "suggested, edited by you". Each variant's author is kept in the group (`authors`, index for index), saved in the piece file, logged as `variant-added` with `by: 'machine'`, and carried into Overflow as "(suggested)" so machine words are never mistaken for the writer's, by the writer or by the learning layer later.

**The prompt** asks only for other ways to say what is already there: same ideas, same order, the writer's register and rhythm read from the surrounding 1,500 characters either side; for a word, a drop-in that fits the sentence as is. No new ideas, facts or flourishes. That keeps it inside the thesis (ADR-0005, ADR-0006): the machine widens the writer's choices, the writer chooses.

**Where the key lives.** Only in the Railway service's environment (`GEMINI_API_KEY`). The page calls our `/api/suggest`; the server calls Gemini with the key in a header. The key is never in the repo, the bundle, the browser, logs or error messages (provider errors are replaced by our own text).

**Why an access code.** The app is on a public URL, and every call spends tp53's key. Suggestions are off unless both `GEMINI_API_KEY` and `WRITE_ON_ACCESS_CODE` are set; the page asks for the code once and keeps it in that browser. On top: 30 requests an hour per caller, 500 a day in all, 4,000 characters per request, 20-second timeout. Considered and rejected: no guard (anyone could drain the key), sign-in accounts (too much for a one-writer tool today), letting each visitor paste their own key (puts keys in browsers; fine later as an option).

**Model.** `gemini-2.5-flash` by default (fast and cheap, good enough for rephrasing), overridable with `GEMINI_MODEL` without a code change. Structured JSON output, temperature 0.9 for variety.
