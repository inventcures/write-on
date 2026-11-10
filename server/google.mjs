// "Continue with Google" (ADR-0009): OpenID Connect's authorization code flow
// with PKCE, done on the server so the client secret never reaches a browser.
// No library: two redirects and one token exchange.
import { createHash, randomBytes } from 'node:crypto';

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
export const STATE_COOKIE = 'wo_google';
const STATE_PATH = '/api/auth/google';

/** On only when both the client id and secret are set. */
export function googleConfig(env) {
  const clientId = env.GOOGLE_CLIENT_ID ?? '';
  const clientSecret = env.GOOGLE_CLIENT_SECRET ?? '';
  return { enabled: !!(clientId && clientSecret), clientId, clientSecret, publicUrl: (env.PUBLIC_URL ?? '').replace(/\/+$/, '') };
}

/** Where Google sends the writer back. PUBLIC_URL wins; else the request's own host. */
export function redirectUri(cfg, headers, secure) {
  const base = cfg.publicUrl || `${secure ? 'https' : 'http'}://${String(headers.host ?? 'localhost')}`;
  return `${base}${STATE_PATH}/callback`;
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function stateCookie(value, maxAge, secure) {
  return `${STATE_COOKIE}=${value}; Path=${STATE_PATH}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

function readCookie(headers, name) {
  for (const part of String(headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return '';
}

/** Step 1: send the writer to Google, remembering state and the PKCE verifier in a short cookie. */
export function startGoogle(req, cfg) {
  const state = b64url(randomBytes(18));
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const url = new URL(AUTH);
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri(cfg, req.headers, req.secure),
    response_type: 'code',
    scope: 'openid email',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return { status: 302, location: url.toString(), cookies: [stateCookie(`${state}.${verifier}`, 600, req.secure)] };
}

/** The claims of an ID token. Its signature isn't checked: it came straight from Google's token endpoint over TLS (OIDC Core 3.1.3.7). */
export function claimsOf(idToken) {
  const part = String(idToken ?? '').split('.')[1];
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

/** Why these claims can't sign anyone in, or null if they can. */
export function rejectClaims(claims, cfg, now) {
  if (!claims || typeof claims !== 'object') return 'bad-token';
  if (!ISSUERS.has(claims.iss)) return 'bad-token';
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(cfg.clientId)) return 'bad-token';
  if (typeof claims.exp !== 'number' || claims.exp * 1000 < now) return 'expired';
  if (typeof claims.sub !== 'string' || !claims.sub) return 'bad-token';
  if (typeof claims.email !== 'string' || claims.email_verified !== true) return 'unverified';
  return null;
}

/**
 * Step 2: Google sent the writer back with a code. Check state, trade the code
 * for an ID token, and return { user } or { error } plus the cookie that clears state.
 */
export async function finishGoogle(req, cfg, query, fetchFn) {
  const clear = stateCookie('', 0, req.secure);
  const [state, verifier] = readCookie(req.headers, STATE_COOKIE).split('.');
  if (query.get('error')) return { error: 'cancelled', clear };
  if (!state || !verifier || query.get('state') !== state || !query.get('code')) return { error: 'state', clear };
  let res;
  try {
    res = await fetchFn(TOKEN, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: query.get('code'),
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: redirectUri(cfg, req.headers, req.secure),
        grant_type: 'authorization_code',
        code_verifier: verifier,
      }).toString(),
    });
  } catch {
    return { error: 'unreachable', clear };
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('google token exchange failed', res.status, body?.error);
    return { error: 'exchange', clear };
  }
  const claims = claimsOf(body.id_token);
  const why = rejectClaims(claims, cfg, req.now);
  if (why) return { error: why, clear };
  return { user: { sub: claims.sub, email: claims.email.trim().toLowerCase() }, clear };
}
