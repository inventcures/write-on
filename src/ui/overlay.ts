import type { EditorView } from 'prosemirror-view';
import { allGroupIds, findGroup, type GroupLocation } from '../core/groups';
import { overflowStart } from '../core/piece';

const SVG = 'http://www.w3.org/2000/svg';
const COLOR = { word: 'var(--word)', sentence: 'var(--sentence)', paragraph: 'var(--paragraph)' } as const;

/** A tiny deterministic random source, so each group's wobble is stable. */
function seeded(id: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** A hand-drawn line from (x0, y0) to (x1, y1): a slight wave and tilt, like a pen. */
function penLine(x0: number, y0: number, x1: number, y1: number, rand: () => number): string {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(2, Math.round(len / 6));
  const phase = rand() * Math.PI * 2;
  const amp = 0.7 + rand() * 0.5;
  const tilt = (rand() - 0.5) * 1.6;
  const nx = -(y1 - y0) / (len || 1);
  const ny = (x1 - x0) / (len || 1);
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const off = Math.sin(phase + t * len * 0.33) * amp + tilt * (t - 0.5) + (rand() - 0.5) * 0.35;
    const x = x0 + (x1 - x0) * t + nx * off;
    const y = y0 + (y1 - y0) * t + ny * off;
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

function el<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function dots(svg: SVGSVGElement, loc: GroupLocation, cx: number, cy: number, dir: 'row' | 'column'): void {
  const n = loc.attrs.variants.length;
  const gap = 8;
  const color = COLOR[loc.attrs.grain];
  for (let i = 0; i < n; i++) {
    const offset = dir === 'row' ? (i - (n - 1) / 2) * gap : i * gap;
    const on = i === loc.attrs.active;
    svg.append(
      el('circle', {
        cx: dir === 'row' ? cx + offset : cx,
        cy: dir === 'row' ? cy : cy + offset,
        r: 2.3,
        fill: on ? color : 'none',
        stroke: color,
        'stroke-width': 1.2,
      }),
    );
  }
}

function lineRects(view: EditorView, from: number, to: number): DOMRect[] {
  const start = view.domAtPos(from);
  const end = view.domAtPos(to);
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  // Merge the rectangles of one visual line into one.
  const lines: DOMRect[] = [];
  for (const r of Array.from(range.getClientRects())) {
    if (r.width === 0) continue;
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.bottom - r.bottom) < 4) {
      const left = Math.min(last.left, r.left);
      const right = Math.max(last.right, r.right);
      lines[lines.length - 1] = new DOMRect(left, Math.min(last.top, r.top), right - left, Math.max(last.bottom, r.bottom) - Math.min(last.top, r.top));
    } else lines.push(r);
  }
  return lines;
}

/** Draw every group's marks: wavy underlines or a margin bar, and one dot per variant. */
export function drawMarks(view: EditorView, svg: SVGSVGElement): void {
  svg.replaceChildren();
  const box = svg.getBoundingClientRect();
  const limit = overflowStart(view.state.doc);
  for (const id of allGroupIds(view.state.doc)) {
    const loc = findGroup(view.state.doc, id);
    if (!loc || loc.from >= limit) continue;
    const rand = seeded(id);
    const color = COLOR[loc.attrs.grain];
    const stroke = { fill: 'none', stroke: color, 'stroke-width': loc.attrs.grain === 'word' ? 1.3 : 1.5, 'stroke-linecap': 'round', opacity: 0.9 };
    if (loc.blockPos !== undefined) {
      const dom = view.nodeDOM(loc.blockPos) as HTMLElement | null;
      if (!dom) continue;
      const r = dom.getBoundingClientRect();
      const x = r.left - box.left - 18;
      svg.append(el('path', { ...stroke, 'stroke-width': 2.4, d: penLine(x, r.top - box.top + 4, x, r.bottom - box.top - 4, rand) }));
      dots(svg, loc, x - 10, r.top - box.top + 8, 'column');
      continue;
    }
    if (loc.to <= loc.from) continue;
    const lines = lineRects(view, loc.from, loc.to);
    const drop = loc.attrs.grain === 'word' ? 2 : 6;
    for (const r of lines) {
      const y = r.bottom - box.top - 3 + drop;
      svg.append(el('path', { ...stroke, d: penLine(r.left - box.left, y, r.right - box.left, y, rand) }));
    }
    const last = lines[lines.length - 1];
    if (!last) continue;
    if (loc.attrs.grain === 'word') dots(svg, loc, (last.left + last.right) / 2 - box.left, last.bottom - box.top + 7, 'row');
    else {
      // Sentence dots sit just past the sentence's end, under its last character.
      const n = loc.attrs.variants.length;
      dots(svg, loc, last.right - box.left - ((n - 1) * 8) / 2, last.bottom - box.top + 9, 'row');
    }
  }
}

/** Rectangles of a group on screen, for the delete explosion. */
export function groupRect(view: EditorView, id: string): DOMRect | null {
  const loc = findGroup(view.state.doc, id);
  if (!loc) return null;
  if (loc.blockPos !== undefined) return (view.nodeDOM(loc.blockPos) as HTMLElement | null)?.getBoundingClientRect() ?? null;
  return lineRects(view, loc.from, loc.to)[0] ?? null;
}
