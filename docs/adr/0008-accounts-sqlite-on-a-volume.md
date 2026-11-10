# Accounts: email and password, one SQLite file on a Railway volume

tp53 asked (2026-11-10) for "user controls: auth, login, history" and an event log of all their writing on one horizontal timeline.

**Sign-in: email and password.** Passwords are hashed with scrypt (Node's own crypto). Sessions are random 256-bit tokens, stored only as SHA-256 hashes, and sent as an `HttpOnly; SameSite=Lax; Secure` cookie that lasts 30 days. Every write also needs an `x-write-on: 1` header; a cross-site page can't send that without a CORS preflight, which we never grant, so this and SameSite stop CSRF. Limits: 20 sign-in attempts per 15 minutes per address and 10 per email; 5 new accounts an hour per address. A wrong password and an unknown email give the same answer, and take the same time.
- Considered: **Google or GitHub sign-in** (each needs an OAuth app registered and secrets set by tp53, and ties writers to a big platform); **magic links by email** (needs an email provider and a paid sender); **passkeys** (best security, but recovery is hard to get right and support varies). Email and password works today with nothing to set up. Passkeys are a good next step.
- Not yet: password reset (it needs email). For now a writer who forgets their password has to make a new account. This is said plainly here so it isn't a surprise.

**Storage: one SQLite file** (`DATA_DIR/write-on.sqlite`) through Node's built-in `node:sqlite`, so there's no new dependency and no database server. On Railway it lives on a volume mounted at `DATA_DIR` (for example `/data`), so it survives deploys. Accounts are **off unless `DATA_DIR` is set**. Without lasting storage, every deploy would quietly wipe everyone's account, which is worse than having no accounts. Considered: Railway Postgres (a second service, more to run, no real gain for one app at this size).

**What is stored, per writer and only for them:**
- each piece file (the same Markdown file as on disk);
- its timeline of moments;
- its event log.

Every query is scoped by the signed-in user's id. A second writer using the same piece id gets their own separate row and can never read or overwrite the first's. Caps: 500 pieces, 2 MB per piece file, 8 MB per timeline.

**Signed out, nothing changes:** pieces live in this browser (localStorage and IndexedDB) as before, and now there can be several of them. When the writer signs in, the piece on screen comes into their account, and the others are offered with one click; nothing is copied without that click. When they sign out, the account's writing leaves the screen and the browser's own copy of it is cleared, so it doesn't stay behind on a shared computer.

**"Your writing"** reads only the moments of each piece (time, kind, and whether WO took part), never the text, to draw every piece on one line.
