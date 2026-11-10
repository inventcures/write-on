// The account API (ADR-0008): sign up, sign in, and each writer's own pieces,
// events and timelines. Pure request → response, so it is testable without a socket.
import { LIMITS } from './store.mjs';

export const COOKIE = 'wo_session';
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KINDS = new Set(['variant-added', 'flipped', 'variant-dropped', 'ghosted', 'revived', 'stashed', 'used']);

/** Counts attempts per key in a sliding window. */
export function windowLimiter(max, windowMs) {
  const hits = new Map();
  return (key, now) => {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 10_000) hits.clear();
    return true;
  };
}

export function apiLimits() {
  return {
    login: windowLimiter(20, 15 * 60_000),
    loginEmail: windowLimiter(10, 15 * 60_000),
    signup: windowLimiter(5, 60 * 60_000),
  };
}

export function cookieOf(headers) {
  const raw = String(headers.cookie ?? '');
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return v.join('=');
  }
  return '';
}

function sessionCookie(token, maxAge, secure) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

const ok = (body, extra = {}) => ({ status: 200, body, ...extra });
const no = (status, error) => ({ status, body: { error } });

function cleanEvent(e) {
  if (!e || typeof e !== 'object' || !KINDS.has(e.kind) || typeof e.t !== 'number' || !Number.isFinite(e.t)) return null;
  const out = { kind: e.kind, t: Math.round(e.t) };
  if (typeof e.text === 'string') out.text = e.text.slice(0, LIMITS.eventTextChars);
  if (typeof e.groupId === 'string' && ID.test(e.groupId)) out.groupId = e.groupId;
  if (typeof e.grain === 'string' && ['word', 'sentence', 'paragraph'].includes(e.grain)) out.grain = e.grain;
  if (Number.isInteger(e.from)) out.from = e.from;
  if (Number.isInteger(e.to)) out.to = e.to;
  if (e.by === 'machine') out.by = 'machine';
  return out;
}

/**
 * req: { method, path, headers, body (parsed JSON or null), ip, secure, now }
 * ctx: { store, limits }
 * Returns { status, body, cookie? }.
 */
export async function handleApi(req, ctx) {
  const { store, limits } = ctx;
  const { method, path, headers, body, ip, now } = req;
  const mutating = method !== 'GET' && method !== 'HEAD';
  // A custom header can't be sent cross-site without a CORS preflight, which
  // we never grant: together with SameSite cookies this stops CSRF.
  if (mutating && headers['x-write-on'] !== '1') return no(403, 'Missing request header.');

  if (path === '/api/me' && method === 'GET') {
    const user = store.userForSession(cookieOf(headers), now);
    return ok({ accounts: true, user: user ? { email: user.email } : null });
  }

  if ((path === '/api/signup' || path === '/api/login') && method === 'POST') {
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!EMAIL.test(email) || email.length > 254) return no(400, 'That doesn’t look like an email address.');
    if (path === '/api/signup') {
      if (password.length < 10 || password.length > 200) return no(400, 'Use a password of at least 10 characters.');
      if (!limits.signup(ip, now)) return no(429, 'Too many new accounts from here. Try again later.');
      const user = await store.createUser(email, password, now);
      if (!user) return no(409, 'There’s already an account with that email. Sign in instead.');
      const s = store.createSession(user.id, now);
      return ok({ user: { email } }, { cookie: sessionCookie(s.token, s.maxAge, req.secure) });
    }
    if (!limits.login(ip, now) || !limits.loginEmail(email, now)) return no(429, 'Too many tries. Wait a few minutes.');
    const user = password ? await store.verifyUser(email, password) : null;
    if (!user) return no(401, 'That email and password don’t match.');
    const s = store.createSession(user.id, now);
    return ok({ user: { email: user.email } }, { cookie: sessionCookie(s.token, s.maxAge, req.secure) });
  }

  if (path === '/api/logout' && method === 'POST') {
    store.endSession(cookieOf(headers));
    return ok({ user: null }, { cookie: sessionCookie('', 0, req.secure) });
  }

  // Everything below is the signed-in writer's own data, and only theirs.
  const user = store.userForSession(cookieOf(headers), now);
  if (!user) return no(401, 'Sign in first.');

  if (path === '/api/pieces' && method === 'GET') return ok({ pieces: store.listPieces(user.id) });

  const piece = /^\/api\/pieces\/([^/]+)$/.exec(path);
  if (piece) {
    const id = decodeURIComponent(piece[1]);
    if (!ID.test(id)) return no(400, 'Bad piece id.');
    if (method === 'GET') {
      const found = store.getPiece(user.id, id);
      return found ? ok({ piece: found }) : no(404, 'No such piece.');
    }
    if (method === 'PUT') {
      const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 200) || 'Untitled' : 'Untitled';
      const file = typeof body?.file === 'string' ? body.file : null;
      const words = Number.isInteger(body?.words) && body.words >= 0 ? body.words : 0;
      if (file === null) return no(400, 'Nothing to save.');
      const result = store.putPiece(user.id, id, { title, file, words }, now);
      if (result === 'too-big') return no(413, 'This piece is too big to save to your account.');
      if (result === 'too-many') return no(409, 'You have reached the number of pieces an account can hold.');
      return ok({ saved: now });
    }
    if (method === 'DELETE') {
      store.deletePiece(user.id, id);
      return ok({ deleted: id });
    }
  }

  if (path === '/api/activity' && method === 'GET') return ok({ activity: store.activity(user.id) });
  if (path === '/api/events' && method === 'GET') return ok({ events: store.allEvents(user.id) });
  if (path === '/api/events' && method === 'POST') {
    const pieceId = typeof body?.pieceId === 'string' ? body.pieceId : '';
    if (!ID.test(pieceId) || !Array.isArray(body?.events)) return no(400, 'Bad events.');
    const events = body.events.slice(0, LIMITS.eventsPerPost).map(cleanEvent).filter(Boolean);
    store.addEvents(user.id, pieceId, events);
    return ok({ added: events.length });
  }

  const tl = /^\/api\/timelines\/([^/]+)$/.exec(path);
  if (tl) {
    const id = decodeURIComponent(tl[1]);
    if (!ID.test(id)) return no(400, 'Bad piece id.');
    if (method === 'GET') return ok({ timeline: store.getTimeline(user.id, id) });
    if (method === 'PUT') {
      const tlBody = body?.timeline;
      if (!tlBody || typeof tlBody !== 'object' || tlBody.pieceId !== id || !Array.isArray(tlBody.moments)) return no(400, 'Bad timeline.');
      return store.putTimeline(user.id, id, JSON.stringify(tlBody), now) === 'ok' ? ok({ saved: now }) : no(413, 'This timeline is too big to save.');
    }
  }

  return no(404, 'Not found.');
}
