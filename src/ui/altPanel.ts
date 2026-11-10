import type { EditorView } from 'prosemirror-view';
import {
  addMachineVariants,
  addVariant,
  authorsOf,
  createGroup,
  findGroup,
  flipTo,
  setVariantText,
  targetForSelection,
  textVariant,
  variantText,
  type GroupTarget,
} from '../core/groups';
import { wordAt, sentenceRanges } from '../core/text';
import { spokenPunctuation } from '../core/dictation';
import type { Grain } from '../core/schema';
import { lookKey, setLook } from './viewPlugins';
import { accessCode, codeNeeded, contextAround, requestSuggestions, setAccessCode, suggestionsEnabled } from './suggestions';

const GRAINS: Grain[] = ['word', 'sentence', 'paragraph'];
const LABEL: Record<Grain, string> = { word: 'Word', sentence: 'Sentence', paragraph: 'Paragraph' };

/**
 * The alternatives panel: one editable row per variant and an empty row that
 * adds one. It works on a group, or on a target where a group will be made
 * when the first new variant is typed.
 */
export class AltPanel {
  readonly el: HTMLElement;
  private tabs: HTMLElement;
  private rows: HTMLElement;
  private groupId: string | null = null;
  private target: GroupTarget | null = null;
  private onFlip: (id: string, from: number, to: number) => void;
  private ask: HTMLElement;
  private busy = false;

  constructor(
    private view: () => EditorView,
    onFlip: (id: string, from: number, to: number) => void,
  ) {
    this.onFlip = onFlip;
    this.el = document.createElement('section');
    this.el.className = 'panel alt-panel';
    this.el.setAttribute('aria-label', 'Alternatives');
    this.tabs = document.createElement('div');
    this.tabs.className = 'tabs';
    this.rows = document.createElement('div');
    this.rows.className = 'rows';
    const foot = document.createElement('footer');
    foot.textContent = 'return adds · esc closes';
    this.ask = document.createElement('div');
    this.ask.className = 'ask';
    this.ask.hidden = true;
    void suggestionsEnabled().then((on) => {
      this.ask.hidden = !on;
      this.renderAsk('');
    });
    this.el.append(this.tabs, this.rows, this.ask, foot);
    this.el.addEventListener('keydown', (e) => this.onKey(e));
  }

  get isOpen(): boolean {
    return this.el.classList.contains('open');
  }

  /** Open on the group at the selection, or on what a new group would cover. */
  openForSelection(groupId: string | null): boolean {
    const state = this.view().state;
    this.groupId = groupId;
    this.target = groupId ? null : targetForSelection(state);
    if (!this.groupId && !this.target) return false;
    this.el.classList.add('open');
    document.body.classList.add('alt-open');
    this.render(true);
    return true;
  }

  close(): void {
    if (!this.isOpen) return;
    this.el.classList.remove('open');
    document.body.classList.remove('alt-open');
    this.groupId = null;
    this.target = null;
    setLook(this.view(), { focus: null });
    this.view().focus();
  }

  /** Keep the panel in step with the document (called after every transaction). */
  sync(mapping?: { map(pos: number, assoc?: number): number }): void {
    if (!this.isOpen) return;
    if (this.target && mapping) {
      this.target = { ...this.target, from: mapping.map(this.target.from, -1), to: mapping.map(this.target.to, 1) };
    }
    if (this.groupId && !findGroup(this.view().state.doc, this.groupId)) {
      this.close();
      return;
    }
    this.render(false);
  }

  private grain(): Grain {
    if (this.groupId) return findGroup(this.view().state.doc, this.groupId)!.attrs.grain;
    return this.target!.grain;
  }

  private focusRange(): { from: number; to: number } {
    if (this.groupId) {
      const loc = findGroup(this.view().state.doc, this.groupId)!;
      return { from: loc.from, to: loc.to };
    }
    return { from: this.target!.from, to: this.target!.to };
  }

  /** Before a group exists, a tab changes what it will cover. */
  private retarget(grain: Grain): void {
    if (this.groupId || !this.target) return;
    const $pos = this.view().state.doc.resolve(this.target.from);
    const text = $pos.parent.textContent;
    const start = $pos.start();
    const offset = this.target.from - start;
    let range: [number, number] | null = null;
    if (grain === 'paragraph') range = [0, text.length];
    if (grain === 'sentence') range = sentenceRanges(text).find(([s, e]) => s <= offset && offset <= e) ?? null;
    if (grain === 'word') range = wordAt(text, offset);
    if (!range) return;
    this.target = { grain, from: start + range[0], to: start + range[1] };
    this.render(true);
  }

  private render(focusNew: boolean): void {
    const view = this.view();
    const grain = this.grain();
    const range = this.focusRange();
    const current = lookKey.getState(view.state)?.focus;
    if (!current || current.from !== range.from || current.to !== range.to) setLook(view, { focus: range });

    this.tabs.replaceChildren(
      ...GRAINS.map((g) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = LABEL[g];
        b.className = g === grain ? `on grain-${g}` : '';
        b.disabled = !!this.groupId && g !== grain;
        b.onclick = () => this.retarget(g);
        return b;
      }),
    );

    const loc = this.groupId ? findGroup(view.state.doc, this.groupId) : null;
    const texts = loc ? loc.attrs.variants.map(variantText) : [view.state.doc.textBetween(range.from, range.to)];
    const active = loc ? loc.attrs.active : 0;
    const authors = loc ? authorsOf(loc.attrs) : [null];
    const focused = document.activeElement as HTMLTextAreaElement | null;
    const existing = Array.from(this.rows.querySelectorAll('textarea'));

    // Rebuild only when the number of rows changed; otherwise update values in place.
    if (existing.length !== texts.length + 1) {
      const keep = focused && this.rows.contains(focused) ? { index: Number(focused.dataset.index), caret: focused.selectionStart } : null;
      this.rows.replaceChildren(...texts.map((t, i) => this.row(t, i, i === active, grain, authors[i])), this.row('', texts.length, false, grain, null));
      if (keep && !focusNew) {
        const area = this.rows.querySelectorAll('textarea')[keep.index];
        area?.focus();
        area?.setSelectionRange(keep.caret, keep.caret);
      }
    } else {
      existing.forEach((area, i) => {
        const wanted = i < texts.length ? texts[i] : '';
        if (area !== focused && area.value !== wanted) area.value = wanted;
        const row = area.closest('.row')!;
        row.classList.toggle('on', i === active);
        this.markAuthor(row as HTMLElement, i < texts.length ? authors[i] : null);
        autosize(area);
      });
    }
    if (focusNew) (this.rows.lastElementChild?.querySelector('textarea') as HTMLTextAreaElement | null)?.focus();
  }

  private row(text: string, index: number, on: boolean, grain: Grain, author: string | null): HTMLElement {
    const row = document.createElement('div');
    row.className = `row grain-${grain}${on ? ' on' : ''}`;
    this.markAuthor(row, author);
    const dot = document.createElement('span');
    dot.className = 'dot';
    const area = document.createElement('textarea');
    area.rows = 1;
    area.value = text;
    area.spellcheck = true;
    area.dataset.index = String(index);
    if (!text) area.placeholder = index === 0 ? '' : 'another way to say it…';
    area.addEventListener('input', () => this.onInput(area));
    area.addEventListener('focus', () => this.onFocusRow(index));
    row.append(dot, area);
    queueMicrotask(() => autosize(area));
    return row;
  }

  /** Machine rows are blue and say so in words, so colour is never the only cue. */
  private markAuthor(row: HTMLElement, author: string | null): void {
    row.classList.toggle('machine', author !== null);
    const label = author === 'machine' ? 'suggested' : author === 'machine-edited' ? 'suggested, edited by you' : '';
    if (label) row.dataset.by = label;
    else delete row.dataset.by;
  }

  private renderAsk(message: string): void {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ask-btn';
    button.textContent = this.busy ? 'asking…' : '✦ suggest 3';
    button.disabled = this.busy;
    button.title = 'Ask for three other ways to say this. They go under yours; your text stays until you pick one.';
    button.onclick = () => void this.suggest();
    const note = document.createElement('p');
    note.className = 'ask-note';
    note.textContent = message;
    this.ask.replaceChildren(button, note);
  }

  private askForCode(message: string): void {
    const form = document.createElement('form');
    form.className = 'ask-code';
    const input = document.createElement('input');
    input.type = 'password';
    input.placeholder = 'access code';
    input.setAttribute('aria-label', 'Access code for suggestions');
    const go = document.createElement('button');
    go.type = 'submit';
    go.textContent = 'ok';
    form.append(input, go);
    form.onsubmit = (e) => {
      e.preventDefault();
      setAccessCode(input.value.trim());
      this.renderAsk('');
      void this.suggest();
    };
    const note = document.createElement('p');
    note.className = 'ask-note';
    note.textContent = message;
    this.ask.replaceChildren(form, note);
    input.focus();
  }

  /** Ask the server for three alternatives and add them, unshown, under the writer's text. */
  async suggest(): Promise<void> {
    if (this.busy || this.ask.hidden || !this.isOpen) return;
    if (!accessCode() && (await codeNeeded())) return this.askForCode('Suggestions on this site need the access code.');
    const view = this.view();
    const grain = this.grain();
    const { from, to } = this.groupId ? findGroup(view.state.doc, this.groupId)! : this.target!;
    const text = view.state.doc.textBetween(from, to, ' ');
    const { before, after } = contextAround(view.state.doc, from, to);
    this.busy = true;
    this.renderAsk('');
    const result = await requestSuggestions(text, grain, before, after);
    this.busy = false;
    if (!result.ok) {
      if (result.status === 401) {
        setAccessCode('');
        return this.askForCode(result.error);
      }
      return this.renderAsk(result.error);
    }
    if (!this.isOpen) return this.renderAsk('');
    const now = this.view();
    const where = this.groupId ?? this.target;
    if (!where) return this.renderAsk('');
    // Focus must not land on a row: focusing a row flips to it, and a
    // suggestion must never reach the page without the writer's choice.
    if (this.rows.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    let made: string | null = null;
    const added = addMachineVariants(where, result.alternatives)(now.state, (tr) => {
      made = tr.getMeta('altCreated') as string;
      now.dispatch(tr);
    });
    if (made) {
      this.groupId = made;
      this.target = null;
      this.render(false);
    }
    this.renderAsk(added ? 'Added in blue under yours. Flip to try one; yours stays until you do.' : 'Nothing new came back.');
    this.ask.querySelector('button')?.focus();
  }

  /** A spoken alternative: it goes in the empty last row, as if typed there. */
  addSpoken(text: string): void {
    if (!this.isOpen || !text.trim()) return;
    if (this.rows.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    const areas = this.rows.querySelectorAll('textarea');
    const last = areas[areas.length - 1] as HTMLTextAreaElement | undefined;
    if (!last) return;
    // A word goes in as said; a sentence or paragraph gets its punctuation and capital.
    const said = this.grain() === 'word' ? text.trim().replace(/[.?!,]$/, '') : spokenPunctuation(text).replace(/\n+/g, ' ');
    last.value = this.grain() === 'word' ? said : said.charAt(0).toUpperCase() + said.slice(1);
    this.onInput(last);
    this.render(false);
  }

  private onFocusRow(index: number): void {
    if (!this.groupId) return;
    const view = this.view();
    const loc = findGroup(view.state.doc, this.groupId);
    if (!loc || index >= loc.attrs.variants.length || index === loc.attrs.active) return;
    const from = loc.attrs.active;
    if (flipTo(this.groupId, index)(view.state, view.dispatch)) this.onFlip(this.groupId, from, index);
  }

  private onInput(area: HTMLTextAreaElement): void {
    autosize(area);
    const view = this.view();
    const index = Number(area.dataset.index);
    const value = area.value.replace(/\n/g, ' ');
    if (!this.groupId) {
      if (index === 0 || !value || !this.target) return;
      let created: string | null = null;
      createGroup(this.target, textVariant(value))(view.state, (tr) => {
        created = tr.getMeta('altCreated') as string;
        view.dispatch(tr);
      });
      if (created) {
        this.groupId = created;
        this.target = null;
      }
      return;
    }
    const loc = findGroup(view.state.doc, this.groupId);
    if (!loc) return;
    if (index >= loc.attrs.variants.length) {
      if (value) addVariant(this.groupId, textVariant(value))(view.state, view.dispatch);
      return;
    }
    setVariantText(this.groupId, index, value)(view.state, view.dispatch);
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    } else if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
      e.preventDefault();
      const areas = Array.from(this.rows.querySelectorAll('textarea'));
      areas[areas.length - 1]?.focus();
    }
  }
}

function autosize(area: HTMLTextAreaElement): void {
  area.style.height = 'auto';
  area.style.height = `${area.scrollHeight}px`;
}
