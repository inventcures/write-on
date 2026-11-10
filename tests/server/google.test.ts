import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS module
import { apiLimits, cookieOf, handleApi } from '../../server/api.mjs';
// @ts-expect-error plain JS module
import { claimsOf, googleConfig, rejectClaims } from '../../server/google.mjs';
// @ts-expect-error plain JS module
import { openStore } from '../../server/store.mjs';

const CLIENT = 'client-123.apps.googleusercontent.com';
const google = googleConfig({ GOOGLE_CLIENT_ID: CLIENT, GOOGLE_CLIENT_SECRET: 'shh', PUBLIC_URL: 'https://write-on.up.railway.app/' });
const NOW = 1_800_000_000_000;

const idToken = (claims: Record<string, unknown>) =>
  ['x', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'sig'].join('.');
const good = (over: Record<string, unknown> = {}) => ({
  iss: 'https://accounts.google.com', aud: CLIENT, sub: 'g-1', email: 'Writer@Gmail.com', email_verified: true, exp: NOW / 1000 + 600, ...over,
});

type Out = { status: number; body?: Record<string, unknown>; location?: string; cookies?: string[]; cookie?: string };

async function setup(tokenClaims: Record<string, unknown> = good(), tokenStatus = 200) {
  const store = await openStore(null);
  const sent: { url: string; body: URLSearchParams }[] = [];
  const fakeFetch = async (url: string, init: { body: string }) => {
    sent.push({ url, body: new URLSearchParams(init.body) });
    return { ok: tokenStatus === 200, status: tokenStatus, json: async () => (tokenStatus === 200 ? { id_token: idToken(tokenClaims) } : { error: 'invalid_grant' }) };
  };
  const ctx = { store, limits: apiLimits(), google, fetch: fakeFetch };
  const call = (path: string, query = '', cookie = ''): Promise<Out> =>
    handleApi({ method: 'GET', path, query: new URLSearchParams(query), headers: { host: 'evil.example', cookie }, body: null, ip: '1.1.1.1', secure: true, now: NOW }, ctx);
  /** Start, then come back from Google with the state it was given. */
  const roundTrip = async (tamper = false) => {
    const start = await call('/api/auth/google');
    const state = new URL(start.location!).searchParams.get('state')!;
    const stateCookie = start.cookies![0].split(';')[0];
    return call('/api/auth/google/callback', `code=abc&state=${tamper ? 'other' : state}`, stateCookie);
  };
  return { store, call, roundTrip, sent };
}

describe('Continue with Google', () => {
  it('sends the writer to Google with state and PKCE, and the redirect from PUBLIC_URL, never the Host header', async () => {
    const { call } = await setup();
    const out = await call('/api/auth/google');
    expect(out.status).toBe(302);
    const url = new URL(out.location!);
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe(CLIENT);
    expect(url.searchParams.get('redirect_uri')).toBe('https://write-on.up.railway.app/api/auth/google/callback');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toBe('openid email');
    expect(out.location).not.toContain('shh');
    expect(out.cookies![0]).toMatch(/^wo_google=[^;]+; Path=\/api\/auth\/google; HttpOnly; SameSite=Lax; Max-Age=600; Secure$/);
  });

  it('makes an account on first sign-in, signs the same account in next time, and sends the secret only to Google', async () => {
    const { call, roundTrip, sent } = await setup();
    const first = await roundTrip();
    expect(first.location).toBe('/?signin=google-new');
    expect(sent[0].url).toBe('https://oauth2.googleapis.com/token');
    expect(sent[0].body.get('client_secret')).toBe('shh');
    expect(sent[0].body.get('code_verifier')).toBeTruthy();
    const session = first.cookies!.find((c) => c.startsWith('wo_session='))!;
    const token = cookieOf({ cookie: session.split(';')[0] });
    const me = await call('/api/me', '', `wo_session=${token}`);
    expect(me.body).toEqual({ accounts: true, google: true, user: { email: 'writer@gmail.com' } });
    expect((await roundTrip()).location).toBe('/?signin=google');
  });

  it('joins an existing email-and-password account with the same verified email', async () => {
    const { store, roundTrip } = await setup();
    const made = await store.createUser('writer@gmail.com', 'correct horse battery');
    await roundTrip();
    expect(store.userForGoogle('g-1', 'writer@gmail.com').id).toBe(made.id);
    // The password still works, and a Google-only account has none to guess.
    expect(await store.verifyUser('writer@gmail.com', 'correct horse battery')).toBeTruthy();
    const solo = store.userForGoogle('g-2', 'solo@gmail.com');
    expect(await store.verifyUser('solo@gmail.com', '')).toBeNull();
    expect(solo.created).toBe(true);
  });

  it('refuses a tampered state, a cancelled sign-in, and a failed exchange, signing nobody in', async () => {
    const tampered = await (await setup()).roundTrip(true);
    expect(tampered.location).toBe('/?signin=state');
    expect(tampered.cookies!.some((c) => c.startsWith('wo_session='))).toBe(false);
    const { call } = await setup();
    expect((await call('/api/auth/google/callback', 'error=access_denied')).location).toBe('/?signin=cancelled');
    expect((await (await setup(good(), 400)).roundTrip()).location).toBe('/?signin=exchange');
  });

  it('refuses tokens for another app, from another issuer, expired, or with an unverified email', async () => {
    expect((await (await setup(good({ aud: 'someone-else' }))).roundTrip()).location).toBe('/?signin=bad-token');
    expect((await (await setup(good({ iss: 'https://evil.example' }))).roundTrip()).location).toBe('/?signin=bad-token');
    expect((await (await setup(good({ exp: NOW / 1000 - 1 }))).roundTrip()).location).toBe('/?signin=expired');
    expect((await (await setup(good({ email_verified: false }))).roundTrip()).location).toBe('/?signin=unverified');
    expect(claimsOf('not a token')).toBeNull();
    expect(rejectClaims(null, google, NOW)).toBe('bad-token');
  });

  it('is off, and says so, without both the id and the secret', async () => {
    const store = await openStore(null);
    const off = googleConfig({ GOOGLE_CLIENT_ID: CLIENT });
    const ctx = { store, limits: apiLimits(), google: off };
    const req = (path: string) => handleApi({ method: 'GET', path, headers: {}, body: null, ip: '1', secure: true, now: NOW }, ctx);
    expect((await req('/api/me')).body.google).toBe(false);
    expect((await req('/api/auth/google')).status).toBe(404);
  });
});
