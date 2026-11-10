import { Fragment, Slice, type Node } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView, type NodeView } from 'prosemirror-view';
import { findGroup } from '../core/groups';
import { newId, overflowStart } from '../core/piece';
import { schema, type GroupAttrs } from '../core/schema';

export interface LookState {
  /** Group under the pointer, tinted. */
  hovered: string | null;
  /** Group that just flipped, briefly blurred in. */
  flashed: string | null;
  /** The spot the alternatives panel is working on; the rest of the page dims. */
  focus: { from: number; to: number } | null;
}

export const lookKey = new PluginKey<LookState>('look');

export function setLook(view: EditorView, patch: Partial<LookState>): void {
  view.dispatch(view.state.tr.setMeta(lookKey, patch));
}

function groupDecorations(doc: Node, id: string, cls: string, blockCls: string): Decoration[] {
  const loc = findGroup(doc, id);
  if (!loc) return [];
  if (loc.blockPos !== undefined) {
    const node = doc.nodeAt(loc.blockPos)!;
    return [Decoration.node(loc.blockPos, loc.blockPos + node.nodeSize, { class: blockCls })];
  }
  return [Decoration.inline(loc.from, loc.to, { class: cls })];
}

function focusDecorations(doc: Node, focus: { from: number; to: number }): Decoration[] {
  const out: Decoration[] = [];
  const limit = overflowStart(doc);
  doc.forEach((block, pos) => {
    if (pos >= limit) return;
    const start = pos + 1;
    const end = pos + block.nodeSize - 1;
    if (focus.to < start || focus.from > end) {
      out.push(Decoration.node(pos, pos + block.nodeSize, { class: 'dim-far' }));
      return;
    }
    if (focus.from > start) out.push(Decoration.inline(start, focus.from, { class: 'dim-near' }));
    if (focus.to < end) out.push(Decoration.inline(focus.to, end, { class: 'dim-near' }));
  });
  return out;
}

export const look = new Plugin<LookState>({
  key: lookKey,
  state: {
    init: () => ({ hovered: null, flashed: null, focus: null }),
    apply(tr, prev) {
      const patch = tr.getMeta(lookKey) as Partial<LookState> | undefined;
      let next = prev;
      if (prev.focus && tr.docChanged) {
        next = { ...next, focus: { from: tr.mapping.map(prev.focus.from, -1), to: tr.mapping.map(prev.focus.to, 1) } };
      }
      return patch ? { ...next, ...patch } : next;
    },
  },
  props: {
    decorations(state) {
      const look = lookKey.getState(state)!;
      const decos: Decoration[] = [];
      if (look.hovered) decos.push(...groupDecorations(state.doc, look.hovered, 'alt-hover', 'alt-block-hover'));
      if (look.flashed) decos.push(...groupDecorations(state.doc, look.flashed, 'alt-flash', 'alt-flash'));
      if (look.focus) decos.push(...focusDecorations(state.doc, look.focus));
      return DecorationSet.create(state.doc, decos);
    },
  },
});

/** Give every group in a pasted or dropped slice a fresh id, so ids stay unique. */
function freshIds(fragment: Fragment, ids: Map<string, string>): Fragment {
  const nodes: Node[] = [];
  fragment.forEach((node) => {
    let next = node;
    const alt = node.attrs.alt as GroupAttrs | null | undefined;
    if (alt) next = node.type.create({ ...node.attrs, alt: { ...alt, id: remap(alt.id, ids) } }, node.content, node.marks);
    if (next.isText) {
      next = next.mark(
        next.marks.map((m) => (m.type === schema.marks.alt ? m.type.create({ ...m.attrs, id: remap(m.attrs.id as string, ids) }) : m)),
      );
    } else if (next.content.size) {
      next = next.copy(freshIds(next.content, ids));
    }
    nodes.push(next);
  });
  return Fragment.fromArray(nodes);
}

function remap(id: string, ids: Map<string, string>): string {
  if (!ids.has(id)) ids.set(id, newId());
  return ids.get(id)!;
}

export const pasteFreshIds = new Plugin({
  props: {
    transformPasted(slice, view) {
      // A drag inside the editor is a move: the group leaves its old place, so it keeps its id.
      if (view.dragging?.move) return slice;
      return new Slice(freshIds(slice.content, new Map()), slice.openStart, slice.openEnd);
    },
  },
});

/** Overflow renders as the right-hand panel, with a handwritten header and hint. */
export class OverflowView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;

  constructor() {
    this.dom = document.createElement('aside');
    this.dom.className = 'overflow';
    this.dom.setAttribute('aria-label', 'Overflow');
    const head = document.createElement('h2');
    head.textContent = 'Overflow';
    head.contentEditable = 'false';
    this.contentDOM = document.createElement('div');
    this.contentDOM.className = 'overflow-body';
    const foot = document.createElement('footer');
    foot.textContent = 'ctrl+↵ or drag into the page to use';
    foot.contentEditable = 'false';
    this.dom.append(head, this.contentDOM, foot);
  }

  ignoreMutation(m: { target: globalThis.Node }): boolean {
    return !this.contentDOM.contains(m.target);
  }

  stopEvent(): boolean {
    return false;
  }
}
