import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain JS module
import { buildPrompt, rateLimiter, suggest } from '../../server/suggest.mjs';

const env = { GEMINI_API_KEY: 'k-123', WRITE_ON_ACCESS_CODE: 'open sesame' };
const ok = { 'x-write-on-code': 'open sesame' };

function gemini(alternatives: unknown) {
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ alternatives }) }] } }] }),
  }));
}

const deps = (over: Record<string, unknown> = {}) => ({ env, fetch: gemini(['nail', '“pin”', 'thumbtack', 'tack', 'brad']), ip: '1.2.3.4', now: 0, limit: () => true, ...over });
const input = { text: 'thumbtack', grain: 'word', before: 'Pin it like a ', after: ' to the wall.' };

describe('suggest', () => {
  it('is off without a key or without an access code', async () => {
    expect((await suggest(input, ok, deps({ env: { GEMINI_API_KEY: 'k' } }))).status).toBe(503);
    expect((await suggest(input, ok, deps({ env: { WRITE_ON_ACCESS_CODE: 'c' } }))).status).toBe(503);
  });

  it('needs the right access code', async () => {
    expect((await suggest(input, { 'x-write-on-code': 'nope' }, deps())).status).toBe(401);
    expect((await suggest(input, {}, deps())).status).toBe(401);
  });

  it('rejects empty, oversized or grainless text', async () => {
    expect((await suggest({ ...input, text: ' ' }, ok, deps())).status).toBe(400);
    expect((await suggest({ ...input, text: 'x'.repeat(4001) }, ok, deps())).status).toBe(400);
    expect((await suggest({ ...input, grain: 'chapter' }, ok, deps())).status).toBe(400);
  });

  it('is rate limited', async () => {
    expect((await suggest(input, ok, deps({ limit: () => false }))).status).toBe(429);
  });

  it('returns up to three cleaned alternatives, never the original', async () => {
    const out = await suggest(input, ok, deps());
    expect(out).toEqual({ status: 200, body: { alternatives: ['nail', 'pin', 'tack'] } });
  });

  it('sends the key only in a header, to Gemini', async () => {
    const fetch = gemini(['nail']);
    await suggest(input, ok, deps({ fetch }));
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toMatch(/^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.8-flash:generateContent$/);
    expect(init.headers['x-goog-api-key']).toBe('k-123');
    expect(String(init.body)).not.toContain('k-123');
    expect(String(init.body)).toContain('thumbtack');
  });

  it('hides provider errors', async () => {
    const fetch = vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: 'API key k-123 invalid' }) }));
    const out = await suggest(input, ok, deps({ fetch }));
    expect(out.status).toBe(502);
    expect(JSON.stringify(out.body)).not.toContain('k-123');
  });
});

describe('the prompt', () => {
  it('asks for other ways to say it, never new ideas, in the writer\'s voice', () => {
    const { system, user } = buildPrompt(input);
    expect(system).toMatch(/never add ideas/);
    expect(system).toMatch(/voice/);
    expect(user).toContain('Pin it like a ');
    expect(user).toMatch(/fit the sentence/);
  });
});

describe('rate limiter', () => {
  it('allows 30 an hour per caller and 500 a day in all', () => {
    const limit = rateLimiter();
    for (let i = 0; i < 30; i++) expect(limit('a', i)).toBe(true);
    expect(limit('a', 31)).toBe(false);
    expect(limit('a', 3_600_100)).toBe(true);
    const day = rateLimiter({ perIpPerHour: 1000, allPerDay: 2 });
    expect(day('a', 0) && day('b', 1)).toBe(true);
    expect(day('c', 2)).toBe(false);
    expect(day('c', 86_400_001)).toBe(true);
  });
});
