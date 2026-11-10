// What suggestions have cost so far, estimated from the token counts Gemini
// reports, and a short email to the site owner each time the total passes
// another step (ADR-0011). Kept in one small JSON file beside the accounts.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Prices per million tokens, in US dollars. Thinking tokens are billed as output. */
export function usageConfig(env) {
  const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
  return {
    inPerM: num(env.GEMINI_USD_PER_M_IN, 0.5),
    outPerM: num(env.GEMINI_USD_PER_M_OUT, 3),
    alertEvery: num(env.SPEND_ALERT_USD, 5),
    alertTo: env.ALERT_EMAIL ?? '',
    resendKey: env.RESEND_API_KEY ?? '',
    from: env.ALERT_FROM ?? 'Write_On <onboarding@resend.dev>',
  };
}

/** The cost of one call, from Gemini's usageMetadata. */
export function costOf(meta, cfg) {
  const n = (v) => (Number.isFinite(v) && v > 0 ? v : 0);
  const inTokens = n(meta?.promptTokenCount);
  const outTokens = n(meta?.candidatesTokenCount) + n(meta?.thoughtsTokenCount);
  return { inTokens, outTokens, usd: (inTokens * cfg.inPerM + outTokens * cfg.outPerM) / 1e6 };
}

/**
 * The running total. `dir` null keeps it in memory only (tests, or no volume).
 * `send(subject, text)` delivers the alert; it is called at most once per step.
 */
export function createUsage({ dir, cfg, send, now = () => Date.now() }) {
  const file = dir ? join(dir, 'gemini-usage.json') : null;
  let total = { usd: 0, inTokens: 0, outTokens: 0, calls: 0, since: now(), alerted: 0 };
  if (file) {
    try {
      total = { ...total, ...JSON.parse(readFileSync(file, 'utf8')) };
    } catch {
      /* first run */
    }
  }
  const save = () => {
    if (!file) return;
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(file, JSON.stringify(total));
    } catch (err) {
      console.error('usage not saved', err?.message);
    }
  };
  return {
    get total() {
      return { ...total };
    },
    /** Count one call. Resolves once any alert it set off has been sent (or has failed). */
    async add(meta) {
      const c = costOf(meta, cfg);
      total.usd += c.usd;
      total.inTokens += c.inTokens;
      total.outTokens += c.outTokens;
      total.calls += 1;
      const step = Math.floor(total.usd / cfg.alertEvery);
      let alert = null;
      if (step > total.alerted) {
        total.alerted = step;
        alert = step * cfg.alertEvery;
      }
      save();
      if (alert === null) return;
      const since = new Date(total.since).toISOString().slice(0, 10);
      await send(
        `Write_On: Gemini spend passed $${alert}`,
        [
          `Suggestions on Write_On have now cost about $${total.usd.toFixed(2)} on your Gemini key since ${since}.`,
          `${total.calls} requests, ${total.inTokens.toLocaleString('en')} tokens in and ${total.outTokens.toLocaleString('en')} out (thinking included).`,
          '',
          'This is an estimate from the token counts Gemini reports. Your exact bill is in Google Cloud under Billing.',
          `You'll get another email at $${alert + cfg.alertEvery}. To stop suggestions, remove GEMINI_API_KEY in Railway.`,
        ].join('\n'),
      ).catch((err) => console.error('spend alert not sent', err?.message));
    },
  };
}

/** Send one plain email through Resend's HTTP API. Without a key and an address it only logs. */
export function resendSender(cfg, fetchFn = fetch) {
  return async (subject, text) => {
    if (!cfg.resendKey || !cfg.alertTo) {
      console.log(`spend alert (no email set up): ${subject}`);
      return;
    }
    const res = await fetchFn('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${cfg.resendKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: cfg.from, to: [cfg.alertTo], subject, text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`resend ${res.status}`);
  };
}
