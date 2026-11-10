import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain JS module
import { costOf, createUsage, resendSender, usageConfig } from '../../server/usage.mjs';

const cfg = usageConfig({ ALERT_EMAIL: 'owner@example.com', RESEND_API_KEY: 're_test' });
// One call: 1M tokens in ($0.50) and 1M out ($3.00) at the default prices.
const big = { promptTokenCount: 1_000_000, candidatesTokenCount: 600_000, thoughtsTokenCount: 400_000 };

describe('Gemini spend', () => {
  it('prices tokens in and out, thinking billed as output', () => {
    expect(costOf(big, cfg)).toEqual({ inTokens: 1_000_000, outTokens: 1_000_000, usd: 3.5 });
    expect(costOf(undefined, cfg).usd).toBe(0);
    expect(usageConfig({ GEMINI_USD_PER_M_IN: '1', GEMINI_USD_PER_M_OUT: 'nonsense' })).toMatchObject({ inPerM: 1, outPerM: 3, alertEvery: 5 });
  });

  it('emails once when the total passes $5, again at $10, and remembers across restarts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wo-usage-'));
    const send = vi.fn(async () => undefined);
    const usage = createUsage({ dir, cfg, send, now: () => Date.UTC(2026, 10, 10) });
    await usage.add(big); // $3.50
    expect(send).not.toHaveBeenCalled();
    await usage.add(big); // $7.00
    expect(send).toHaveBeenCalledTimes(1);
    const [subject, text] = send.mock.calls[0] as unknown as [string, string];
    expect(subject).toBe('Write_On: Gemini spend passed $5');
    expect(text).toContain('about $7.00');
    expect(text).toContain('since 2026-11-10');
    await usage.add(big); // $10.50
    expect(send).toHaveBeenCalledTimes(2);

    const again = createUsage({ dir, cfg, send });
    expect(again.total.usd).toBeCloseTo(10.5);
    await again.add({ promptTokenCount: 10 });
    expect(send).toHaveBeenCalledTimes(2);
    expect(JSON.parse(readFileSync(join(dir, 'gemini-usage.json'), 'utf8')).calls).toBe(4);
  });

  it('keeps counting when the email fails', async () => {
    const usage = createUsage({ dir: null, cfg, send: async () => Promise.reject(new Error('down')) });
    await usage.add(big);
    await expect(usage.add(big)).resolves.toBeUndefined();
    expect(usage.total.calls).toBe(2);
  });

  it('sends through Resend to the owner only, and only logs without a key', async () => {
    const fetch = vi.fn(async () => ({ ok: true }));
    await resendSender(cfg, fetch)('subject', 'body');
    const [url, init] = fetch.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.authorization).toBe('Bearer re_test');
    expect(JSON.parse(init.body)).toMatchObject({ to: ['owner@example.com'], subject: 'subject', text: 'body' });
    const none = vi.fn();
    await resendSender(usageConfig({}), none)('s', 't');
    expect(none).not.toHaveBeenCalled();
  });
});
