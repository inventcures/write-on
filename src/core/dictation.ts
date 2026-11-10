/**
 * Turning what the writer says into text that sits right in the page
 * (ADR-0010). Speech engines give bare words; these add the spacing,
 * capitals and spoken punctuation a typist would have added.
 */

const SPOKEN: [RegExp, string][] = [
  [/\s*\b(new paragraph)\b\s*/gi, '\n\n'],
  [/\s*\b(new line)\b\s*/gi, '\n'],
  [/\s*\bfull stop\b/gi, '.'],
  // "period" is also a word ("the period of the war"), so only at the end of what was said.
  [/\s*\bperiod\s*$/gi, '.'],
  [/\s*\bcomma\b/gi, ','],
  [/\s*\bquestion mark\b/gi, '?'],
  [/\s*\b(exclamation mark|exclamation point)\b/gi, '!'],
  [/\s*\bcolon\b/gi, ':'],
  [/\s*\bsemicolon\b/gi, ';'],
];

/** "so comma what now question mark" → "so, what now?" */
export function spokenPunctuation(text: string): string {
  let out = text;
  for (const [re, mark] of SPOKEN) out = out.replace(re, mark);
  // A mark is followed by a space, unless a line break or the end comes next.
  return out.replace(/([.,?!:;])(?=[^\s.,?!:;\n])/g, '$1 ').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').trim();
}

const capitalise = (s: string) => s.replace(/^(\s*)(\p{Ll})/u, (_, sp: string, c: string) => sp + c.toUpperCase());

/**
 * The text to insert after `before` (the text just before the caret in its
 * paragraph): a space if needed, a capital at a sentence start, and capitals
 * after any sentence end inside what was said.
 */
export function fitDictated(before: string, said: string): string {
  let text = spokenPunctuation(said);
  if (!text) return '';
  const atStart = before.trim() === '' || /[.?!]["”’)]?\s*$/.test(before);
  if (atStart) text = capitalise(text);
  text = text.replace(/([.?!]\s+|\n+)(\p{Ll})/gu, (_, gap: string, c: string) => gap + c.toUpperCase());
  const needsSpace = before !== '' && !/\s$/.test(before) && !/^[\s.,?!:;]/.test(text);
  return (needsSpace ? ' ' : '') + text;
}
