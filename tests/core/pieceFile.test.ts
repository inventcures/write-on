import { describe, expect, it } from 'vitest';
import { countPiece } from '../../src/core/piece';
import { exportMarkdown, fromPieceFile, toPieceFile } from '../../src/core/pieceFile';
import { piece, overflowText, pageText } from './helpers';

const essay = '# On clarity\n\nThe meeting was *really* productive. We made **progress**.\n\nSee [the notes](https://example.com).';

describe('piece file', () => {
  it('writes ordinary Markdown first, so other apps can read the piece', () => {
    const file = toPieceFile(piece(essay).doc);
    expect(file.startsWith(essay + '\n')).toBe(true);
    expect(file).toMatch(/<!-- write_on \{.*\} -->\n$/);
  });

  it('loads back to an identical document', () => {
    const doc = piece(essay, 'A line I like').doc;
    expect(fromPieceFile(toPieceFile(doc)).doc.eq(doc)).toBe(true);
  });

  it('puts Overflow after an overflow line', () => {
    const file = toPieceFile(piece(essay, 'Most meetings are a tax.').doc);
    expect(file).toContain('\n<!-- overflow -->\n\nMost meetings are a tax.\n');
  });

  it('leaves out the overflow line when Overflow is empty', () => {
    expect(toPieceFile(piece(essay).doc)).not.toContain('<!-- overflow -->');
  });

  it('opens a plain Markdown file as a piece', () => {
    const { doc, notice } = fromPieceFile('Hello there.\n\nSecond paragraph.\n');
    expect(notice).toBeUndefined();
    expect(doc.childCount).toBe(3);
  });

  it('opens the Overflow of a file without metadata', () => {
    const state = piece('x');
    const { doc } = fromPieceFile('Body.\n\n<!-- overflow -->\n\nKept for later.\n');
    expect(overflowText(state.apply(state.tr.replaceWith(0, state.doc.content.size, doc.content)))).toBe('Kept for later.');
  });

  it('lets an outside edit to the body win, and says so', () => {
    const file = toPieceFile(piece(essay).doc).replace('productive', 'useful');
    const { doc, notice } = fromPieceFile(file);
    expect(doc.textContent).toContain('really useful');
    expect(notice).toMatch(/edited outside Write_On/);
  });

  it('keeps metadata intact when text contains a comment terminator', () => {
    const doc = piece('Arrows --> like this.').doc;
    expect(fromPieceFile(toPieceFile(doc)).doc.eq(doc)).toBe(true);
  });
});

describe('word count', () => {
  it('counts words and characters in the page, not Overflow', () => {
    expect(countPiece(piece('One two three.\n\nFour', 'five six').doc)).toEqual({ words: 4, chars: 18 });
  });
});

describe('export', () => {
  it('writes the body only', () => {
    expect(exportMarkdown(piece(essay, 'stashed').doc)).toBe(essay + '\n');
  });

  it('keeps the page text as Markdown in the body', () => {
    expect(pageText(piece(essay))).toContain('On clarity');
  });
});
