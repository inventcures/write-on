# Speech: the writer's own words, through the browser's own recognition

tp53 asked (2026-11-10): "should we add the ability to add speech in WO?" Yes, in the form that fits the thesis (a pairing writer, not a ghostwriter): speech is another way for the writer's own words to get onto the page, never a way for the machine to write.

**What it does.**
- **Speak** (Ctrl+Shift+M, or 🎙 Speak in the bottom bar) dictates at the caret. Words go in as they are heard, with the spacing, capitals and spoken punctuation ("comma", "full stop", "question mark", "new paragraph") a typist would add (`src/core/dictation.ts`). They are ordinary text, so undo, ghost and alternatives work on them as on typing.
- With the **alternatives panel open**, what is said becomes one new variant instead, exactly as if it were typed in the panel's empty row. So trying another phrasing is as fast as saying it. A spoken variant is the writer's, so it is not blue and carries no `by: machine`.
- Each spell of speaking keeps its **recording** (the raw audio, via MediaRecorder, plus what was heard) in this browser's IndexedDB, in its own database `write-on-audio`. Your writing lists them under the piece: play, download, delete. tp53 had just asked how to keep their raw dictated audio; this is the answer inside the app.

**Why the browser's recognition (Web Speech API).** It needs no key, no server of ours, and starts instantly. Chrome, Edge and Safari have it; Firefox doesn't, and there the button doesn't show.
- **Privacy, said plainly:** Chrome sends the sound to Google to turn it into text, and Safari may use Apple's servers. The app says this the first time you speak. The recording itself never leaves the browser.
- **Considered: Gemini transcription** (better accuracy and punctuation, every browser). It spends the key and would sit behind the access code, and it sends the writer's voice to our server and then Google. A good next step for Firefox and for longer dictation, behind the same access code as suggestions.
- **Considered: Whisper in the browser** (fully private). A model download of tens to hundreds of MB on first use is too heavy for now.

**Not in accounts yet.** Recordings stay in this browser even when signed in. Audio is large (about 1 MB a minute), and storing writers' voices on our server is a bigger privacy step than storing their text. If wanted, it would be a separate opt-in.

**"period".** "Full stop" becomes "." anywhere; "period" only at the end of what was said, because it is also a word ("the period of the war").
