/** Plain-text helpers that know nothing about ProseMirror. */

export type Range = [start: number, end: number];

/** Each sentence's [start, end) in a paragraph's text, without surrounding spaces. */
export function sentenceRanges(text: string): Range[] {
  const out: Range[] = [];
  const re = /[^.!?]*[.!?]+['"”’)\]]*|[^.!?]+$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[0] === '') {
      re.lastIndex++;
      continue;
    }
    let s = m.index;
    let e = m.index + m[0].length;
    while (s < e && /\s/.test(text[s])) s++;
    while (e > s && /\s/.test(text[e - 1])) e--;
    if (e > s) out.push([s, e]);
  }
  return out;
}

const WORD_CHAR = /[\p{L}\p{N}'’-]/u;

/** The word touching `offset`, or null if the caret sits between spaces. */
export function wordAt(text: string, offset: number): Range | null {
  let s = offset;
  let e = offset;
  while (s > 0 && WORD_CHAR.test(text[s - 1])) s--;
  while (e < text.length && WORD_CHAR.test(text[e])) e++;
  return e > s ? [s, e] : null;
}

/** Shrink a range so it neither starts nor ends on whitespace. */
export function trimRange(text: string, [s, e]: Range): Range {
  while (s < e && /\s/.test(text[s])) s++;
  while (e > s && /\s/.test(text[e - 1])) e--;
  return [s, e];
}

// Words spelled with a vowel but said with a consonant sound, and the reverse.
const A_BEFORE_VOWEL_LETTER = /^(uni|use|usu|ura|ure|uri|uti|ubiq|eu|ewe|one\b|once)/i;
const AN_BEFORE_CONSONANT_LETTER = /^(hour|honest|honou?r|heir)/i;

/** "a" or "an" for the word that follows. */
export function articleFor(word: string): 'a' | 'an' {
  if (AN_BEFORE_CONSONANT_LETTER.test(word)) return 'an';
  if (A_BEFORE_VOWEL_LETTER.test(word)) return 'a';
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

/**
 * If `before` ends with "a " or "an " and the article doesn't agree with
 * `word`, return the [start, end) of the article and its replacement.
 */
export function articleFix(before: string, word: string): { range: Range; text: string } | null {
  const m = before.match(/(^|[^\p{L}])(a|an)(\s+)$/iu);
  const first = word.match(/[\p{L}\p{N}]+/u)?.[0];
  if (!m || !first || /^\d/.test(first)) return null;
  const article = m[2];
  const wanted = articleFor(first);
  if (article.toLowerCase() === wanted) return null;
  const start = before.length - m[3].length - article.length;
  const text = article[0] === article[0].toUpperCase() ? wanted[0].toUpperCase() + wanted.slice(1) : wanted;
  return { range: [start, start + article.length], text };
}
