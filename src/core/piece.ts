import type { Node } from 'prosemirror-model';
import { Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { parseBlocks } from './markdown';
import { schema } from './schema';

/** Something the writer did that the learning layer will want to know. */
export type EditEvent =
  | { kind: 'variant-added'; groupId: string; grain: string; text: string }
  | { kind: 'flipped'; groupId: string; grain: string; from: number; to: number; text: string }
  | { kind: 'variant-dropped'; groupId: string; grain: string; text: string }
  | { kind: 'ghosted' | 'revived'; text: string }
  | { kind: 'stashed' | 'used'; text: string };

export const EVENTS_META = 'write_on_events';

export function addEvents(tr: Transaction, events: EditEvent[]): Transaction {
  const prior = (tr.getMeta(EVENTS_META) as EditEvent[] | undefined) ?? [];
  return tr.setMeta(EVENTS_META, [...prior, ...events]);
}

export function eventsOf(tr: Transaction): EditEvent[] {
  return (tr.getMeta(EVENTS_META) as EditEvent[] | undefined) ?? [];
}

export function newId(): string {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 8);
}

/** Build a piece document from a Markdown body and Overflow Markdown. */
export function docFromMarkdown(body: string, overflow = '', id = newId()): Node {
  const blocks = parseBlocks(body);
  if (blocks.length === 0) blocks.push(schema.nodes.paragraph.create());
  const stashed = parseBlocks(overflow).map((b) =>
    b.type === schema.nodes.paragraph ? b : schema.nodes.paragraph.create(null, b.content),
  );
  if (stashed.length === 0) stashed.push(schema.nodes.paragraph.create());
  return schema.nodes.doc.create({ id }, [...blocks, schema.nodes.overflow.create(null, stashed)]);
}

/** The page's blocks: everything except Overflow. */
export function pageBlocks(doc: Node): Node[] {
  const out: Node[] = [];
  doc.forEach((child) => {
    if (child.type !== schema.nodes.overflow) out.push(child);
  });
  return out;
}

export function overflowNode(doc: Node): Node {
  return doc.lastChild as Node;
}

/** Document position where the Overflow node starts. */
export function overflowStart(doc: Node): number {
  return doc.content.size - overflowNode(doc).nodeSize;
}

export function isInOverflow(doc: Node, pos: number): boolean {
  return pos > overflowStart(doc);
}

/** Word and character count of the page (Overflow excluded, ghosts included). */
export function countPiece(doc: Node): { words: number; chars: number } {
  let words = 0;
  let chars = 0;
  for (const block of pageBlocks(doc)) {
    const text = block.textContent;
    chars += text.length;
    words += text.split(/\s+/).filter(Boolean).length;
  }
  return { words, chars };
}

/** Remembers where the caret last was in the page, so Use knows where to put text. */
export const pageCaretKey = new PluginKey<number>('pageCaret');

export const pageCaret = new Plugin<number>({
  key: pageCaretKey,
  state: {
    init: (_config, state) => state.selection.head,
    apply(tr, prev, _old, state) {
      const head = state.selection.head;
      if (!isInOverflow(state.doc, head)) return head;
      return Math.min(tr.mapping.map(prev), overflowStart(state.doc));
    },
  },
});
