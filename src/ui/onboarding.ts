/**
 * The first visit: a welcome card that says what Write_On is and a short tour
 * that waits for the writer to try each idea once. Shown once per browser;
 * the ? button brings it back.
 */
import type { EditEvent } from '../core/piece';

const SEEN = 'write-on:welcomed';
/** Drop the explainer at public/explainer.mp4 (with explainer.jpg poster and explainer.vtt captions) and the welcome card shows it. */
export const EXPLAINER_URL = '/explainer.mp4';

export function hasBeenWelcomed(): boolean {
  try {
    return localStorage.getItem(SEEN) === '1';
  } catch {
    return false;
  }
}

function markWelcomed(): void {
  try {
    localStorage.setItem(SEEN, '1');
  } catch {
    /* shown again next time */
  }
}

/** What the tour waits for at each step. */
export type TourSignal = EditEvent['kind'] | 'timeline-opened' | 'panel-opened';

interface Step {
  title: string;
  text: string;
  done: TourSignal[];
  /** A selector for what to point at while this step shows. */
  point?: string;
}

const STEPS: Step[] = [
  {
    title: 'Flip between alternatives',
    text: 'Underlined words already hold other ways to say them. Hover “sketch” and press → or ←. Each dot under it is one alternative.',
    done: ['flipped'],
    point: '.alt[data-alt]',
  },
  {
    title: 'Give a word an alternative',
    text: 'Click any word, then press Ctrl+Shift+A or the Alternatives button below. Type another way to say it. Your first version is kept.',
    done: ['variant-added'],
    point: '[data-tour="alternatives"]',
  },
  {
    title: 'Ghost what you are unsure of',
    text: 'Select a sentence you are not sure about and press Ctrl+/ or Ghost. It fades but stays, so you can read around it. Do it again to bring it back.',
    done: ['ghosted'],
    point: '[data-tour="ghost"]',
  },
  {
    title: 'Stash it in Overflow',
    text: 'Select a line you like but can’t use here, and press Ctrl+Shift+X or Stash. It waits in Overflow (XYZ, bottom right) until you want it back.',
    done: ['stashed'],
    point: '[data-tour="stash"]',
  },
  {
    title: 'Replay how it was written',
    text: 'Open the Timeline to see every moment of this piece, left to right, and replay it. Esc closes it.',
    done: ['timeline-opened'],
    point: '[data-tour="timeline"]',
  },
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = cls;
  if (text) node.textContent = text;
  return node;
}

export class Onboarding {
  private welcome: HTMLElement | null = null;
  private card: HTMLElement | null = null;
  private step = -1;

  constructor(
    private root: HTMLElement,
    private hooks: { showTools(): void; focusEditor(): void },
  ) {}

  get touring(): boolean {
    return this.step >= 0;
  }

  get welcoming(): boolean {
    return this.welcome !== null;
  }

  /** The welcome card: what this is, the three ideas, the video if there is one. */
  showWelcome(): void {
    this.closeWelcome();
    const backdrop = el('div', 'welcome-backdrop');
    const box = el('section', 'welcome');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Welcome to Write_On');
    const h = el('h1', 'welcome-title', 'Write_On');
    const lede = el(
      'p',
      'welcome-lede',
      'An editor for thinking on the page. Instead of deleting your first try, keep it: any word, sentence or paragraph can hold other ways of saying it, and you flip between them in place until one sounds like you.',
    );
    // tp53: a pairing partner for writing, as in pair programming. Kept to two lines.
    const pair = el('p', 'welcome-pair');
    const link = document.createElement('a');
    link.href = 'https://martinfowler.com/articles/on-pair-programming.html';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'pair programming';
    pair.append(
      'A pairing partner for your writing, as in ',
      link,
      ': you drive, Write_On navigates. It keeps you on track without getting in the way, helps when you ask, then steps back. A pairing writer, not a ghostwriter.',
    );
    const video = el('div', 'welcome-video');
    video.hidden = true;
    void fetch(EXPLAINER_URL, { method: 'HEAD' })
      .then((r) => {
        if (!r.ok || !(r.headers.get('content-type') ?? '').startsWith('video/')) return;
        const v = document.createElement('video');
        v.src = EXPLAINER_URL;
        v.controls = true;
        v.preload = 'metadata';
        v.poster = EXPLAINER_URL.replace(/\.mp4$/, '.jpg');
        const captions = document.createElement('track');
        captions.kind = 'captions';
        captions.srclang = 'en';
        captions.label = 'English';
        captions.src = EXPLAINER_URL.replace(/\.mp4$/, '.vtt');
        v.append(captions);
        v.setAttribute('aria-label', 'Explainer video');
        video.append(v);
        video.hidden = false;
      })
      .catch(() => undefined);

    const ideas = el('ul', 'welcome-ideas');
    const idea = (cls: string, name: string, what: string, keys: string) => {
      const li = el('li', `idea ${cls}`);
      li.append(el('strong', '', name), el('span', '', what), el('kbd', '', keys));
      return li;
    };
    ideas.append(
      idea('idea-alt', 'Alternatives', 'Keep several ways to say a word, sentence or paragraph. Flip in place.', 'Ctrl+Shift+A'),
      idea('idea-ghost', 'Ghost', 'Fade text you are unsure of instead of cutting it. Read around it; Export leaves it out.', 'Ctrl+/'),
      idea('idea-overflow', 'Overflow', 'A drawer beside the page for lines you love but can’t use here yet.', 'Ctrl+Shift+X'),
    );

    const actions = el('div', 'welcome-actions');
    const tour = el('button', 'welcome-primary', 'Show me how (1 minute)');
    tour.type = 'button';
    tour.onclick = () => {
      this.closeWelcome();
      this.startTour();
    };
    const write = el('button', 'welcome-secondary', 'Just let me write');
    write.type = 'button';
    write.onclick = () => this.closeWelcome();
    actions.append(tour, write);
    const fine = el('p', 'welcome-fine', 'Everything you write stays in this browser. Press ? at the top right to see this again.');

    box.append(h, lede, pair, video, ideas, actions, fine);
    backdrop.append(box);
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) this.closeWelcome();
    });
    this.root.append(backdrop);
    this.welcome = backdrop;
    markWelcomed();
    tour.focus();
  }

  closeWelcome(): void {
    if (!this.welcome) return;
    this.welcome.remove();
    this.welcome = null;
    this.hooks.showTools();
    if (!this.touring) this.hooks.focusEditor();
  }

  startTour(): void {
    this.hooks.showTools();
    this.go(0);
  }

  endTour(): void {
    this.step = -1;
    this.card?.remove();
    this.card = null;
    this.point(null);
    this.hooks.focusEditor();
  }

  /** Something happened in the editor; move on if it is what this step waits for. */
  signal(kinds: TourSignal[]): void {
    if (!this.touring || this.step >= STEPS.length) return;
    if (kinds.some((k) => STEPS[this.step].done.includes(k))) {
      this.card?.classList.add('done');
      const at = this.step;
      setTimeout(() => {
        if (this.step === at) this.go(at + 1);
      }, 700);
    }
  }

  private go(index: number): void {
    this.step = index;
    this.card?.remove();
    const card = el('aside', 'tour');
    card.setAttribute('role', 'status');
    card.setAttribute('aria-live', 'polite');
    const finished = index >= STEPS.length;
    const head = el('div', 'tour-head');
    head.append(
      el('span', 'tour-count', finished ? 'done' : `${index + 1} of ${STEPS.length}`),
      el('strong', 'tour-title', finished ? 'That’s the whole idea' : STEPS[index].title),
    );
    const text = el(
      'p',
      'tour-text',
      finished
        ? 'Write over the sample or press New for a blank piece. Ctrl+Shift+R hides the tools when you just want to read; ? brings the tour back.'
        : STEPS[index].text,
    );
    const nav = el('div', 'tour-nav');
    const next = el('button', 'tour-next', finished ? 'Start writing' : 'Next');
    next.type = 'button';
    next.onmousedown = (e) => e.preventDefault();
    next.onclick = () => (finished ? this.endTour() : this.go(index + 1));
    nav.append(next);
    if (!finished) {
      const skip = el('button', 'tour-skip', 'Skip the tour');
      skip.type = 'button';
      skip.onmousedown = (e) => e.preventDefault();
      skip.onclick = () => this.endTour();
      nav.prepend(skip);
    }
    const dots = el('div', 'tour-dots');
    STEPS.forEach((_, i) => dots.append(el('span', i < index ? 'on' : i === index ? 'now' : '')));
    card.append(head, text, dots, nav);
    this.root.append(card);
    this.card = card;
    this.point(finished ? null : (STEPS[index].point ?? null));
  }

  private point(selector: string | null): void {
    document.querySelectorAll('.tour-pulse').forEach((n) => n.classList.remove('tour-pulse'));
    if (selector) document.querySelector(selector)?.classList.add('tour-pulse');
  }
}
