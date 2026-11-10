import type { EditorView } from 'prosemirror-view';
import {
  addVariant,
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
import type { Grain } from '../core/schema';
import { lookKey, setLook } from './viewPlugins';

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
    this.el.append(this.tabs, this.rows, foot);
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
    const focused = document.activeElement as HTMLTextAreaElement | null;
    const existing = Array.from(this.rows.querySelectorAll('textarea'));

    // Rebuild only when the number of rows changed; otherwise update values in place.
    if (existing.length !== texts.length + 1) {
      const keep = focused && this.rows.contains(focused) ? { index: Number(focused.dataset.index), caret: focused.selectionStart } : null;
      this.rows.replaceChildren(...texts.map((t, i) => this.row(t, i, i === active, grain)), this.row('', texts.length, false, grain));
      if (keep && !focusNew) {
        const area = this.rows.querySelectorAll('textarea')[keep.index];
        area?.focus();
        area?.setSelectionRange(keep.caret, keep.caret);
      }
    } else {
      existing.forEach((area, i) => {
        const wanted = i < texts.length ? texts[i] : '';
        if (area !== focused && area.value !== wanted) area.value = wanted;
        area.closest('.row')!.classList.toggle('on', i === active);
        autosize(area);
      });
    }
    if (focusNew) (this.rows.lastElementChild?.querySelector('textarea') as HTMLTextAreaElement | null)?.focus();
  }

  private row(text: string, index: number, on: boolean, grain: Grain): HTMLElement {
    const row = document.createElement('div');
    row.className = `row grain-${grain}${on ? ' on' : ''}`;
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
