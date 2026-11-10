# Visits counted in Google Analytics, and nothing else

tp53 (2026-11-10) wanted clicks on the tagged launch links (`utm_source`, `utm_medium`, `utm_campaign=write-on-launch-2026-11`, `utm_content`) to show up for the app too, "maybe in GA". Their homepage already reports to GA4 property `G-YQXJ75PNDQ`, so the app reports there as well.

**What is sent:** one page view per visit, made by gtag.js.
- It carries the page address, reduced to the path and the `utm_` tags (`pageLocation`), so a sign-in result such as `?signin=google` never goes along.
- The title is "Write_On app". App visits tell themselves apart from homepage visits by hostname (`write-on.up.railway.app` against `inventcures.github.io`), which GA4 records on every hit.
- Google signals and ad personalisation are off.

**What is never sent:** anything written in the editor, alternatives, Overflow, recordings, the email of a signed-in writer, or any other event from inside the app. Only the page view is counted.

**When it runs:** only on the live host, so local development and tests are never counted, and never when the browser sends Do Not Track or Global Privacy Control. The welcome card says "Visits are counted; your writing never is."

**Considered:**
- GoatCounter alongside, as on the homepage: tp53 named GA, and one counter is enough. GoatCounter records fewer of the tags (no `utm_medium` or `utm_content`).
- Counting on our own server: no dashboard tp53 already uses.
- Counting clicks inside the app: that would edge toward watching people write, which this app promises not to do.
