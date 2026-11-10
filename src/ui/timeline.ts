import type { Node } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import { describeMoment, type Moment } from '../core/changes';
import { KIND_FAMILY, mapToNow, replay, type PieceHistory } from '../core/history';
import { overflowStart } from '../core/piece';
import { schema } from '../core/schema';

const FAMILY_LABEL = {
  writing: 'Writing (kept)',
  cutting: 'Cutting (rejected)',
  alternatives: 'Alternatives',
  ghost: 'Ghost (undecided)',
  overflow: 'Overflow (undecided)',
} as const;
const SPEEDS = [1, 4, 16];
const PAUSE_GAP_MS = 10 * 60 * 1000;

export interface TimelineHost {
  history(): PieceHistory;
  /** Close the timeline and take the writer to this range in the current piece. */
  editAt(from: number, to: number): void;
  close(): void;
}

/**
 * The timeline: every moment of the piece on one line, left to right. Zoom
 * out to see the whole life of the piece, zoom in to single moments, replay,
 * and jump back into editing from any moment.
 */
export class Timeline {
  private root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private track: HTMLElement;
  private captionEl: HTMLElement;
  private changeEl: HTMLElement;
  private whenEl: HTMLElement;
  private playBtn: HTMLButtonElement;
  private speedBtn: HTMLButtonElement;
  private snapshot: EditorView;
  private docs: Node[] = [];
  private history: PieceHistory;
  private index = 0;
  private zoom = 8;
  private speed = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private moment: Moment | null = null;

  constructor(private host: TimelineHost) {
    this.history = host.history();
    this.root = document.createElement('section');
    this.root.className = 'timeline';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Timeline');

    const bar = document.createElement('div');
    bar.className = 'tl-bar';
    const title = document.createElement('h2');
    title.textContent = 'Timeline';
    const btn = (label: string, aria: string, fn: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.title = aria;
      b.setAttribute('aria-label', aria);
      b.onclick = fn;
      return b;
    };
    this.playBtn = btn('▶ Replay', 'Replay from here (Space)', () => this.togglePlay());
    this.speedBtn = btn('1×', 'Replay speed', () => this.cycleSpeed());
    const controls = document.createElement('div');
    controls.className = 'tl-controls';
    controls.append(
      btn('‹', 'Previous moment (←)', () => this.select(this.index - 1)),
      btn('›', 'Next moment (→)', () => this.select(this.index + 1)),
      this.playBtn,
      this.speedBtn,
      btn('−', 'Zoom out (−)', () => this.setZoom(this.zoom / 1.6)),
      btn('+', 'Zoom in (+)', () => this.setZoom(this.zoom * 1.6)),
      btn('Whole piece', 'Fit the whole history', () => this.fit()),
      btn('Edit here', 'Go to this passage in your piece (Return)', () => this.editHere()),
      btn('✕', 'Back to the piece (Esc)', () => host.close()),
    );
    bar.append(title, controls);

    this.track = document.createElement('div');
    this.track.className = 'tl-track';
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-hidden', 'true');
    this.track.append(this.canvas);
    this.track.addEventListener('click', (e) => {
      const x = e.clientX - this.canvas.getBoundingClientRect().left;
      this.select(Math.floor(x / this.zoom));
    });
    this.track.addEventListener(
      'wheel',
      (e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        this.setZoom(this.zoom * (e.deltaY < 0 ? 1.25 : 0.8));
      },
      { passive: false },
    );

    const legend = document.createElement('div');
    legend.className = 'tl-legend';
    for (const [family, label] of Object.entries(FAMILY_LABEL)) {
      const item = document.createElement('span');
      item.className = `tl-key tl-${family}`;
      item.textContent = label;
      legend.append(item);
    }

    const moment = document.createElement('div');
    moment.className = 'tl-moment';
    this.whenEl = document.createElement('div');
    this.whenEl.className = 'tl-when';
    this.captionEl = document.createElement('div');
    this.captionEl.className = 'tl-caption';
    this.changeEl = document.createElement('div');
    this.changeEl.className = 'tl-change';
    this.changeEl.setAttribute('aria-label', 'What changed');
    moment.append(this.whenEl, this.captionEl, this.changeEl);

    const snap = document.createElement('div');
    snap.className = 'tl-snapshot';
    this.snapshot = new EditorView(snap, {
      state: EditorState.create({ doc: schema.nodes.doc.createAndFill()!, schema }),
      editable: () => false,
      decorations: (state) => this.decorate(state.doc),
    });

    this.root.append(bar, this.track, legend, moment, snap);
    this.root.addEventListener('keydown', (e) => this.onKey(e));
    this.root.tabIndex = -1;
  }

  get element(): HTMLElement {
    return this.root;
  }

  open(): void {
    document.body.append(this.root);
    try {
      this.docs = replay(this.history);
    } catch {
      this.docs = [];
    }
    this.root.focus();
    this.fit();
    this.select(this.history.entries.length - 1);
  }

  destroy(): void {
    clearInterval(this.timer);
    this.snapshot.destroy();
    this.root.remove();
  }

  private get count(): number {
    return this.history.entries.length;
  }

  private fit(): void {
    const width = this.track.clientWidth || innerWidth - 40;
    this.setZoom(this.count ? width / this.count : 8);
  }

  private setZoom(z: number): void {
    const width = this.track.clientWidth || innerWidth - 40;
    const min = this.count ? Math.min(8, width / this.count) : 8;
    this.zoom = Math.max(min, Math.min(80, z));
    this.draw();
    this.scrollToSelected();
  }

  private draw(): void {
    const dpr = devicePixelRatio || 1;
    const height = 46;
    const width = Math.max(this.track.clientWidth, Math.ceil(this.count * this.zoom));
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    const g = this.canvas.getContext('2d');
    if (!g) return;
    g.scale(dpr, dpr);
    const css = getComputedStyle(this.root);
    const color = (family: string) => css.getPropertyValue(`--tl-${family}`).trim() || '#f5d1c0';
    g.strokeStyle = 'rgba(245, 209, 192, 0.18)';
    g.beginPath();
    g.moveTo(0, height / 2);
    g.lineTo(width, height / 2);
    g.stroke();
    const w = Math.max(1, this.zoom - (this.zoom > 4 ? 1.5 : 0));
    this.history.entries.forEach((entry, i) => {
      const family = KIND_FAMILY[entry.kind] ?? 'writing';
      const x = i * this.zoom;
      const selected = i === this.index;
      g.fillStyle = color(family);
      // Second cues besides colour: ghosts are faded, Overflow is striped.
      g.globalAlpha = (selected ? 1 : 0.7) * (family === 'ghost' ? 0.55 : 1);
      const h = selected ? 34 : 22;
      const y = (height - h) / 2;
      g.fillRect(x, y, w, h);
      if (family === 'overflow') {
        g.fillStyle = '#050a1c';
        for (let sy = y + 2; sy < y + h; sy += 5) g.fillRect(x, sy, w, 1.5);
      }
      const prev = this.history.entries[i - 1];
      if (prev && entry.t - prev.t > PAUSE_GAP_MS) {
        g.globalAlpha = 0.5;
        g.fillStyle = '#f5d1c0';
        g.fillRect(x - 1, 4, 1, height - 8);
      }
    });
    g.globalAlpha = 1;
    if (this.count) {
      g.strokeStyle = '#f5d1c0';
      g.lineWidth = 1.5;
      g.strokeRect(this.index * this.zoom - 1.5, 2, w + 3, height - 4);
    }
  }

  private scrollToSelected(): void {
    const x = this.index * this.zoom;
    const view = this.track;
    if (x < view.scrollLeft + 20 || x > view.scrollLeft + view.clientWidth - 40) view.scrollLeft = x - view.clientWidth / 2;
  }

  private select(i: number): void {
    if (!this.count || !this.docs.length) {
      this.captionEl.textContent = 'Nothing here yet. Write something, and every moment will appear on this line.';
      return;
    }
    this.index = Math.max(0, Math.min(this.count - 1, i));
    const entry = this.history.entries[this.index];
    const before = this.docs[this.index];
    const after = this.docs[this.index + 1];
    this.moment = describeMoment(entry.kind, before, after);
    const when = new Date(entry.t);
    this.whenEl.textContent = `Moment ${this.index + 1} of ${this.count} · ${when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
    this.captionEl.textContent = this.moment.caption;
    this.renderChange(this.moment);
    this.snapshot.updateState(EditorState.create({ doc: after, schema }));
    this.draw();
    this.scrollToSelected();
    requestAnimationFrame(() => {
      const mark = this.snapshot.dom.querySelector('.tl-here');
      mark?.scrollIntoView({ block: 'center', behavior: this.speed ? 'auto' : 'smooth' });
    });
  }

  /** Added words highlighted, cut words faded and struck through in place. */
  private renderChange(moment: Moment): void {
    this.changeEl.replaceChildren();
    for (const part of moment.parts) {
      const el = document.createElement(part.type === 'added' ? 'ins' : part.type === 'cut' ? 'del' : 'span');
      el.textContent = part.text;
      if (part.type === 'added') el.title = 'added';
      if (part.type === 'cut') el.title = 'cut';
      this.changeEl.append(el);
    }
    this.changeEl.classList.remove('tl-animate');
    void this.changeEl.offsetWidth;
    this.changeEl.classList.add('tl-animate');
  }

  private decorate(doc: Node): DecorationSet {
    const m = this.moment;
    if (!m || !this.docs.length) return DecorationSet.empty;
    const limit = overflowStart(doc);
    const from = Math.min(m.from, doc.content.size);
    const to = Math.min(Math.max(m.to, from), doc.content.size);
    const decos: Decoration[] = [];
    if (to > from) decos.push(Decoration.inline(from, to, { class: 'tl-here' }));
    else if (from < limit) {
      const marker = document.createElement('span');
      marker.className = 'tl-here tl-cut-point';
      decos.push(Decoration.widget(from, marker));
    }
    doc.forEach((block, pos) => {
      if (pos >= limit) return;
      if (to < pos || from > pos + block.nodeSize) decos.push(Decoration.node(pos, pos + block.nodeSize, { class: 'dim-far' }));
    });
    return DecorationSet.create(doc, decos);
  }

  private togglePlay(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
      this.playBtn.textContent = '▶ Replay';
      return;
    }
    if (this.index >= this.count - 1) this.select(0);
    this.playBtn.textContent = '❚❚ Pause';
    const step = () => {
      if (this.index >= this.count - 1) return this.togglePlay();
      this.select(this.index + 1);
    };
    this.timer = setInterval(step, 900 / SPEEDS[this.speed]);
  }

  private cycleSpeed(): void {
    this.speed = (this.speed + 1) % SPEEDS.length;
    this.speedBtn.textContent = `${SPEEDS[this.speed]}×`;
    if (this.timer) {
      this.togglePlay();
      this.togglePlay();
    }
  }

  private editHere(): void {
    if (!this.moment || !this.count) return;
    const from = mapToNow(this.history, this.index, this.moment.from);
    const to = mapToNow(this.history, this.index, this.moment.to);
    if (from === null) {
      this.captionEl.textContent = 'That passage has since been cut from the piece, so there is nowhere to edit it.';
      return;
    }
    this.host.editAt(from, to ?? from);
  }

  private onKey(e: KeyboardEvent): void {
    const keys: Record<string, () => void> = {
      ArrowLeft: () => this.select(this.index - 1),
      ArrowRight: () => this.select(this.index + 1),
      Home: () => this.select(0),
      End: () => this.select(this.count - 1),
      ' ': () => this.togglePlay(),
      '+': () => this.setZoom(this.zoom * 1.6),
      '=': () => this.setZoom(this.zoom * 1.6),
      '-': () => this.setZoom(this.zoom / 1.6),
      Enter: () => this.editHere(),
      Escape: () => this.host.close(),
    };
    const fn = keys[e.key];
    if (fn && !(e.target instanceof HTMLButtonElement && (e.key === ' ' || e.key === 'Enter'))) {
      e.preventDefault();
      e.stopPropagation();
      fn();
    }
  }
}
