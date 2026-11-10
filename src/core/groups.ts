import { Fragment, type Mark, type Node } from 'prosemirror-model';
import type { Command, EditorState, Transaction } from 'prosemirror-state';
import { appendToOverflow } from './overflow';
import { addEvents, isInOverflow, newId } from './piece';
import { schema, type Grain, type GroupAttrs, type VariantContent } from './schema';
import { articleFix, sentenceRanges, trimRange, wordAt } from './text';

/** Where an alternative group sits in the document right now. */
export interface GroupLocation {
  /** The group, with the active slot refreshed from the live text. */
  attrs: GroupAttrs;
  /** Range of the live (active) text. For paragraph groups, the block's content. */
  from: number;
  to: number;
  /** For paragraph groups, the position of the block node itself. */
  blockPos?: number;
}

/** A place where a new group could be made: what `Ctrl+Shift+A` would act on. */
export interface GroupTarget {
  grain: Grain;
  from: number;
  to: number;
}

const altType = schema.marks.alt;

function altMarkOf(node: Node): Mark | undefined {
  return node.marks.find((m) => m.type === altType);
}

/** Inline content of a range as variant JSON, without the group's own mark. */
function contentOf(doc: Node, from: number, to: number, dropAltId?: string): VariantContent {
  const nodes: Node[] = [];
  doc.slice(from, to).content.forEach((n) => {
    const own = altMarkOf(n);
    nodes.push(own && own.attrs.id === dropAltId ? n.mark(altType.removeFromSet(n.marks)) : n);
  });
  return Fragment.fromArray(nodes).toJSON() ?? [];
}

function variantNodes(content: VariantContent, mark?: Mark): Node[] {
  const nodes: Node[] = [];
  Fragment.fromJSON(schema, content).forEach((n) => nodes.push(mark ? n.mark(mark.addToSet(n.marks)) : n));
  return nodes;
}

/** Plain text of a variant, for the panel and the event log. */
export function variantText(content: VariantContent): string {
  let text = '';
  Fragment.fromJSON(schema, content).forEach((n) => (text += n.textContent));
  return text;
}

export function textVariant(text: string): VariantContent {
  return text ? [{ type: 'text', text }] : [];
}

/** Find a group by id. Returns null if it is no longer in the document. */
export function findGroup(doc: Node, id: string): GroupLocation | null {
  let found: GroupLocation | null = null;
  doc.descendants((node, pos) => {
    if (found && found.blockPos !== undefined) return false;
    const block = node.attrs?.alt as GroupAttrs | null | undefined;
    if (node.isTextblock && block?.id === id) {
      found = { attrs: block, from: pos + 1, to: pos + node.nodeSize - 1, blockPos: pos };
      return false;
    }
    if (node.isText) {
      const mark = altMarkOf(node);
      if (mark?.attrs.id === id) {
        if (!found) found = { attrs: mark.attrs as GroupAttrs, from: pos, to: pos + node.nodeSize };
        else if (found.to === pos) found.to = pos + node.nodeSize;
      }
    }
    return true;
  });
  if (!found) return null;
  const loc = found as GroupLocation;
  const live = contentOf(doc, loc.from, loc.to, loc.blockPos === undefined ? id : undefined);
  const variants = loc.attrs.variants.slice();
  variants[loc.attrs.active] = live;
  return { ...loc, attrs: { ...loc.attrs, variants } };
}

/** Every group id in the document, inline groups first in document order. */
export function allGroupIds(doc: Node): string[] {
  const ids = new Set<string>();
  doc.descendants((node) => {
    const block = node.attrs?.alt as GroupAttrs | null | undefined;
    if (block) ids.add(block.id);
    const mark = node.isText ? altMarkOf(node) : undefined;
    if (mark) ids.add(mark.attrs.id as string);
  });
  return [...ids];
}

/**
 * The group at a position: a word or sentence group whose text touches it,
 * otherwise a paragraph group on the block that contains it.
 */
export function groupAt(doc: Node, pos: number): string | null {
  const $pos = doc.resolve(pos);
  const after = $pos.nodeAfter && altMarkOf($pos.nodeAfter);
  const before = $pos.nodeBefore && altMarkOf($pos.nodeBefore);
  const inline = after ?? before;
  if (inline) return inline.attrs.id as string;
  for (let d = $pos.depth; d > 0; d--) {
    const alt = $pos.node(d).attrs.alt as GroupAttrs | null | undefined;
    if (alt) return alt.id;
  }
  return null;
}

/**
 * Decide the grain from the selection: a whole paragraph makes a paragraph
 * group, whole sentences a sentence group, anything else a word group. An
 * empty selection takes the word at the caret.
 */
export function targetForSelection(state: EditorState): GroupTarget | null {
  const { $from, $to, empty } = state.selection;
  if (isInOverflow(state.doc, $from.pos) || !$from.parent.isTextblock || !$from.sameParent($to)) return null;
  const text = $from.parent.textContent;
  const start = $from.start();
  if (empty) {
    const word = wordAt(text, $from.parentOffset);
    return word ? { grain: 'word', from: start + word[0], to: start + word[1] } : null;
  }
  const [a, b] = trimRange(text, [$from.parentOffset, $to.parentOffset]);
  if (a === b) return null;
  const whole = trimRange(text, [0, text.length]);
  if (a <= whole[0] && b >= whole[1]) return { grain: 'paragraph', from: start, to: start + text.length };
  const sentences = sentenceRanges(text);
  const startsSentence = sentences.some(([s]) => s === a);
  const endsSentence = sentences.some(([, e]) => e === b);
  if (startsSentence && endsSentence) return { grain: 'sentence', from: start + a, to: start + b };
  return { grain: 'word', from: start + a, to: start + b };
}

/** Widen an inline range so it never cuts through an existing inline group. */
function widenOverGroups(doc: Node, from: number, to: number): [number, number] {
  let lo = from;
  let hi = to;
  doc.nodesBetween(from, to, (node) => {
    const mark = node.isText ? altMarkOf(node) : undefined;
    if (mark) {
      const loc = findGroup(doc, mark.attrs.id as string);
      if (loc) {
        lo = Math.min(lo, loc.from);
        hi = Math.max(hi, loc.to);
      }
    }
  });
  return [lo, hi];
}

/**
 * Flatten the inline groups inside a range (ADR-0004): their live text stays,
 * and their other variants go to Overflow so nothing is lost.
 */
function flattenInlineGroups(tr: Transaction, from: number, to: number): void {
  const seen = new Set<string>();
  const notes: string[] = [];
  tr.doc.nodesBetween(from, to, (node) => {
    const mark = node.isText ? altMarkOf(node) : undefined;
    const id = mark?.attrs.id as string | undefined;
    if (!id || seen.has(id)) return;
    seen.add(id);
    const loc = findGroup(tr.doc, id);
    if (!loc) return;
    const showing = variantText(loc.attrs.variants[loc.attrs.active]);
    loc.attrs.variants.forEach((v, i) => {
      if (i !== loc.attrs.active) notes.push(`from “${showing}”: ${variantText(v)}`);
    });
  });
  if (seen.size === 0) return;
  tr.removeMark(from, to, altType);
  appendToOverflow(tr, notes);
}

/**
 * Make a new group over `target` whose second variant is `content`, and show it.
 * This is what typing into the panel's empty row does the first time.
 */
export function createGroup(target: GroupTarget, content: VariantContent): Command {
  return (state, dispatch) => {
    if (target.grain !== 'paragraph' && content.length === 0) return false;
    if (!dispatch) return true;
    const tr = state.tr;
    const id = newId();
    if (target.grain === 'paragraph') {
      const $pos = state.doc.resolve(target.from);
      const blockPos = $pos.before();
      const block = $pos.parent;
      const current = contentOf(state.doc, $pos.start(), $pos.end());
      const attrs: GroupAttrs = { id, grain: 'paragraph', variants: [current, content], active: 1 };
      tr.setNodeMarkup(blockPos, undefined, { ...block.attrs, alt: attrs });
      tr.replaceWith($pos.start(), $pos.end(), variantNodes(content));
    } else {
      const [from, to] = widenOverGroups(state.doc, target.from, target.to);
      flattenInlineGroups(tr, from, to);
      const current = contentOf(tr.doc, from, to);
      const attrs: GroupAttrs = { id, grain: target.grain, variants: [current, content], active: 1 };
      tr.replaceWith(from, to, variantNodes(content, altType.create(attrs)));
      if (target.grain === 'word') fixArticle(tr, from, variantText(content));
    }
    addEvents(tr, [{ kind: 'variant-added', groupId: id, grain: target.grain, text: variantText(content) }]);
    // altDeleted: the flattened inner groups already sent their variants to Overflow.
    dispatch(tr.setMeta('altCreated', id).setMeta('altDeleted', true).scrollIntoView());
    return true;
  };
}

/** Replace the live text of a located group and store new attributes. */
function writeGroup(tr: Transaction, loc: GroupLocation, attrs: GroupAttrs, show: VariantContent | null): void {
  if (loc.blockPos !== undefined) {
    const block = tr.doc.nodeAt(loc.blockPos)!;
    tr.setNodeMarkup(loc.blockPos, undefined, { ...block.attrs, alt: attrs });
    if (show) tr.replaceWith(loc.from, loc.to, variantNodes(show));
  } else if (show) {
    tr.replaceWith(loc.from, loc.to, variantNodes(show, altType.create(attrs)));
    if (attrs.grain === 'word') fixArticle(tr, loc.from, variantText(show));
  } else {
    tr.removeMark(loc.from, loc.to, altType).addMark(loc.from, loc.to, altType.create(attrs));
  }
}

/** Add a variant to an existing group and show it. */
export function addVariant(id: string, content: VariantContent): Command {
  return (state, dispatch) => {
    const loc = findGroup(state.doc, id);
    if (!loc || (loc.blockPos === undefined && content.length === 0)) return false;
    if (!dispatch) return true;
    const variants = [...loc.attrs.variants, content];
    const tr = state.tr;
    writeGroup(tr, loc, { ...loc.attrs, variants, active: variants.length - 1 }, content);
    addEvents(tr, [{ kind: 'variant-added', groupId: id, grain: loc.attrs.grain, text: variantText(content) }]);
    dispatch(tr);
    return true;
  };
}

/** Change the text of one variant, as typing in a panel row does. */
export function setVariantText(id: string, index: number, text: string): Command {
  return (state, dispatch) => {
    const loc = findGroup(state.doc, id);
    if (!loc || index < 0 || index >= loc.attrs.variants.length) return false;
    const isActive = index === loc.attrs.active;
    if (isActive && loc.blockPos === undefined && text === '') return false;
    if (!dispatch) return true;
    const variants = loc.attrs.variants.slice();
    variants[index] = textVariant(text);
    const tr = state.tr;
    writeGroup(tr, loc, { ...loc.attrs, variants }, isActive ? variants[index] : null);
    dispatch(tr);
    return true;
  };
}

/** For a word group, make a preceding "a"/"an" agree with the text now showing. */
function fixArticle(tr: Transaction, from: number, shown: string): void {
  const $from = tr.doc.resolve(from);
  const before = $from.parent.textBetween(0, $from.parentOffset);
  const fix = articleFix(before, shown);
  if (!fix) return;
  const start = $from.start();
  tr.insertText(fix.text, start + fix.range[0], start + fix.range[1]);
}

/**
 * Show another variant. A flip is state, not an edit: it never enters undo
 * history (ADR-0003).
 */
export function flipTo(id: string, index: number): Command {
  return (state, dispatch) => {
    const loc = findGroup(state.doc, id);
    if (!loc) return false;
    const n = loc.attrs.variants.length;
    const next = ((index % n) + n) % n;
    if (next === loc.attrs.active) return false;
    if (!dispatch) return true;
    const tr = state.tr;
    const attrs = { ...loc.attrs, active: next };
    const shown = loc.attrs.variants[next];
    writeGroup(tr, loc, attrs, shown);
    addEvents(tr, [
      { kind: 'flipped', groupId: id, grain: attrs.grain, from: loc.attrs.active, to: next, text: variantText(shown) },
    ]);
    dispatch(tr.setMeta('addToHistory', false).setMeta('flipped', id));
    return true;
  };
}

export function flip(id: string, direction: 1 | -1): Command {
  return (state, dispatch) => {
    const loc = findGroup(state.doc, id);
    return loc ? flipTo(id, loc.attrs.active + direction)(state, dispatch) : false;
  };
}

/**
 * Remove the showing variant; the next one shows. A group left with one
 * variant dissolves into plain text. Undoable.
 */
export function deleteActiveVariant(id: string): Command {
  return (state, dispatch) => {
    const loc = findGroup(state.doc, id);
    if (!loc) return false;
    if (!dispatch) return true;
    const { variants, active, grain } = loc.attrs;
    const removed = variants[active];
    const rest = variants.filter((_, i) => i !== active);
    const tr = state.tr;
    if (rest.length === 1) {
      if (loc.blockPos !== undefined) {
        const block = state.doc.nodeAt(loc.blockPos)!;
        tr.setNodeMarkup(loc.blockPos, undefined, { ...block.attrs, alt: null });
        tr.replaceWith(loc.from, loc.to, variantNodes(rest[0]));
      } else {
        tr.replaceWith(loc.from, loc.to, variantNodes(rest[0]));
        if (grain === 'word') fixArticle(tr, loc.from, variantText(rest[0]));
      }
    } else {
      const next = Math.min(active, rest.length - 1);
      writeGroup(tr, loc, { ...loc.attrs, variants: rest, active: next }, rest[next]);
    }
    addEvents(tr, [{ kind: 'variant-dropped', groupId: id, grain, text: variantText(removed) }]);
    dispatch(tr.setMeta('altDeleted', id));
    return true;
  };
}
