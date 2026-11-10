import { undo } from 'prosemirror-history';
import { describe, expect, it } from 'vitest';
import { toggleGhost } from '../../src/core/ghost';
import { createGroup, findGroup, flip, groupAt, targetForSelection, textVariant, variantText } from '../../src/core/groups';
import { stash, useFromOverflow } from '../../src/core/overflow';
import { countPiece } from '../../src/core/piece';
import { exportMarkdown, fromPieceFile, toPieceFile } from '../../src/core/pieceFile';
import { caret, find, overflowText, pageText, piece, run, select } from './helpers';

const two = 'Most meetings are a tax on the people who show up. We should cancel them.\n\nSecond paragraph here.';

describe('ghost', () => {
  it('ghosts the selection in place and keeps it in the word count', () => {
    const state = run(select(piece(two), 'We should cancel them.'), toggleGhost);
    const [from, to] = find(state, 'We should cancel them.');
    expect(state.doc.rangeHasMark(from, to, state.schema.marks.ghost)).toBe(true);
    expect(countPiece(state.doc).words).toBe(countPiece(piece(two).doc).words);
  });

  it('revives the whole ghosted run from a caret inside it', () => {
    const ghosted = run(select(piece(two), 'We should cancel them.'), toggleGhost);
    const revived = run(caret(ghosted, 'cancel', 2), toggleGhost);
    expect(revived.doc.rangeHasMark(0, revived.doc.content.size, revived.schema.marks.ghost)).toBe(false);
  });

  it('does nothing with an empty selection outside ghosted text', () => {
    expect(toggleGhost(caret(piece(two), 'tax'))).toBe(false);
  });

  it('is undoable', () => {
    const ghosted = run(select(piece(two), 'tax'), toggleGhost);
    expect(run(ghosted, undo).doc.eq(piece(two).doc)).toBe(true);
  });

  it('survives saving and is left out of Export', () => {
    const ghosted = run(select(piece(two), 'We should cancel them.'), toggleGhost);
    expect(fromPieceFile(toPieceFile(ghosted.doc)).doc.eq(ghosted.doc)).toBe(true);
    expect(exportMarkdown(ghosted.doc)).toBe('Most meetings are a tax on the people who show up.\n\nSecond paragraph here.\n');
  });
});

describe('overflow', () => {
  it('stashes the selection onto the end of Overflow', () => {
    const state = run(select(piece(two, 'Older line.'), 'Most meetings are a tax on the people who show up. '), stash);
    expect(pageText(state)).toBe('We should cancel them.\nSecond paragraph here.');
    expect(overflowText(state)).toBe('Older line.\nMost meetings are a tax on the people who show up. ');
  });

  it('stashes the paragraph at the caret when nothing is selected', () => {
    const state = run(caret(piece(two), 'Second'), stash);
    expect(pageText(state)).not.toContain('Second');
    expect(overflowText(state)).toBe('Second paragraph here.');
  });

  it('uses the Overflow paragraph at the caret after the page caret’s paragraph', () => {
    let state = caret(piece(two, 'Kept line.'), 'tax');
    state = caret(state, 'Kept', 1, { inOverflow: true });
    state = run(state, useFromOverflow);
    expect(pageText(state)).toBe('Most meetings are a tax on the people who show up. We should cancel them.\nKept line.\nSecond paragraph here.');
    expect(overflowText(state)).toBe('');
  });

  it('round-trips through the piece file', () => {
    const state = run(caret(piece(two), 'Second'), stash);
    expect(fromPieceFile(toPieceFile(state.doc)).doc.eq(state.doc)).toBe(true);
  });

  it('a stashed group keeps its variants and comes back whole', () => {
    let state = select(piece(two), 'tax');
    state = run(state, createGroup(targetForSelection(state)!, textVariant('toll')));
    state = run(caret(state, 'Most'), stash);
    state = run(caret(state, 'Second'), (s, d) => (d ? (d(s.tr), true) : true));
    state = caret(state, 'Most', 0, { inOverflow: true });
    state = run(state, useFromOverflow);
    const id = groupAt(state.doc, find(state, 'toll')[0])!;
    expect(findGroup(state.doc, id)!.attrs.variants.map(variantText)).toEqual(['tax', 'toll']);
  });
});

describe('paragraph groups', () => {
  it('a whole paragraph selected makes a paragraph group that flips', () => {
    let state = select(piece(two), 'Second paragraph here.');
    const target = targetForSelection(state)!;
    expect(target.grain).toBe('paragraph');
    state = run(state, createGroup(target, textVariant('A shorter second.')));
    expect(pageText(state)).toContain('A shorter second.');
    const id = groupAt(state.doc, find(state, 'shorter')[0])!;
    state = run(state, flip(id, 1));
    expect(pageText(state)).toContain('Second paragraph here.');
    expect(fromPieceFile(toPieceFile(state.doc)).doc.eq(state.doc)).toBe(true);
  });

  it('keeps word groups inside the paragraph variant they were made in', () => {
    let state = select(piece(two), 'Second');
    state = run(state, createGroup(targetForSelection(state)!, textVariant('Next')));
    state = select(state, 'Next paragraph here.');
    state = run(state, createGroup(targetForSelection(state)!, textVariant('Replaced.')));
    const pid = groupAt(state.doc, find(state, 'Replaced')[0])!;
    state = run(state, flip(pid, 1));
    const wid = groupAt(state.doc, find(state, 'Next')[0])!;
    expect(findGroup(state.doc, wid)!.attrs.variants.map(variantText)).toEqual(['Second', 'Next']);
    expect(overflowText(state)).toBe('');
  });
});

describe('stashing a paragraph group', () => {
  it('keeps its versions when it goes to Overflow and comes back', () => {
    let state = select(piece(two), 'Second paragraph here.');
    state = run(state, createGroup(targetForSelection(state)!, textVariant('A shorter second.')));
    state = run(caret(state, 'shorter'), stash);
    expect(overflowText(state)).toBe('A shorter second.');
    state = run(caret(state, 'shorter', 0, { inOverflow: true }), useFromOverflow);
    const id = groupAt(state.doc, find(state, 'shorter')[0])!;
    expect(findGroup(state.doc, id)!.attrs.variants.map(variantText)).toEqual(['Second paragraph here.', 'A shorter second.']);
  });
});
