/**
 * Asking the server for machine alternatives (ADR-0007). The page never sees
 * the model key; it only holds the site's access code, in this browser.
 */
import type { Node } from 'prosemirror-model';
import type { Grain } from '../core/schema';
import { overflowStart } from '../core/piece';

const CODE = 'write-on:ai-code';
let enabled: Promise<boolean> | null = null;

/** Whether this site has suggestions switched on. Asked once per page load. */
export function suggestionsEnabled(): Promise<boolean> {
  enabled ??= fetch('/api/ai')
    .then((r) => (r.ok ? r.json() : { enabled: false }))
    .then((j: { enabled?: boolean }) => j.enabled === true)
    .catch(() => false);
  return enabled;
}

export function accessCode(): string {
  try {
    return localStorage.getItem(CODE) ?? '';
  } catch {
    return '';
  }
}

export function setAccessCode(code: string): void {
  try {
    if (code) localStorage.setItem(CODE, code);
    else localStorage.removeItem(CODE);
  } catch {
    /* kept for this page only */
  }
}

export type SuggestResult = { ok: true; alternatives: string[] } | { ok: false; status: number; error: string };

/** The page text around a range, as context for the model. */
export function contextAround(doc: Node, from: number, to: number): { before: string; after: string } {
  const end = overflowStart(doc);
  return {
    before: doc.textBetween(Math.max(0, from - 1500), from, '\n\n'),
    after: doc.textBetween(Math.min(to, end), Math.min(end, to + 1500), '\n\n'),
  };
}

export async function requestSuggestions(text: string, grain: Grain, before: string, after: string): Promise<SuggestResult> {
  try {
    const res = await fetch('/api/suggest', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-write-on-code': accessCode() },
      body: JSON.stringify({ text, grain, before, after }),
    });
    const body = (await res.json().catch(() => ({}))) as { alternatives?: string[]; error?: string };
    if (res.ok && Array.isArray(body.alternatives)) return { ok: true, alternatives: body.alternatives };
    return { ok: false, status: res.status, error: body.error ?? 'Suggestions aren’t available right now.' };
  } catch {
    return { ok: false, status: 0, error: 'You seem to be offline.' };
  }
}
