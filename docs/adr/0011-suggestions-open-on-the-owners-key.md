# Suggestions open to everyone on the owner's key, with a spend alert

tp53 (2026-11-10), seeing the access-code box on the live site: "for now, just to get out of people's way and them fiddling with copy pasting keys, let them use MY gemini api key, but send me a brief email when cumulative usage goes beyond 5$". This revises ADR-0007's access code.

**The access code is now optional.** Suggestions are on whenever `GEMINI_API_KEY` is set. If `WRITE_ON_ACCESS_CODE` is also set, the page still asks for it, exactly as before. So tp53 can close the door again in one step, without a deploy, by setting the variable. `/api/ai` says whether a code is needed, so the page asks only then.
- Considered: removing the code outright (one less lever, and tp53 had just chosen a phrase, so they may want it); bring-your-own-key (the very fiddling tp53 wants to spare people).

**What still holds the key back:** 30 requests an hour per caller, 500 a day in all, 4,000 characters a request. At worst that is roughly a dollar a day at Flash prices, so $5 takes about a week of the heaviest use the caps allow.

**The spend alert.**
- Each Gemini reply reports its token counts (`usageMetadata`). The server prices them (input, and output with thinking tokens counted as output) and keeps a running total in `DATA_DIR/gemini-usage.json`.
- Each time the total passes another `SPEND_ALERT_USD` (default $5), it sends one short email to `ALERT_EMAIL`. It is sent once per step, and remembered across restarts.
- **Email through Resend:** one HTTP call, one API key, a free tier, and a test sender (`onboarding@resend.dev`) that may write to the Resend account's own address with no domain to verify. That is all an alert to the owner needs. Considered: SMTP with a Gmail app password (needs 2-step verification, an app password, and an SMTP library); SendGrid or Mailgun (domain setup).
- **The owner's address is only a Railway variable,** never in the repo, docs or logs.
- **It is an estimate.** The default prices ($0.50 in, $3 out per million tokens) are a guess for a Flash model; set `GEMINI_USD_PER_M_IN` / `_OUT` to the real ones. For the exact figure, a Google Cloud budget alert on the key's project emails from the bill itself, and is the better backstop.
