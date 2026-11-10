import { EditorState, TextSelection, type Command } from 'prosemirror-state';
import { createEditorState } from '../../src/core/editor';
import { docFromMarkdown, overflowStart } from '../../src/core/piece';

export function piece(body: string, overflow = ''): EditorState {
  return createEditorState(docFromMarkdown(body, overflow, 'test'));
}

/** Position range of the nth occurrence of `text` in the page (or in Overflow). */
export function find(state: EditorState, text: string, { inOverflow = false, nth = 0 } = {}): [number, number] {
  const hits: [number, number][] = [];
  const limit = overflowStart(state.doc);
  state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    if (inOverflow !== pos > limit) return false;
    const content = node.textContent;
    for (let i = content.indexOf(text); i !== -1; i = content.indexOf(text, i + 1)) hits.push([pos + 1 + i, pos + 1 + i + text.length]);
    return false;
  });
  if (!hits[nth]) throw new Error(`"${text}" not found`);
  return hits[nth];
}

export function select(state: EditorState, text: string, opts?: { inOverflow?: boolean; nth?: number }): EditorState {
  const [from, to] = find(state, text, opts);
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)));
}

export function caret(state: EditorState, text: string, offset = 0, opts?: { inOverflow?: boolean }): EditorState {
  const [from] = find(state, text, opts);
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, from + offset)));
}

/** Run a command and return the new state; fail the test if it refuses. */
export function run(state: EditorState, command: Command): EditorState {
  let next: EditorState | undefined;
  const ok = command(state, (tr) => (next = state.applyTransaction(tr).state));
  if (!ok || !next) throw new Error('command refused');
  return next;
}

export function pageText(state: EditorState): string {
  return state.doc.textBetween(0, overflowStart(state.doc), '\n');
}

export function overflowText(state: EditorState): string {
  return state.doc.textBetween(overflowStart(state.doc), state.doc.content.size, '\n');
}

export function typeText(state: EditorState, text: string): EditorState {
  return state.apply(state.tr.insertText(text).setMeta('addToHistory', true));
}
