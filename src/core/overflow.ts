import { Fragment, type Node } from 'prosemirror-model';
import type { Command } from 'prosemirror-state';
import type { Transform } from 'prosemirror-transform';
import { addEvents, isInOverflow, overflowNode, overflowStart, pageCaretKey } from './piece';
import { schema } from './schema';

/** Append paragraphs (plain strings or inline content) to the end of Overflow. */
export function appendToOverflow<T extends Transform>(tr: T, items: (string | Fragment | Node)[]): T {
  const paragraphs = items
    .map((item) => {
      // A whole block keeps its paragraph group, so its variants travel with it.
      if (item instanceof Fragment) return schema.nodes.paragraph.create(null, item);
      if (typeof item === 'string') return schema.nodes.paragraph.create(null, item ? schema.text(item) : null);
      return schema.nodes.paragraph.create({ alt: item.attrs.alt ?? null }, item.content);
    })
    .filter((p) => p.content.size > 0);
  if (paragraphs.length === 0) return tr;
  const overflow = overflowNode(tr.doc);
  const start = overflowStart(tr.doc);
  const end = start + overflow.nodeSize - 1;
  const onlyEmpty = overflow.childCount === 1 && overflow.firstChild!.content.size === 0;
  if (onlyEmpty) tr.replaceWith(start + 1, end, paragraphs);
  else tr.insert(end, paragraphs);
  return tr;
}

/**
 * Stash: move the selection, or the paragraph at the caret, out of the page
 * and onto the end of Overflow.
 */
export const stash: Command = (state, dispatch) => {
  const { selection, doc } = state;
  if (isInOverflow(doc, selection.from)) return false;
  const tr = state.tr;
  let content: (Fragment | Node)[];
  let text: string;
  if (selection.empty) {
    const $pos = selection.$from;
    if (!$pos.parent.isTextblock || $pos.parent.content.size === 0) return false;
    const block = $pos.parent;
    content = [block];
    text = block.textContent;
    if (!dispatch) return true;
    const pageBlocks = doc.childCount - 1;
    if (pageBlocks <= 1) tr.replaceWith($pos.start(), $pos.end(), Fragment.empty);
    else tr.delete($pos.before(), $pos.after());
  } else {
    const slice = doc.slice(selection.from, selection.to);
    content = [];
    slice.content.forEach((n) => content.push(n.isTextblock ? n.content : Fragment.from(n)));
    if (slice.openStart === 0 && slice.content.firstChild?.isInline) content = [slice.content];
    text = doc.textBetween(selection.from, selection.to, '\n\n');
    if (!dispatch) return true;
    tr.deleteSelection();
  }
  appendToOverflow(tr, content);
  addEvents(tr, [{ kind: 'stashed', text }]);
  dispatch(tr.scrollIntoView());
  return true;
};

/**
 * Use: move the Overflow paragraph at the caret back into the page, as a new
 * paragraph after the block where the page's caret last was.
 */
export const useFromOverflow: Command = (state, dispatch) => {
  const { selection, doc } = state;
  if (!isInOverflow(doc, selection.from)) return false;
  const $pos = selection.$from;
  const item: Node = $pos.parent;
  if (item.content.size === 0) return false;
  if (!dispatch) return true;
  const tr = state.tr;
  const overflow = overflowNode(doc);
  if (overflow.childCount === 1) tr.replaceWith($pos.start(), $pos.end(), Fragment.empty);
  else tr.delete($pos.before(), $pos.after());
  const caret = Math.min(pageCaretKey.getState(state) ?? 0, overflowStart(tr.doc) - 1);
  const $caret = tr.doc.resolve(Math.max(1, caret));
  const insertAt = $caret.depth > 0 ? $caret.after(1) : overflowStart(tr.doc);
  tr.insert(insertAt, schema.nodes.paragraph.create(item.attrs, item.content));
  addEvents(tr, [{ kind: 'used', text: item.textContent }]);
  dispatch(tr.scrollIntoView());
  return true;
};
