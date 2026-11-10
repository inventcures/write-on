/**
 * "Your writing": every moment of every piece on one horizontal line, oldest
 * on the left, with long pauses folded so a year still fits. Under it, the
 * pieces themselves, to open or replay. The account controls live here too.
 */
import { KIND_FAMILY, type EntryKind } from '../core/moments';
import type { Library, Me, PieceActivity, PieceSummary } from './library';
import { clock as mmss, type Recording } from './speech';

export interface WritingHost {
  library(): Library;
  me(): Me;
  currentId(): string;
  open(id: string): Promise<void>;
  replay(id: string, at?: number): Promise<void>;
  signIn(email: string, password: string, create: boolean): Promise<string | null>;
  signOut(): Promise<void>;
  /** Leave for Google's sign-in page; the app comes back signed in. */
  signInWithGoogle(): Promise<void>;
  /** The raw recordings kept with a piece in this browser, newest first. */
  recordings(pieceId: string): Promise<Recording[]>;
  deleteRecording(id: string): Promise<void>;
  /** Copy the pieces kept in this browser into the account. Returns how many. */
  bringBrowserPieces(): Promise<number>;
  browserPiecesNotInAccount(): Promise<number>;
  close(): void;
}

interface Dot {
  x: number;
  t: number;
  kind: string;
  by?: string;
  pieceId: string;
}

const FOLD_MS = 30 * 60 * 1000;
const FOLD_PX = 30;
const FAMILY_NAME: Record<string, string> = {
  writing: 'writing',
  cutting: 'cutting',
  alternatives: 'alternatives',
  ghost: 'ghost',
  overflow: 'Overflow',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function ago(t: number, now = Date.now()): string {
  const s = Math.max(0, (now - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  if (s < 7 * 86_400) return `${Math.round(s / 86_400)} days ago`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const day = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const clock = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/**
 * Lay moments out left to right. Within a sitting, space follows time (a
 * little); a pause longer than half an hour folds into a fixed gap.
 */
export function layout(activity: PieceActivity[], zoom: number): { dots: Dot[]; folds: { x: number; t: number; newDay: boolean }[]; width: number } {
  const all = activity
    .flatMap((a) => a.moments.map(([t, kind, by]) => ({ t, kind, by, pieceId: a.pieceId })))
    .sort((a, b) => a.t - b.t);
  const dots: Dot[] = [];
  const folds: { x: number; t: number; newDay: boolean }[] = [];
  let x = 24;
  let prev: number | null = null;
  for (const m of all) {
    if (prev === null) folds.push({ x: x - 12, t: m.t, newDay: true });
    else {
      const gap = m.t - prev;
      if (gap > FOLD_MS) {
        x += FOLD_PX;
        folds.push({ x: x - FOLD_PX / 2, t: m.t, newDay: day(m.t) !== day(prev) });
      } else x += (2 + Math.min(gap / 1000, 120) / 12) * zoom;
    }
    dots.push({ ...m, x });
    prev = m.t;
  }
  return { dots, folds, width: x + 24 };
}

export class WritingView {
  private root: HTMLElement;
  private stripWrap: HTMLElement;
  private canvas: HTMLCanvasElement;
  private tip: HTMLElement;
  private summary: HTMLElement;
  private account: HTMLElement;
  private list: HTMLElement;
  private pieces: PieceSummary[] = [];
  private activity: PieceActivity[] = [];
  private dots: Dot[] = [];
  private zoom = 1;

  constructor(private host: WritingHost) {
    this.root = el('section', 'yw');
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Your writing');

    const bar = el('header', 'yw-bar');
    const heading = el('div', 'yw-heading');
    heading.append(el('h2', '', 'Your writing'));
    this.summary = el('p', 'yw-summary');
    heading.append(this.summary);
    this.account = el('div', 'yw-account');
    const close = el('button', 'yw-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.onclick = () => host.close();
    bar.append(heading, this.account, close);

    const tools = el('div', 'yw-tools');
    const zoomOut = el('button', '', '−');
    const zoomIn = el('button', '', '+');
    zoomOut.type = zoomIn.type = 'button';
    zoomOut.setAttribute('aria-label', 'Zoom out');
    zoomIn.setAttribute('aria-label', 'Zoom in');
    zoomOut.onclick = () => this.setZoom(this.zoom / 2);
    zoomIn.onclick = () => this.setZoom(this.zoom * 2);
    const legend = el('div', 'yw-legend');
    for (const [cls, label] of [
      ['writing', 'writing'],
      ['cutting', 'cutting'],
      ['alternatives', 'alternatives'],
      ['ghost', 'ghost · Overflow'],
      ['wo', 'WO, your pairing partner'],
    ] as const) {
      const item = el('span', `yw-key yw-${cls}`, label);
      legend.append(item);
    }
    tools.append(legend, el('span', 'yw-zoom-label', 'zoom'), zoomOut, zoomIn);

    this.stripWrap = el('div', 'yw-strip');
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', 'Every moment of your writing, oldest on the left');
    this.stripWrap.append(this.canvas);
    this.tip = el('div', 'yw-tip');
    this.tip.hidden = true;
    this.stripWrap.append(this.tip);
    this.canvas.addEventListener('mousemove', (e) => this.hover(e));
    this.canvas.addEventListener('mouseleave', () => (this.tip.hidden = true));
    this.canvas.addEventListener('click', (e) => {
      const dot = this.dotAt(e);
      if (dot) void host.replay(dot.pieceId, dot.t);
    });
    let pending = false;
    this.stripWrap.addEventListener('scroll', () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        this.draw();
      });
    });
    this.stripWrap.addEventListener(
      'wheel',
      (e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        this.setZoom(this.zoom * (e.deltaY < 0 ? 1.25 : 0.8));
      },
      { passive: false },
    );

    this.list = el('ol', 'yw-pieces');
    this.root.append(bar, tools, this.stripWrap, el('h3', 'yw-sub', 'Pieces'), this.list);
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        host.close();
      }
    });
  }

  open(): void {
    document.body.append(this.root);
    document.body.classList.add('yw-open');
    void this.refresh();
    (this.root.querySelector('.yw-close') as HTMLElement).focus();
  }

  destroy(): void {
    this.root.remove();
    document.body.classList.remove('yw-open');
  }

  async refresh(): Promise<void> {
    this.renderAccount();
    const lib = this.host.library();
    try {
      [this.pieces, this.activity] = await Promise.all([lib.list(), lib.activity()]);
    } catch (err) {
      this.summary.textContent = (err as Error).message;
      return;
    }
    const known = new Set(this.pieces.map((p) => p.id));
    this.activity = this.activity.filter((a) => known.has(a.pieceId));
    const moments = this.activity.reduce((n, a) => n + a.moments.length, 0);
    const where = lib.kind === 'account' ? 'in your account' : 'in this browser';
    this.summary.textContent = `${this.pieces.length} ${this.pieces.length === 1 ? 'piece' : 'pieces'} · ${moments} moments · kept ${where}`;
    // Start zoomed to fit when it all fits; otherwise at the newest end.
    this.zoom = 1;
    const fit = layout(this.activity, 1).width;
    const room = this.stripWrap.clientWidth || 800;
    if (fit < room) this.zoom = Math.min(8, Math.max(1, (room - 48) / Math.max(1, fit - 48)));
    this.draw();
    this.stripWrap.scrollLeft = this.stripWrap.scrollWidth;
    this.renderList();
    void this.renderBring();
  }

  private setZoom(z: number): void {
    const centre = (this.stripWrap.scrollLeft + this.stripWrap.clientWidth / 2) / Math.max(1, this.canvas.clientWidth);
    this.zoom = Math.min(32, Math.max(0.25, z));
    this.draw();
    this.stripWrap.scrollLeft = centre * this.canvas.clientWidth - this.stripWrap.clientWidth / 2;
  }

  private draw(): void {
    const { dots, folds, width } = layout(this.activity, this.zoom);
    this.dots = dots;
    const height = 120;
    const w = Math.max(this.stripWrap.clientWidth || 800, Math.min(Math.ceil(width), 30_000));
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = w * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${height}px`;
    const g = this.canvas.getContext('2d');
    if (!g) return;
    g.scale(dpr, dpr);
    const css = getComputedStyle(this.root);
    const color = (name: string) => css.getPropertyValue(name).trim() || '#f5d1c0';
    const mid = 64;
    g.strokeStyle = color('--panel-line');
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, mid);
    g.lineTo(w, mid);
    g.stroke();
    if (dots.length === 0) {
      g.fillStyle = color('--ink-faint');
      g.font = '13px IBM Plex Mono, monospace';
      g.fillText('Nothing yet. Every moment of your writing will line up here.', 24, mid - 14);
      return;
    }
    // Folded pauses, with the day when it changes.
    g.font = '11px IBM Plex Mono, monospace';
    for (const f of folds) {
      g.fillStyle = color('--ink-faint');
      g.fillRect(f.x, mid - 26, 1, 52);
      if (f.newDay) g.fillText(day(f.t), f.x + 4, height - 8);
    }
    // Each run of one piece gets a thin line above, titled where it starts.
    const titles = new Map(this.pieces.map((p) => [p.id, p.title]));
    const current = this.host.currentId();
    let runStart = 0;
    for (let i = 1; i <= dots.length; i++) {
      if (i < dots.length && dots[i].pieceId === dots[runStart].pieceId) continue;
      const a = dots[runStart];
      const b = dots[i - 1];
      const isCurrent = a.pieceId === current;
      g.fillStyle = isCurrent ? color('--ink') : color('--ink-soft');
      g.globalAlpha = isCurrent ? 0.9 : 0.5;
      g.fillRect(a.x, 22, Math.max(2, b.x - a.x + 2), 1.5);
      g.globalAlpha = isCurrent ? 1 : 0.75;
      // The title sticks to the left edge while its run is scrolled past.
      const label = titles.get(a.pieceId) ?? 'Untitled';
      const lx = Math.max(a.x, Math.min(this.stripWrap.scrollLeft + 6, b.x - 40));
      const room = (dots[i]?.x ?? w) - lx - 8;
      g.font = '12px IBM Plex Mono, monospace';
      if (room > 40) {
        let text = label;
        while (text.length > 3 && g.measureText(text).width > room) text = `${text.slice(0, -2)}…`;
        g.fillText(text, lx, 16);
      }
      g.font = '11px IBM Plex Mono, monospace';
      runStart = i;
    }
    g.globalAlpha = 1;
    const tick = Math.max(1.5, Math.min(4, this.zoom * 1.5));
    for (const d of dots) {
      const family = KIND_FAMILY[d.kind as EntryKind] ?? 'writing';
      const wo = d.by === 'machine';
      g.fillStyle = wo ? color('--machine') : color(`--tl-${family}`);
      g.globalAlpha = family === 'ghost' ? 0.55 : 0.85;
      const h = wo ? 26 : 18;
      g.fillRect(d.x, mid - h / 2, tick, h);
      if (wo) {
        g.beginPath();
        g.arc(d.x + tick / 2, mid - h / 2 - 5, 2.3, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.globalAlpha = 1;
  }

  private dotAt(e: MouseEvent): Dot | null {
    const x = e.offsetX;
    let best: Dot | null = null;
    for (const d of this.dots) if (!best || Math.abs(d.x - x) < Math.abs(best.x - x)) best = d;
    return best && Math.abs(best.x - x) <= 6 ? best : null;
  }

  private hover(e: MouseEvent): void {
    const dot = this.dotAt(e);
    if (!dot) {
      this.tip.hidden = true;
      this.canvas.style.cursor = 'default';
      return;
    }
    this.canvas.style.cursor = 'pointer';
    const title = this.pieces.find((p) => p.id === dot.pieceId)?.title ?? 'Untitled';
    const family = FAMILY_NAME[KIND_FAMILY[dot.kind as EntryKind] ?? 'writing'];
    this.tip.replaceChildren(
      el('strong', '', title),
      el('span', '', `${day(dot.t)}, ${clock(dot.t)} · ${dot.by === 'machine' ? 'WO suggested' : family}`),
      el('em', '', 'click to replay from here'),
    );
    this.tip.hidden = false;
    const left = Math.min(dot.x - this.stripWrap.scrollLeft + 10, this.stripWrap.clientWidth - 220);
    this.tip.style.left = `${Math.max(4, left)}px`;
  }

  private renderList(): void {
    const current = this.host.currentId();
    if (this.pieces.length === 0) {
      this.list.replaceChildren(el('li', 'yw-empty', 'No pieces yet. Close this and start writing; it saves as you go.'));
      return;
    }
    const counts = new Map(this.activity.map((a) => [a.pieceId, a.moments.length]));
    this.list.replaceChildren(
      ...this.pieces.map((p) => {
        const li = el('li', `yw-piece${p.id === current ? ' current' : ''}`);
        const open = el('button', 'yw-title', p.title);
        open.type = 'button';
        open.title = 'Open this piece';
        open.onclick = () => void this.host.open(p.id);
        const meta = el(
          'span',
          'yw-meta',
          `${p.id === current ? 'open now · ' : ''}edited ${ago(p.updated)} · ${p.words} words · ${counts.get(p.id) ?? 0} moments`,
        );
        const replay = el('button', 'yw-act', 'Replay');
        replay.type = 'button';
        replay.onclick = () => void this.host.replay(p.id);
        const del = el('button', 'yw-act yw-del', 'Delete');
        del.type = 'button';
        del.onclick = async () => {
          if (del.dataset.armed !== '1') {
            del.dataset.armed = '1';
            del.textContent = 'Delete for good?';
            setTimeout(() => {
              del.dataset.armed = '';
              del.textContent = 'Delete';
            }, 4000);
            return;
          }
          if (p.id === current) return;
          await this.host.library().remove(p.id);
          void this.refresh();
        };
        if (p.id === current) del.disabled = true;
        const acts = el('span', 'yw-acts');
        acts.append(replay, del);
        li.append(open, meta, acts);
        void this.renderRecordings(li, acts, p.id);
        return li;
      }),
    );
  }

  private renderAccount(message = ''): void {
    const me = this.host.me();
    this.account.replaceChildren();
    if (!me.accounts) {
      this.account.append(el('span', 'yw-where', 'Kept in this browser.'));
      return;
    }
    if (me.user) {
      const out = el('button', 'yw-link', 'Sign out');
      out.type = 'button';
      out.onclick = async () => {
        await this.host.signOut();
        void this.refresh();
      };
      this.account.append(el('span', 'yw-where', me.user.email), out);
      const bring = el('div', 'yw-bring');
      bring.hidden = true;
      this.account.append(bring);
      return;
    }
    const form = el('form', 'yw-signin');
    const email = el('input');
    email.type = 'email';
    email.autocomplete = 'email';
    email.placeholder = 'email';
    email.required = true;
    email.setAttribute('aria-label', 'Email');
    const pass = el('input');
    pass.type = 'password';
    pass.autocomplete = 'current-password';
    pass.placeholder = 'password';
    pass.required = true;
    pass.minLength = 10;
    pass.setAttribute('aria-label', 'Password');
    const signIn = el('button', 'yw-primary', 'Sign in');
    signIn.type = 'submit';
    const create = el('button', 'yw-link', 'Create account');
    create.type = 'button';
    const note = el('p', 'yw-note', message || 'Kept in this browser. Sign in to keep your writing in your account, on any device.');
    const go = async (make: boolean) => {
      if (!email.value || pass.value.length < (make ? 10 : 1)) {
        note.textContent = make ? 'Choose a password of at least 10 characters.' : 'Enter your email and password.';
        return;
      }
      signIn.disabled = create.disabled = true;
      const error = await this.host.signIn(email.value, pass.value, make);
      signIn.disabled = create.disabled = false;
      if (error) {
        note.textContent = error;
        return;
      }
      void this.refresh();
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      void go(false);
    };
    create.onclick = () => {
      pass.autocomplete = 'new-password';
      void go(true);
    };
    form.append(email, pass, signIn, create);
    if (me.google) {
      const g = el('button', 'yw-google', 'Continue with Google');
      g.type = 'button';
      g.title = 'Sign in, or make an account, with your Google account';
      g.onclick = () => {
        g.disabled = true;
        note.textContent = 'Taking you to Google…';
        void this.host.signInWithGoogle();
      };
      const or = el('div', 'yw-or');
      or.append(g, el('span', 'yw-or-word', 'or'));
      this.account.append(or);
    }
    this.account.append(form, note);
  }

  /** "Recordings (n)" under a piece: play, download or delete what was said. */
  private async renderRecordings(li: HTMLElement, acts: HTMLElement, pieceId: string): Promise<void> {
    const recs = await this.host.recordings(pieceId);
    if (!recs.length) return;
    const b = el('button', 'yw-act', `Recordings (${recs.length})`);
    b.type = 'button';
    b.title = 'What you said while writing this piece, kept in this browser';
    acts.prepend(b);
    const box = el('ol', 'yw-recs');
    box.hidden = true;
    b.onclick = () => {
      box.hidden = !box.hidden;
      if (!box.hidden && !box.childElementCount) this.fillRecordings(box, recs, b);
    };
    li.append(box);
  }

  private fillRecordings(box: HTMLElement, recs: Recording[], button: HTMLElement): void {
    for (const r of recs) {
      const item = el('li', 'yw-rec');
      const url = URL.createObjectURL(r.blob);
      const audio = el('audio');
      audio.controls = true;
      audio.preload = 'none';
      audio.src = url;
      const when = new Date(r.t);
      const head = el('span', 'yw-rec-when', `${when.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} · ${mmss(r.ms)}`);
      const save = el('a', 'yw-act', 'Download');
      save.href = url;
      save.download = `recording-${when.toISOString().slice(0, 16).replace(/[:T]/g, '-')}.${r.type.includes('mp4') ? 'm4a' : r.type.includes('ogg') ? 'ogg' : 'webm'}`;
      const del = el('button', 'yw-act yw-del', 'Delete');
      del.type = 'button';
      del.onclick = async () => {
        await this.host.deleteRecording(r.id);
        URL.revokeObjectURL(url);
        item.remove();
        const left = box.childElementCount;
        if (left) button.textContent = `Recordings (${left})`;
        else (box.remove(), button.remove());
      };
      const heard = el('p', 'yw-rec-heard', r.heard ? `“${r.heard}”` : 'Nothing was turned into text.');
      item.append(head, audio, save, del, heard);
      box.append(item);
    }
  }

  private async renderBring(): Promise<void> {
    const box = this.account.querySelector('.yw-bring') as HTMLElement | null;
    if (!box) return;
    const n = await this.host.browserPiecesNotInAccount();
    if (!n) return;
    const b = el('button', 'yw-link', `Bring the ${n} ${n === 1 ? 'piece' : 'pieces'} from this browser into your account`);
    b.type = 'button';
    b.onclick = async () => {
      b.disabled = true;
      const done = await this.host.bringBrowserPieces();
      box.replaceChildren(el('span', 'yw-note', `Brought ${done} into your account. They are still in this browser too.`));
      void this.refresh();
    };
    box.replaceChildren(b);
    box.hidden = false;
  }
}
