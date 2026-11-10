import { closeHistory, undo } from 'prosemirror-history';
import { describe, expect, it } from 'vitest';
import {
  addVariant,
  createGroup,
  deleteActiveVariant,
  findGroup,
  flip,
  flipTo,
  groupAt,
  setVariantText,
  targetForSelection,
  textVariant,
  variantText,
} from '../../src/core/groups';
import { toggleGhost } from '../../src/core/ghost';
import { eventsOf } from '../../src/core/piece';
import { fromPieceFile, toPieceFile } from '../../src/core/pieceFile';
import { caret, find, overflowText, pageText, piece, run, select, typeText } from './helpers';

const text = 'Pin it like a thumbtack to the wall. Shouldn’t everything be obvious? It should.';

function wordGroup(word: string, ...others: string[]) {
  let state = select(piece(text), word);
  state = run(state, createGroup(targetForSelection(state)!, textVariant(others[0])));
  const id = groupAt(state.doc, find(state, others[0])[0])!;
  for (const o of others.slice(1)) state = run(state, addVariant(id, textVariant(o)));
  return { state, id };
}

describe('grain from selection', () => {
  it('a selected word makes a word target', () => {
    expect(targetForSelection(select(piece(text), 'thumbtack'))?.grain).toBe('word');
  });

  it('a short phrase is still the word grain', () => {
    expect(targetForSelection(select(piece(text), 'to the wall'))?.grain).toBe('word');
  });

  it('a whole sentence makes a sentence target', () => {
    expect(targetForSelection(select(piece(text), 'Shouldn’t everything be obvious?'))?.grain).toBe('sentence');
  });

  it('two whole sentences make one sentence target', () => {
    expect(targetForSelection(select(piece(text), 'Shouldn’t everything be obvious? It should.'))?.grain).toBe('sentence');
  });

  it('the whole paragraph makes a paragraph target', () => {
    expect(targetForSelection(select(piece(text), text))?.grain).toBe('paragraph');
  });

  it('no selection takes the word at the caret', () => {
    const state = caret(piece(text), 'thumbtack', 3);
    const target = targetForSelection(state)!;
    expect(state.doc.textBetween(target.from, target.to)).toBe('thumbtack');
  });
});

describe('word and sentence groups', () => {
  it('typing a second variant makes a group that shows it', () => {
    const { state, id } = wordGroup('thumbtack', 'paperclip');
    expect(pageText(state)).toContain('like a paperclip to');
    const group = findGroup(state.doc, id)!;
    expect(group.attrs.variants.map(variantText)).toEqual(['thumbtack', 'paperclip']);
    expect(group.attrs.active).toBe(1);
  });

  it('adding a variant shows the new one', () => {
    const { state, id } = wordGroup('thumbtack', 'paperclip', 'nail');
    expect(findGroup(state.doc, id)!.attrs.variants.map(variantText)).toEqual(['thumbtack', 'paperclip', 'nail']);
    expect(pageText(state)).toContain('like a nail to');
  });

  it('editing the showing variant in the panel updates the page', () => {
    const { state, id } = wordGroup('thumbtack', 'paperclip');
    expect(pageText(run(state, setVariantText(id, 1, 'pushpin')))).toContain('like a pushpin to');
  });

  it('editing a hidden variant leaves the page alone', () => {
    const { state, id } = wordGroup('thumbtack', 'paperclip');
    const next = run(state, setVariantText(id, 0, 'tack'));
    expect(pageText(next)).toContain('like a paperclip to');
    expect(findGroup(next.doc, id)!.attrs.variants.map(variantText)).toEqual(['tack', 'paperclip']);
  });

  it('typing in the page changes the showing variant', () => {
    const { state, id } = wordGroup('thumbtack', 'paperclip');
    const next = typeText(caret(state, 'paperclip', 5), 'X');
    expect(variantText(findGroup(next.doc, id)!.attrs.variants[1])).toBe('paperXclip');
  });

  it('a sentence group swaps the whole sentence', () => {
    let state = select(piece(text), 'Shouldn’t everything be obvious?');
    state = run(state, createGroup(targetForSelection(state)!, textVariant('Isn’t clarity the point?')));
    expect(pageText(state)).toBe('Pin it like a thumbtack to the wall. Isn’t clarity the point? It should.');
  });

  it('groups survive saving and opening', () => {
    const { state, id } = wordGroup('thumbtack', 'paperclip');
    const reopened = fromPieceFile(toPieceFile(state.doc)).doc;
    expect(findGroup(reopened, id)!.attrs.variants.map(variantText)).toEqual(['thumbtack', 'paperclip']);
  });

  it('reports what was added for the event log', () => {
    let state = select(piece(text), 'thumbtack');
    let events: unknown[] = [];
    createGroup(targetForSelection(state)!, textVariant('pin'))(state, (tr) => {
      events = eventsOf(tr);
      state = state.apply(tr);
    });
    expect(events).toEqual([expect.objectContaining({ kind: 'variant-added', grain: 'word', text: 'pin' })]);
  });
});

describe('flipping', () => {
  it('shows the next and previous variant, wrapping around', () => {
    const { state, id } = wordGroup('thumbtack', 'paperclip', 'nail');
    const once = run(state, flip(id, 1));
    expect(pageText(once)).toContain('a thumbtack to');
    expect(pageText(run(once, flip(id, -1)))).toContain('a nail to');
  });

  it('keeps edits to a variant when flipping away and back', () => {
    const { state, id } = wordGroup('thumbtack', 'paperclip');
    const edited = typeText(caret(state, 'paperclip', 9), 's');
    const back = run(run(edited, flip(id, 1)), flip(id, 1));
    expect(pageText(back)).toContain('paperclips');
  });

  it('is not an undo step: undo walks back the last edit instead', () => {
    const { state, id } = wordGroup('thumbtack', 'paperclip');
    const typed = typeText(caret(state, 'wall', 4), '!');
    const flipped = run(typed, flip(id, 1));
    const undone = run(flipped, undo);
    expect(pageText(undone)).toContain('a thumbtack to the wall.');
    expect(pageText(undone)).not.toContain('wall!');
  });

  it('makes a/an agree with the word now showing', () => {
    const { state, id } = wordGroup('thumbtack', 'eraser');
    expect(pageText(state)).toContain('like an eraser to');
    expect(pageText(run(state, flipTo(id, 0)))).toContain('like a thumbtack to');
  });

  it('knows a/an exceptions', () => {
    const { state } = wordGroup('thumbtack', 'hour');
    expect(pageText(state)).toContain('like an hour to');
    const { state: s2 } = wordGroup('thumbtack', 'unicorn');
    expect(pageText(s2)).toContain('like a unicorn to');
  });

  it('reports the flip for the event log', () => {
    const { state, id } = wordGroup('thumbtack', 'paperclip');
    let events: unknown[] = [];
    flip(id, 1)(state, (tr) => (events = eventsOf(tr)));
    expect(events).toEqual([expect.objectContaining({ kind: 'flipped', from: 1, to: 0, text: 'thumbtack' })]);
  });
});

describe('deleting variants', () => {
  it('removes the showing variant and shows the next', () => {
    const { state, id } = wordGroup('thumbtack', 'paperclip', 'nail');
    const next = run(state, deleteActiveVariant(id));
    expect(findGroup(next.doc, id)!.attrs.variants.map(variantText)).toEqual(['thumbtack', 'paperclip']);
    expect(pageText(next)).toContain('a paperclip to');
  });

  it('dissolves a group left with one variant', () => {
    const { state, id } = wordGroup('thumbtack', 'paperclip');
    const next = run(state, deleteActiveVariant(id));
    expect(findGroup(next.doc, id)).toBeNull();
    expect(pageText(next)).toContain('a thumbtack to');
    expect(overflowText(next)).toBe('');
  });

  it('can be undone', () => {
    const { state, id } = wordGroup('thumbtack', 'paperclip', 'nail');
    const settled = state.apply(closeHistory(state.tr));
    const undone = run(run(settled, deleteActiveVariant(id)), undo);
    expect(findGroup(undone.doc, id)!.attrs.variants).toHaveLength(3);
  });
});

describe('nothing is ever lost', () => {
  it('a sentence group over a word group flattens it into Overflow', () => {
    let { state } = wordGroup('thumbtack', 'paperclip', 'eraser');
    state = select(state, 'Pin it like an eraser to the wall.');
    state = run(state, createGroup(targetForSelection(state)!, textVariant('Stick it up.')));
    expect(overflowText(state)).toBe('from “eraser”: thumbtack\nfrom “eraser”: paperclip');
  });

  it('a group whose text is deleted by editing sends its variants to Overflow', () => {
    const { state } = wordGroup('thumbtack', 'paperclip');
    const sel = select(state, 'like a paperclip to');
    const next = sel.apply(sel.tr.deleteSelection());
    expect(overflowText(next)).toBe('from “paperclip”: thumbtack');
  });

  it('an outside edit keeps groups it can still place', () => {
    const { state, id } = wordGroup('thumbtack', 'paperclip');
    const file = toPieceFile(state.doc).replace('Pin it', 'Stick it');
    const { doc } = fromPieceFile(file);
    expect(findGroup(doc, id)!.attrs.variants.map(variantText)).toEqual(['thumbtack', 'paperclip']);
  });

  it('an outside edit moves groups it can no longer place to Overflow', () => {
    const { state } = wordGroup('thumbtack', 'paperclip');
    const file = toPieceFile(state.doc).replace('like a paperclip to', 'next to');
    const { doc, notice } = fromPieceFile(file);
    expect(doc.lastChild!.textContent).toBe('from “paperclip”: thumbtack');
    expect(notice).toMatch(/1 alternative group/);
  });
});

describe('outside edits, more precisely', () => {
  it('places a group whose word occurs more than once at the nearest occurrence', () => {
    let state = select(piece('The cat sat. The dog ran.'), 'dog');
    state = run(state, createGroup(targetForSelection(state)!, textVariant('cat')));
    const id = groupAt(state.doc, find(state, 'cat', { nth: 1 })[0])!;
    const { doc } = fromPieceFile(toPieceFile(state.doc).replace('sat', 'sits'));
    const loc = findGroup(doc, id)!;
    expect(doc.textBetween(loc.from - 4, loc.to)).toBe('The cat');
    expect(loc.from).toBeGreaterThan(10);
  });

  it('says when a ghosted passage could not be found again', () => {
    let state = select(piece('Keep this. Maybe cut this.'), 'Maybe cut this.');
    state = run(state, toggleGhost);
    const { notice } = fromPieceFile(toPieceFile(state.doc).replace('Maybe cut this.', 'Maybe cut that.'));
    expect(notice).toMatch(/1 ghosted passage was changed/);
  });
});
