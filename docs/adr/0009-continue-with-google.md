# Continue with Google: OIDC code flow with PKCE, on the server

tp53 asked (2026-11-10): "enable Google login and sign up also." ADR-0008 had set Google aside only because it needs an OAuth client that tp53 must create; tp53 has now asked for it, so that cost is accepted.

**Flow.** One button, "Continue with Google", does both sign-in and sign-up (Google's own wording, and the honest one: there is nothing to choose).
1. `GET /api/auth/google` redirects to Google with `scope=openid email`, a random `state`, and a PKCE S256 challenge. State and verifier go in a 10-minute `HttpOnly; SameSite=Lax; Secure` cookie scoped to `/api/auth/google`.
2. Google sends the writer to `/api/auth/google/callback`. The server checks `state` against the cookie, trades the code (with the client secret and the verifier) for an ID token at Google's token endpoint, and checks the token's issuer, audience (our client id), expiry, and that the email is verified.
3. It finds or makes the account, starts the same session as email sign-in, and redirects to `/?signin=google` (or `google-new`, or a short error word). The app says how it went and clears the word from the address bar.

**Why server-side and without a library.** The client secret must never reach a browser, and the whole flow is two redirects and one POST. A library (openid-client, passport) would add dependencies for little. The ID token's signature isn't checked: it came straight from Google's token endpoint over TLS, which OpenID Connect Core (3.1.3.7) allows in place of a signature check. Considered: Google Identity Services' browser button (needs Google's script on every page, which is third-party JavaScript next to the writer's private text).

**Which account.** Linked by Google's stable `sub` in a `google_ids` table. On first use, if an account already has that email (and Google says the email is verified), the two are joined, so a writer who started with a password can also use Google. Otherwise a new account is made with no password. A password sign-in to such an account always fails, and takes as long as a real check.

**Redirect URI.** Built from `PUBLIC_URL` when set; otherwise from the request's host. Google only accepts registered redirect URIs, so a forged Host header can't send the code anywhere else, but `PUBLIC_URL` should be set in production anyway.

**Before leaving for Google** the app saves everything and autosaves the open piece, so the writer comes back to the same page, which then moves into their account as with email sign-in.

**Off unless** both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set (and accounts are on). `/api/me` says whether it is on, and the button shows only then.
