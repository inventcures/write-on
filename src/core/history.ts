import { Node } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import { ReplaceStep, Step } from 'prosemirror-transform';
import { eventsOf } from './piece';
import { schema } from './schema';

/**
 * The piece's full writing history: the document it started from and every
 * change since, as ProseMirror steps, so it can be replayed exactly. This is
 * separate from undo history and is never written into the piece file.
 */
export type EntryKind =
  | 'typed'
  | 'deleted'
  | 'edited'
  | 'alternative'
  | 'flipped'
  | 'ghost'
  | 'overflow';

export interface HistoryEntry {
  t: number;
  kind: EntryKind;
  steps: Record<string, unknown>[];
}

export interface PieceHistory {
  pieceId: string;
  start: Record<string, unknown>;
  entries: HistoryEntry[];
}

/** Typing within this many ms of the last keystroke joins the same entry. */
export const COALESCE_MS = 1000;

export function startHistory(doc: Node): PieceHistory {
  return { pieceId: String(doc.attrs.id), start: doc.toJSON(), entries: [] };
}

function kindOf(tr: Transaction): EntryKind {
  const events = eventsOf(tr);
  if (events.length) {
    const k = events[0].kind;
    if (k === 'alt_selected') return 'flipped';
    if (k === 'alt_added' || k === 'alt_deleted') return 'alternative';
    if (k === 'ghosted' || k === 'revived') return 'ghost';
    return 'overflow';
  }
  let inserts = false;
  let deletes = false;
  for (const step of tr.steps) {
    if (!(step instanceof ReplaceStep)) return 'edited';
    const s = step as unknown as { from: number; to: number; slice: { size: number } };
    if (s.slice.size > 0) inserts = true;
    if (s.to > s.from) deletes = true;
  }
  if (inserts && !deletes) return 'typed';
  if (deletes && !inserts) return 'deleted';
  return 'edited';
}

/** Add a transaction to the history; bursts of typing (or deleting) coalesce. */
export function record(history: PieceHistory, tr: Transaction, now = Date.now()): PieceHistory {
  if (!tr.docChanged) return history;
  const kind = kindOf(tr);
  const steps = tr.steps.map((s) => s.toJSON() as Record<string, unknown>);
  const last = history.entries[history.entries.length - 1];
  const entries = history.entries.slice();
  if (last && last.kind === kind && (kind === 'typed' || kind === 'deleted') && now - last.t < COALESCE_MS) {
    entries[entries.length - 1] = { ...last, t: now, steps: [...last.steps, ...steps] };
  } else {
    entries.push({ t: now, kind, steps });
  }
  return { ...history, entries };
}

/** Every document the piece has been: index 0 is the start, index i is after entry i - 1. */
export function replay(history: PieceHistory): Node[] {
  let doc = Node.fromJSON(schema, history.start);
  const docs = [doc];
  for (const entry of history.entries) {
    for (const json of entry.steps) {
      const result = Step.fromJSON(schema, json).apply(doc);
      if (result.failed || !result.doc) throw new Error(`history no longer replays: ${result.failed}`);
      doc = result.doc;
    }
    docs.push(doc);
  }
  return docs;
}

/** What one entry changed: positions in the documents before and after it. */
export function changeOf(before: Node, after: Node): { from: number; toBefore: number; toAfter: number } | null {
  const from = before.content.findDiffStart(after.content);
  if (from === null) return null;
  const end = before.content.findDiffEnd(after.content)!;
  let toBefore = end.a;
  let toAfter = end.b;
  // findDiffEnd can overlap findDiffStart when text repeats; clamp.
  if (toBefore < from) toAfter += from - toBefore, (toBefore = from);
  if (toAfter < from) toBefore += from - toAfter, (toAfter = from);
  return { from, toBefore, toAfter };
}

/** Map a position in the document after entry `index` to the current document. */
export function mapToNow(history: PieceHistory, index: number, pos: number): number | null {
  let mapped = pos;
  for (const entry of history.entries.slice(index + 1)) {
    for (const json of entry.steps) {
      const result = Step.fromJSON(schema, json).getMap().mapResult(mapped, 1);
      if (result.deleted) return null;
      mapped = result.pos;
    }
  }
  return mapped;
}
