import type { Node } from 'prosemirror-model';
import type { EntryKind } from './moments';
import { changeOf } from './moments';

/**
 * "What changed", for people who read words, not diffs: a word-by-word
 * comparison of the passage around a change, and a plain caption.
 */
export type Part = { type: 'same' | 'added' | 'cut'; text: string };

const TOKEN = /\n\n|\s+|[\p{L}\p{N}'’-]+|[^\s\p{L}\p{N}]/gu;
const isWord = (t: string) => /[\p{L}\p{N}]/u.test(t);

function tokens(text: string): string[] {
  return text.match(TOKEN) ?? [];
}

/** Word-level comparison (longest common subsequence over words, spaces and punctuation). */
export function compareWords(before: string, after: string): Part[] {
  const a = tokens(before);
  const b = tokens(after);
  const n = a.length;
  const m = b.length;
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const parts: Part[] = [];
  const push = (type: Part['type'], text: string) => {
    const last = parts[parts.length - 1];
    if (last && last.type === type) last.text += text;
    else parts.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) push('same', a[i++]), j++;
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) push('cut', a[i++]);
    else push('added', b[j++]);
  }
  while (i < n) push('cut', a[i++]);
  while (j < m) push('added', b[j++]);
  return parts;
}

/**
 * Collapse long unchanged stretches to "…", but never inside a sentence that
 * holds a change: the writer always sees whole sentences around what changed.
 */
export function crop(parts: Part[]): Part[] {
  const END = /[.!?]['"”’)\]]*(\s+|$)|\n\n/g;
  return parts.map((p, i) => {
    if (p.type !== 'same') return p;
    const first = i === 0;
    const last = i === parts.length - 1;
    // Keep from the start up to the end of the sentence the previous change is in…
    let headEnd = 0;
    if (!first) {
      END.lastIndex = 0;
      const m = END.exec(p.text);
      headEnd = m ? m.index + m[0].length : p.text.length;
    }
    // …and from the start of the sentence the next change is in.
    let tailStart = p.text.length;
    if (!last) {
      tailStart = 0;
      END.lastIndex = 0;
      for (let m = END.exec(p.text); m; m = END.exec(p.text)) {
        if (m.index + m[0].length < p.text.length) tailStart = m.index + m[0].length;
        if (m[0] === '') END.lastIndex++;
      }
    }
    if (tailStart <= headEnd) return p;
    const head = p.text.slice(0, headEnd);
    const tail = p.text.slice(tailStart);
    return { type: 'same', text: `${head}${head && !head.endsWith(' ') ? ' ' : ''}…${tail ? ' ' : ''}${tail}` };
  });
}

function wordsIn(parts: Part[], type: Part['type']): string[] {
  return parts.filter((p) => p.type === type).flatMap((p) => tokens(p.text).filter(isWord));
}

function quote(parts: Part[], type: Part['type'], longestOnly = false): string {
  let chosen = parts.filter((p) => p.type === type).map((p) => p.text.trim());
  if (longestOnly) chosen = [chosen.reduce((a, b) => (b.length > a.length ? b : a), '')];
  const text = chosen.join(' … ');
  return `‘${text.length > 48 ? text.slice(0, 47) + '…' : text}’`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** One plain sentence describing a moment, for the caption. */
export function caption(kind: EntryKind, parts: Part[]): string {
  const added = wordsIn(parts, 'added');
  const cut = wordsIn(parts, 'cut');
  switch (kind) {
    case 'flipped':
      return added.length ? `Tried another alternative: ${quote(parts, 'added', true)}` : 'Tried another alternative';
    case 'variant-added':
      return added.length ? `Wrote another alternative: ${quote(parts, 'added', true)}` : 'Wrote another alternative';
    case 'variant-dropped':
      return cut.length ? `Dropped an alternative: ${quote(parts, 'cut')}` : 'Dropped an alternative';
    case 'ghosted':
      return 'Ghosted a passage, to read the piece without it';
    case 'revived':
      return 'Brought a ghosted passage back';
    case 'stashed':
      return `Moved ${plural(cut.length || added.length, 'word')} to Overflow`;
    case 'used':
      return `Brought ${plural(added.length || cut.length, 'word')} back from Overflow`;
    default:
      if (!cut.length && !added.length) return 'Changed formatting';
      if (!cut.length) return added.length <= 4 ? `Added ${quote(parts, 'added')}` : `Wrote ${plural(added.length, 'word')}`;
      if (!added.length) return cut.length <= 4 ? `Cut ${quote(parts, 'cut')}` : `Cut ${plural(cut.length, 'word')}`;
      if (cut.length <= 4 && added.length <= 4) return `Changed ${quote(parts, 'cut')} to ${quote(parts, 'added')}`;
      return `Rewrote ${plural(cut.length, 'word')} as ${plural(added.length, 'word')}`;
  }
}

/** The blocks touched by [from, to), as text with blank lines between them. */
function passage(doc: Node, from: number, to: number): string {
  const start = Math.max(0, doc.resolve(Math.min(from, doc.content.size)).start(1) - 1);
  const $end = doc.resolve(Math.min(to, doc.content.size));
  const end = $end.depth >= 1 ? $end.end(1) + 1 : $end.pos;
  return doc.textBetween(start, Math.max(start, end), '\n\n', ' ');
}

export interface MomentView {
  caption: string;
  parts: Part[];
  /** Range of the change in the "after" document, for highlighting and jumping. */
  from: number;
  to: number;
}

/** Everything the timeline needs to show one moment. */
export function describeMoment(kind: EntryKind, before: Node, after: Node): MomentView {
  const change = changeOf(before, after);
  if (!change) return { caption: caption(kind, []), parts: [], from: 0, to: 0 };
  const parts = compareWords(passage(before, change.from, change.toBefore), passage(after, change.from, change.toAfter));
  return { caption: caption(kind, parts), parts: crop(parts), from: change.from, to: change.toAfter };
}
