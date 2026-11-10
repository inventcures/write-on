import type { Node } from 'prosemirror-model';
import { isHistoryTransaction } from 'prosemirror-history';
import { Plugin } from 'prosemirror-state';
import { Transform } from 'prosemirror-transform';
import { allGroupIds, findGroup, variantText, type GroupLocation } from './groups';
import { appendToOverflow } from './overflow';
import { overflowStart } from './piece';
import { schema } from './schema';

/** Overflow notes for a group's variants that aren't showing. */
function notesFor(loc: GroupLocation): string[] {
  const showing = variantText(loc.attrs.variants[loc.attrs.active]);
  return loc.attrs.variants
    .filter((_, i) => i !== loc.attrs.active)
    .map((v) => `from “${showing}”: ${variantText(v)}`)
    .filter((note) => !note.endsWith(': '));
}

/** Positions in the page where `text` occurs, as [from, to). */
function occurrences(doc: Node, text: string): [number, number][] {
  const hits: [number, number][] = [];
  if (!text) return hits;
  const limit = overflowStart(doc);
  doc.descendants((node, pos) => {
    if (pos >= limit) return false;
    if (!node.isTextblock) return true;
    const content = node.textContent;
    for (let i = content.indexOf(text); i !== -1; i = content.indexOf(text, i + 1)) {
      hits.push([pos + 1 + i, pos + 1 + i + text.length]);
    }
    return false;
  });
  return hits;
}

/**
 * The piece's body was edited outside Write_On. Keep the edited text, put back
 * every group (and ghost) whose text can still be found (nearest to where it
 * was, if it occurs more than once), and move
 * the variants of the rest into Overflow so nothing is lost.
 */
/** Of several places the text occurs, the one nearest where it used to be. */
function nearest(hits: [number, number][], was: number): [number, number] | undefined {
  return hits.slice().sort((a, b) => Math.abs(a[0] - was) - Math.abs(b[0] - was))[0];
}

export function recoverGroups(stored: Node, edited: Node): { doc: Node; lost: number; lostGhosts: number } {
  const tr = new Transform(edited);
  const notes: string[] = [];
  let lost = 0;
  let lostGhosts = 0;
  const storedLimit = overflowStart(stored);

  for (const id of allGroupIds(stored)) {
    const loc = findGroup(stored, id);
    if (!loc || loc.from >= storedLimit) continue;
    const text = stored.textBetween(loc.from, loc.to);
    const hits = occurrences(tr.doc, text);
    let placed = false;
    if (loc.blockPos !== undefined) {
      const whole = hits.filter(([from, to]) => {
        const $from = tr.doc.resolve(from);
        return $from.parentOffset === 0 && to === $from.end() && !$from.parent.attrs.alt;
      });
      const hit = nearest(whole, loc.from);
      if (hit) {
        const $from = tr.doc.resolve(hit[0]);
        tr.setNodeMarkup($from.before(), undefined, { ...$from.parent.attrs, alt: loc.attrs });
        placed = true;
      }
    } else {
      const free = hits.filter(([from, to]) => !tr.doc.rangeHasMark(from, to, schema.marks.alt));
      const hit = nearest(free, loc.from);
      if (hit) {
        tr.addMark(hit[0], hit[1], schema.marks.alt.create(loc.attrs));
        placed = true;
      }
    }
    if (!placed) {
      lost++;
      notes.push(...notesFor(loc));
    }
  }

  stored.descendants((node, pos) => {
    if (pos >= storedLimit) return false;
    if (node.isText && schema.marks.ghost.isInSet(node.marks)) {
      const hit = nearest(occurrences(tr.doc, node.text ?? ''), pos);
      if (hit) tr.addMark(hit[0], hit[1], schema.marks.ghost.create());
      else lostGhosts++;
    }
    return true;
  });

  appendToOverflow(tr, notes);
  return { doc: tr.doc, lost, lostGhosts };
}

/**
 * If a group disappears because its text was deleted by ordinary editing,
 * its other variants go to Overflow (nothing is ever lost). Our own commands
 * that remove groups on purpose mark their transactions with `altDeleted`.
 */
export const keepVanishedVariants = new Plugin({
  appendTransaction(trs, oldState, newState) {
    if (!trs.some((tr) => tr.docChanged) || trs.some((tr) => tr.getMeta('altDeleted') || isHistoryTransaction(tr))) return null;
    const now = new Set(allGroupIds(newState.doc));
    const notes: string[] = [];
    for (const id of allGroupIds(oldState.doc)) {
      if (now.has(id)) continue;
      const loc = findGroup(oldState.doc, id);
      if (loc) notes.push(...notesFor(loc));
    }
    if (notes.length === 0) return null;
    return appendToOverflow(newState.tr, notes);
  },
});
