// Machine alternatives for a passage, from Gemini (ADR-0007). Runs only on the
// server: the key never reaches the page. It is off unless both a key and an
// access code are set, so a public URL can't spend the key for strangers.
import { timingSafeEqual } from 'node:crypto';

const GRAINS = new Set(['word', 'sentence', 'paragraph']);
const MAX_TEXT = 4000;
const MAX_CONTEXT = 1500;
const PER_IP_PER_HOUR = 30;
const ALL_PER_DAY = 500;

export function aiConfig(env) {
  const key = env.GEMINI_API_KEY || env.GOOGLE_API_KEY || '';
  const code = env.WRITE_ON_ACCESS_CODE || '';
  return { key, code, model: env.GEMINI_MODEL || 'gemini-2.5-flash', enabled: Boolean(key && code) };
}

function sameCode(given, wanted) {
  const a = Buffer.from(String(given ?? ''));
  const b = Buffer.from(wanted);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Counts requests per caller per hour and in total per day. */
export function rateLimiter({ perIpPerHour = PER_IP_PER_HOUR, allPerDay = ALL_PER_DAY } = {}) {
  const hits = new Map();
  let day = { start: 0, count: 0 };
  return (ip, now) => {
    if (now - day.start >= 86_400_000) day = { start: now, count: 0 };
    if (day.count >= allPerDay) return false;
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
    if (recent.length >= perIpPerHour) return false;
    recent.push(now);
    hits.set(ip, recent);
    day.count++;
    return true;
  };
}

const HOW = {
  word: 'Give 3 alternative words or very short phrases for the marked word or phrase. Each must fit the sentence exactly where the original sits: same part of speech, same grammar, no change to the words around it.',
  sentence: 'Give 3 alternative ways to write the marked sentence(s). Keep the meaning, the tense, the person and roughly the length.',
  paragraph: 'Give 3 alternative ways to write the marked paragraph. Keep every idea and the order of the argument; change only how it is said.',
};

export function buildPrompt({ text, grain, before, after }) {
  const system = [
    'You help a writer see other ways to say what they already wrote. You never add ideas, facts, claims or flourishes of your own.',
    'Match the writer\'s own voice: their register, rhythm, vocabulary and punctuation habits as shown in the surrounding text. Plain beats clever.',
    'Make the alternatives genuinely different from the original and from each other.',
    'Reply with JSON only: {"alternatives": ["...", "...", "..."]}. Each alternative is only the replacement text, with no quotes, labels or commentary.',
  ].join('\n');
  const user = `${HOW[grain]}\n\nText before:\n${before || '(start of piece)'}\n\nMarked ${grain}:\n${text}\n\nText after:\n${after || '(end of piece)'}`;
  return { system, user };
}

function clip(s, n, fromEnd) {
  s = typeof s === 'string' ? s : '';
  return s.length <= n ? s : fromEnd ? s.slice(s.length - n) : s.slice(0, n);
}

/**
 * Handle POST /api/suggest. Returns { status, body }.
 * deps: { env, fetch, ip, now, limit }.
 */
export async function suggest(input, headers, deps) {
  const cfg = aiConfig(deps.env);
  if (!cfg.enabled) return { status: 503, body: { error: 'Suggestions are not switched on for this site.' } };
  if (!sameCode(headers['x-write-on-code'], cfg.code)) return { status: 401, body: { error: 'That access code isn’t right.' } };
  const text = typeof input?.text === 'string' ? input.text.trim() : '';
  const grain = input?.grain;
  if (!text || text.length > MAX_TEXT || !GRAINS.has(grain)) return { status: 400, body: { error: 'Select a word, sentence or paragraph first.' } };
  if (!deps.limit(deps.ip, deps.now)) return { status: 429, body: { error: 'That’s a lot of suggestions for one hour. Try again a little later.' } };

  const { system, user } = buildPrompt({
    text,
    grain,
    before: clip(input.before, MAX_CONTEXT, true),
    after: clip(input.after, MAX_CONTEXT, false),
  });
  let res;
  try {
    res = await deps.fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0.9,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: { alternatives: { type: 'ARRAY', items: { type: 'STRING' } } },
            required: ['alternatives'],
          },
        },
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return { status: 502, body: { error: 'Couldn’t reach the suggestion service.' } };
  }
  if (!res.ok) {
    // Never pass the provider's error through: it can echo request details.
    console.error(`gemini ${res.status}`);
    return { status: 502, body: { error: 'The suggestion service said no. Try again in a moment.' } };
  }
  try {
    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    const list = JSON.parse(raw).alternatives;
    const alternatives = (Array.isArray(list) ? list : [])
      .filter((a) => typeof a === 'string')
      .map((a) => a.replace(/^["“”']+|["“”']+$/g, '').replace(/\s+/g, ' ').trim())
      .filter((a) => a && a !== text)
      .slice(0, 3);
    if (alternatives.length === 0) return { status: 502, body: { error: 'No suggestions came back this time.' } };
    return { status: 200, body: { alternatives } };
  } catch {
    return { status: 502, body: { error: 'No suggestions came back this time.' } };
  }
}
