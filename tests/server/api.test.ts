import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS module
import { apiLimits, cookieOf, handleApi } from '../../server/api.mjs';
// @ts-expect-error plain JS module
import { openStore } from '../../server/store.mjs';

type Res = { status: number; body: Record<string, unknown>; cookie?: string };

async function setup() {
  const store = await openStore(null);
  const ctx = { store, limits: apiLimits() };
  let now = 1_000_000;
  const call = async (method: string, path: string, body: unknown = null, cookie = '', extra: Record<string, string> = {}): Promise<Res> =>
    handleApi(
      { method, path, headers: { 'x-write-on': '1', cookie: cookie ? `wo_session=${cookie}` : '', ...extra }, body, ip: '1.1.1.1', secure: true, now: (now += 1000) },
      ctx,
    );
  const signUp = async (email: string, password = 'correct horse battery') => {
    const res = await call('POST', '/api/signup', { email, password });
    return cookieOf({ cookie: res.cookie!.split(';')[0] }) as string;
  };
  return { call, signUp, store };
}

describe('accounts', () => {
  it('signs up, knows who you are, signs out', async () => {
    const { call } = await setup();
    const res = await call('POST', '/api/signup', { email: ' Writer@Example.com ', password: 'correct horse battery' });
    expect(res.status).toBe(200);
    expect(res.cookie).toMatch(/^wo_session=[^;]+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000; Secure$/);
    const token = res.cookie!.split(';')[0].split('=')[1];
    expect((await call('GET', '/api/me', null, token)).body).toEqual({ accounts: true, user: { email: 'writer@example.com' } });
    await call('POST', '/api/logout', null, token);
    expect((await call('GET', '/api/me', null, token)).body.user).toBeNull();
  });

  it('signs in with the right password only, and never says which part was wrong', async () => {
    const { call, signUp } = await setup();
    await signUp('a@b.co');
    expect((await call('POST', '/api/login', { email: 'a@b.co', password: 'correct horse battery' })).status).toBe(200);
    const wrong = await call('POST', '/api/login', { email: 'a@b.co', password: 'nope nope nope' });
    const nobody = await call('POST', '/api/login', { email: 'x@b.co', password: 'nope nope nope' });
    expect(wrong.status).toBe(401);
    expect(nobody).toEqual(wrong);
  });

  it('refuses short passwords, bad emails and a second account for one email', async () => {
    const { call, signUp } = await setup();
    expect((await call('POST', '/api/signup', { email: 'a@b.co', password: 'short' })).status).toBe(400);
    expect((await call('POST', '/api/signup', { email: 'not an email', password: 'long enough password' })).status).toBe(400);
    await signUp('a@b.co');
    expect((await call('POST', '/api/signup', { email: 'A@B.CO', password: 'another long one' })).status).toBe(409);
  });

  it('stores passwords hashed, never as typed', async () => {
    const { signUp, store } = await setup();
    await signUp('a@b.co', 'my secret phrase here');
    const row = store.db.prepare('SELECT pass FROM users').get() as { pass: string };
    expect(row.pass).toMatch(/^scrypt\$/);
    expect(row.pass).not.toContain('my secret phrase here');
  });

  it('rate limits sign-in attempts', async () => {
    const { call, signUp } = await setup();
    await signUp('a@b.co');
    let last: Res | null = null;
    for (let i = 0; i < 11; i++) last = await call('POST', '/api/login', { email: 'a@b.co', password: 'wrong password!' });
    expect(last!.status).toBe(429);
  });

  it('rejects writes without the request header (CSRF guard)', async () => {
    const { call } = await setup();
    expect((await call('POST', '/api/signup', { email: 'a@b.co', password: 'correct horse battery' }, '', { 'x-write-on': '' })).status).toBe(403);
  });
});

describe('a writer\'s own pieces, events and timelines', () => {
  it('saves, lists, opens and deletes pieces', async () => {
    const { call, signUp } = await setup();
    const me = await signUp('a@b.co');
    expect((await call('PUT', '/api/pieces/p1', { title: 'First', file: '# First\n', words: 1 }, me)).status).toBe(200);
    await call('PUT', '/api/pieces/p2', { title: 'Second', file: 'two', words: 1 }, me);
    await call('PUT', '/api/pieces/p1', { title: 'First, again', file: '# First\n\nMore.\n', words: 2 }, me);
    const list = (await call('GET', '/api/pieces', null, me)).body.pieces as { id: string; title: string }[];
    expect(list.map((p) => [p.id, p.title])).toEqual([
      ['p1', 'First, again'],
      ['p2', 'Second'],
    ]);
    expect(((await call('GET', '/api/pieces/p1', null, me)).body.piece as { file: string }).file).toContain('More.');
    await call('DELETE', '/api/pieces/p2', null, me);
    expect(((await call('GET', '/api/pieces', null, me)).body.pieces as unknown[]).length).toBe(1);
  });

  it('keeps every writer\'s text private to them', async () => {
    const { call, signUp } = await setup();
    const a = await signUp('a@b.co');
    const b = await signUp('b@b.co');
    await call('PUT', '/api/pieces/p1', { title: 'Mine', file: 'secret', words: 1 }, a);
    await call('POST', '/api/events', { pieceId: 'p1', events: [{ kind: 'ghosted', t: 5, text: 'secret' }] }, a);
    expect((await call('GET', '/api/pieces/p1', null, b)).status).toBe(404);
    expect((await call('GET', '/api/pieces', null, b)).body.pieces).toEqual([]);
    expect((await call('GET', '/api/events', null, b)).body.events).toEqual([]);
    expect((await call('GET', '/api/pieces', null, '')).status).toBe(401);
    // Writing to the same id as someone else makes a separate piece, never overwrites theirs.
    await call('PUT', '/api/pieces/p1', { title: 'Theirs', file: 'other', words: 1 }, b);
    expect(((await call('GET', '/api/pieces/p1', null, a)).body.piece as { file: string }).file).toBe('secret');
  });

  it('keeps events across pieces in time order, cleaned, with WO marked', async () => {
    const { call, signUp } = await setup();
    const me = await signUp('a@b.co');
    await call('POST', '/api/events', { pieceId: 'p2', events: [{ kind: 'flipped', t: 20, groupId: 'g1', from: 0, to: 1, text: 'b' }] }, me);
    await call(
      'POST',
      '/api/events',
      { pieceId: 'p1', events: [{ kind: 'variant-added', t: 10, text: 'a', by: 'machine', evil: '<script>' }, { kind: 'rm -rf', t: 11 }] },
      me,
    );
    const events = (await call('GET', '/api/events', null, me)).body.events as Record<string, unknown>[];
    expect(events).toEqual([
      { kind: 'variant-added', t: 10, text: 'a', by: 'machine', pieceId: 'p1' },
      { kind: 'flipped', t: 20, groupId: 'g1', from: 0, to: 1, text: 'b', pieceId: 'p2' },
    ]);
  });

  it('stores a piece\'s timeline', async () => {
    const { call, signUp } = await setup();
    const me = await signUp('a@b.co');
    const timeline = { pieceId: 'p1', start: { type: 'doc' }, moments: [{ t: 1, kind: 'typed', steps: [] }] };
    expect((await call('PUT', '/api/timelines/p1', { timeline }, me)).status).toBe(200);
    expect((await call('GET', '/api/timelines/p1', null, me)).body.timeline).toEqual(timeline);
    expect((await call('PUT', '/api/timelines/p1', { timeline: { ...timeline, pieceId: 'p9' } }, me)).status).toBe(400);
    const wo = { pieceId: 'p2', start: {}, moments: [{ t: 5, kind: 'variant-added', by: 'machine', steps: [{ big: 1 }] }] };
    await call('PUT', '/api/timelines/p2', { timeline: wo }, me);
    const activity = (await call('GET', '/api/activity', null, me)).body.activity as unknown[];
    expect(activity).toEqual(
      expect.arrayContaining([
        { pieceId: 'p1', moments: [[1, 'typed']] },
        { pieceId: 'p2', moments: [[5, 'variant-added', 'machine']] },
      ]),
    );
  });
});
