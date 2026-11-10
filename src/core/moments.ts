import { Node } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import { ReplaceStep, Step } from 'prosemirror-transform';
import { eventsOf, type EditEvent } from './piece';
import { schema } from './schema';

/**
 * The piece's full writing timeline: the document it started from and every
 * change since, as ProseMirror steps, so it can be replayed exactly. This is
 * separate from undo timeline and is never written into the piece file.
 */
/** What a moment was: a burst of writing, or one of the writer's choices (from the event log). */
export type EntryKind = 'typed' | 'deleted' | 'edited' | EditEvent['kind'];

/** The families the timeline colours by. */
export const KIND_FAMILY: Record<EntryKind, 'writing' | 'cutting' | 'alternatives' | 'ghost' | 'overflow'> = {
  typed: 'writing',
  edited: 'writing',
  deleted: 'cutting',
  'variant-added': 'alternatives',
  'variant-dropped': 'cutting',
  flipped: 'alternatives',
  ghosted: 'ghost',
  revived: 'ghost',
  stashed: 'overflow',
  used: 'overflow',
};

export interface Moment {
  t: number;
  kind: EntryKind;
  steps: Record<string, unknown>[];
  /** Set when Write On (the machine) took part: a WO moment, drawn in blue. */
  by?: 'machine';
}

export interface PieceTimeline {
  pieceId: string;
  start: Record<string, unknown>;
  moments: Moment[];
}

/** Writing within this many ms of the last change joins the same moment. */
export const COALESCE_MS = 1000;

export function startTimeline(doc: Node): PieceTimeline {
  return { pieceId: String(doc.attrs.id), start: doc.toJSON(), moments: [] };
}

function kindOf(tr: Transaction): EntryKind {
  const events = eventsOf(tr);
  if (events.length) return events[0].kind;
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

/** Add a transaction to the timeline; bursts of typing (or deleting) coalesce. */
export function record(timeline: PieceTimeline, tr: Transaction, now = Date.now()): PieceTimeline {
  if (!tr.docChanged) return timeline;
  const kind = kindOf(tr);
  const steps = tr.steps.map((s) => s.toJSON() as Record<string, unknown>);
  const last = timeline.moments[timeline.moments.length - 1];
  const moments = timeline.moments.slice();
  const writing = (k: EntryKind) => k === 'typed' || k === 'deleted' || k === 'edited';
  if (last && writing(last.kind) && writing(kind) && now - last.t < COALESCE_MS) {
    // One burst of writing is one moment, even with a few corrections in it.
    const merged: EntryKind = last.kind === kind ? kind : 'edited';
    moments[moments.length - 1] = { ...last, t: now, kind: merged, steps: [...last.steps, ...steps] };
  } else {
    const by = eventsOf(tr).some((e) => 'by' in e && e.by === 'machine') ? 'machine' : undefined;
    moments.push(by ? { t: now, kind, steps, by } : { t: now, kind, steps });
  }
  return { ...timeline, moments };
}

/** Every document the piece has been: index 0 is the start, index i is after entry i - 1. */
export function replay(timeline: PieceTimeline): Node[] {
  let doc = Node.fromJSON(schema, timeline.start);
  const docs = [doc];
  for (const entry of timeline.moments) {
    for (const json of entry.steps) {
      const result = Step.fromJSON(schema, json).apply(doc);
      if (result.failed || !result.doc) throw new Error(`timeline no longer replays: ${result.failed}`);
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
  if (toBefore < from) {
    toAfter += from - toBefore;
    toBefore = from;
  }
  if (toAfter < from) {
    toBefore += from - toAfter;
    toAfter = from;
  }
  return { from, toBefore, toAfter };
}

/** Map a position in the document after entry `index` to the current document. */
export function mapToNow(timeline: PieceTimeline, index: number, pos: number): number | null {
  let mapped = pos;
  for (const entry of timeline.moments.slice(index + 1)) {
    for (const json of entry.steps) {
      const result = Step.fromJSON(schema, json).getMap().mapResult(mapped, 1);
      if (result.deleted) return null;
      mapped = result.pos;
    }
  }
  return mapped;
}
