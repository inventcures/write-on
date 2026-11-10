import { describe, expect, it } from 'vitest';
import { caption, compareWords, describeMoment } from '../../src/core/changes';
import { toggleGhost } from '../../src/core/ghost';
import { createGroup, flip, targetForSelection, textVariant } from '../../src/core/groups';
import { mapToNow, record, replay, startHistory, type PieceHistory } from '../../src/core/history';
import { stash } from '../../src/core/overflow';
import type { EditorState, Command, Transaction } from 'prosemirror-state';
import { caret, find, piece, select } from './helpers';

/** Apply a transaction and record it, at a given time. */
function step(state: EditorState, history: PieceHistory, tr: Transaction, t: number) {
  return { state: state.apply(tr), history: record(history, tr, t) };
}

function command(state: EditorState, history: PieceHistory, cmd: Command, t: number) {
  let out = { state, history };
  cmd(state, (tr) => (out = step(state, history, tr, t)));
  return out;
}

describe('writing history', () => {
  it('joins a burst of typing into one moment and splits after a pause', () => {
    let s = caret(piece('Hello.'), 'Hello', 5);
    let h = startHistory(s.doc);
    ({ state: s, history: h } = step(s, h, s.tr.insertText(' there'), 1000));
    ({ state: s, history: h } = step(s, h, s.tr.insertText(' you'), 1500));
    ({ state: s, history: h } = step(s, h, s.tr.insertText('!'), 4000));
    expect(h.entries.map((e) => e.kind)).toEqual(['typed', 'typed']);
  });

  it('replays exactly to the current piece, and to any moment in between', () => {
    let s = select(piece('Pin it like a thumbtack. Then go.'), 'thumbtack');
    let h = startHistory(s.doc);
    ({ state: s, history: h } = command(s, h, createGroup(targetForSelection(s)!, textVariant('nail')), 1));
    ({ state: s, history: h } = command(caret(s, 'Then'), h, stash, 2));
    const docs = replay(h);
    expect(docs).toHaveLength(3);
    expect(docs[2].eq(s.doc)).toBe(true);
    expect(docs[1].textContent).toContain('like a nail. Then go.');
  });

  it('labels moments by what the writer did', () => {
    let s = select(piece('Pin it like a thumbtack. Then go.'), 'thumbtack');
    let h = startHistory(s.doc);
    let id = '';
    createGroup(targetForSelection(s)!, textVariant('nail'))(s, (tr) => {
      id = tr.getMeta('altCreated');
      ({ state: s, history: h } = step(s, h, tr, 1));
    });
    ({ state: s, history: h } = command(s, h, flip(id, 1), 2));
    ({ state: s, history: h } = command(select(s, 'Then go.'), h, toggleGhost, 3));
    expect(h.entries.map((e) => e.kind)).toEqual(['version-added', 'flipped', 'ghosted']);
  });

  it('maps a moment’s place forward to the piece as it is now', () => {
    let s = caret(piece('Alpha beta.'), 'beta');
    let h = startHistory(s.doc);
    ({ state: s, history: h } = step(s, h, s.tr.insertText('very '), 1));
    const [at] = find(s, 'very');
    ({ state: s, history: h } = step(s, h, s.tr.insertText('Gamma. ', 1), 5000));
    expect(mapToNow(h, 0, at)).toBe(find(s, 'very')[0]);
  });
});

describe('what changed', () => {
  it('compares word by word, not letter by letter', () => {
    expect(compareWords('keep it close while', 'keep it near while')).toEqual([
      { type: 'same', text: 'keep it ' },
      { type: 'cut', text: 'close' },
      { type: 'added', text: 'near' },
      { type: 'same', text: ' while' },
    ]);
  });

  it('writes captions a writer would say', () => {
    expect(caption('edited', compareWords('keep it close', 'keep it near'))).toBe('Changed ‘close’ to ‘near’');
    expect(caption('deleted', compareWords('one two three four five six', 'one'))).toBe('Cut 5 words');
    expect(caption('typed', compareWords('One.', 'One. Two more.'))).toBe('Added ‘Two more.’');
  });

  it('describes a moment with the passage around it', () => {
    const before = piece('First paragraph.\n\nThe trick is to keep it close.').doc;
    const after = piece('First paragraph.\n\nThe trick is to keep it near.').doc;
    const m = describeMoment('edited', before, after);
    expect(m.caption).toBe('Changed ‘close’ to ‘near’');
    expect(m.parts.map((p) => p.text).join('')).toBe('The trick is to keep it closenear.');
  });
});

describe('moments of writing', () => {
  it('keeps a burst of typing with corrections as one moment', () => {
    let s = caret(piece('Hello.'), 'Hello', 5);
    let h = startHistory(s.doc);
    ({ state: s, history: h } = step(s, h, s.tr.insertText(' thre'), 1000));
    ({ state: s, history: h } = step(s, h, s.tr.delete(s.selection.from - 1, s.selection.from), 1300));
    ({ state: s, history: h } = step(s, h, s.tr.insertText('ee'), 1600));
    expect(h.entries.map((e) => e.kind)).toEqual(['edited']);
  });
});
