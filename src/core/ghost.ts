import type { Node } from 'prosemirror-model';
import type { Command } from 'prosemirror-state';
import { addEvents } from './piece';
import { schema } from './schema';

const ghostType = schema.marks.ghost;

/** The whole ghosted run around `pos` within its textblock, or null. */
export function ghostRunAt(doc: Node, pos: number): { from: number; to: number } | null {
  const $pos = doc.resolve(pos);
  const parent = $pos.parent;
  if (!parent.isTextblock) return null;
  const start = $pos.start();
  const runs: { from: number; to: number }[] = [];
  parent.forEach((child, offset) => {
    if (!ghostType.isInSet(child.marks)) return;
    const from = start + offset;
    const to = from + child.nodeSize;
    const last = runs[runs.length - 1];
    if (last && last.to === from) last.to = to;
    else runs.push({ from, to });
  });
  return runs.find((r) => r.from <= pos && pos <= r.to) ?? null;
}

/**
 * Ghost the selection, or revive it. With the caret (or a selection) inside
 * ghosted text, the whole ghosted run is revived.
 */
export const toggleGhost: Command = (state, dispatch) => {
  const { from, to, empty } = state.selection;
  const runAtStart = ghostRunAt(state.doc, from);
  const touchesGhost = runAtStart || state.doc.rangeHasMark(from, to, ghostType);
  if (empty && !runAtStart) return false;
  if (!dispatch) return true;
  const tr = state.tr;
  if (touchesGhost) {
    let lo = from;
    let hi = to;
    const runAtEnd = ghostRunAt(state.doc, to);
    if (runAtStart) lo = Math.min(lo, runAtStart.from);
    if (runAtEnd) hi = Math.max(hi, runAtEnd.to);
    tr.removeMark(lo, hi, ghostType);
    addEvents(tr, [{ kind: 'revived', text: state.doc.textBetween(lo, hi, '\n\n') }]);
  } else {
    tr.addMark(from, to, ghostType.create());
    addEvents(tr, [{ kind: 'ghosted', text: state.doc.textBetween(from, to, '\n\n') }]);
  }
  dispatch(tr);
  return true;
};

/** Remove ghosted text, for a clean Export. */
export function withoutGhosts(doc: Node): Node {
  const ranges: { from: number; to: number }[] = [];
  doc.descendants((node, pos) => {
    if (node.isText && ghostType.isInSet(node.marks)) ranges.push({ from: pos, to: pos + node.nodeSize });
  });
  let out = doc;
  for (const r of ranges.reverse()) out = out.replace(r.from, r.to, out.slice(r.from, r.from));
  return out;
}
