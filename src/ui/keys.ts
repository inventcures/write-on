/**
 * Keybindings: one table of actions with Write_On's defaults, which the
 * writer can change in the shortcuts sheet. A binding is a combo string such
 * as "Ctrl+Shift+KeyA" (modifiers plus the physical key code).
 */
export type ActionId =
  | 'read'
  | 'alternatives'
  | 'flipNext'
  | 'flipPrev'
  | 'ghost'
  | 'stash'
  | 'overflow'
  | 'use'
  | 'timeline'
  | 'source'
  | 'save'
  | 'open';

export const ACTIONS: { id: ActionId; label: string; combo: string }[] = [
  { id: 'read', label: 'Read mode: tools in or out', combo: 'Ctrl+Shift+KeyR' },
  { id: 'alternatives', label: 'Alternatives for selection or word', combo: 'Ctrl+Shift+KeyA' },
  { id: 'flipNext', label: 'Next alternative of the group at the caret', combo: 'Ctrl+BracketRight' },
  { id: 'flipPrev', label: 'Previous alternative of the group at the caret', combo: 'Ctrl+BracketLeft' },
  { id: 'ghost', label: 'Ghost it / Revive it', combo: 'Ctrl+Slash' },
  { id: 'stash', label: 'Stash in Overflow', combo: 'Ctrl+Shift+KeyX' },
  { id: 'overflow', label: 'Overflow panel', combo: 'Ctrl+Shift+KeyD' },
  { id: 'use', label: 'Use in the page (in Overflow)', combo: 'Ctrl+Enter' },
  { id: 'timeline', label: 'Timeline: replay and revisit every moment', combo: 'Ctrl+Shift+KeyL' },
  { id: 'source', label: 'Source view (the raw file)', combo: 'Ctrl+KeyU' },
  { id: 'save', label: 'Save', combo: 'Ctrl+KeyS' },
  { id: 'open', label: 'Open', combo: 'Ctrl+KeyO' },
];

/** Shortcuts that are part of the editor itself and can't be changed. */
export const FIXED: [string, string][] = [
  ['Flip the hovered group', 'hover + ← →'],
  ['Delete the showing alternative', 'hover + Delete'],
  ['Undo, Redo', 'Ctrl+Z  Ctrl+Shift+Z'],
  ['Bold, Italic', 'Ctrl+B  Ctrl+I'],
  ['Close a panel or sheet', 'Esc'],
];

/** Combos the editor itself owns; binding them would break typing or undo. */
const RESERVED = new Set([
  'Ctrl+KeyZ', 'Ctrl+Shift+KeyZ', 'Ctrl+KeyY', 'Ctrl+KeyB', 'Ctrl+KeyI',
  'Meta+KeyZ', 'Meta+Shift+KeyZ', 'Meta+KeyY', 'Meta+KeyB', 'Meta+KeyI',
  'Ctrl+KeyC', 'Ctrl+KeyV', 'Ctrl+KeyX', 'Ctrl+KeyA',
  'Meta+KeyC', 'Meta+KeyV', 'Meta+KeyX', 'Meta+KeyA',
]);

/** Why `combo` can't be a shortcut, or null if it can. */
export function rejectReason(combo: string): string | null {
  if (!/(^|\+)(Ctrl|Alt|Meta)\+/.test(combo)) return 'A shortcut needs Ctrl, Alt or ⌘, so it never gets in the way of typing.';
  if (RESERVED.has(combo)) return `${pretty(combo)} belongs to the editor (undo, bold, copy and the like).`;
  return null;
}

const STORAGE = 'write-on:keys';
const MODIFIER_CODES = /^(Shift|Control|Alt|Meta)(Left|Right)?$/;

/** The combo for a key event, or null for a bare modifier press. */
export function comboOf(e: KeyboardEvent): string | null {
  if (MODIFIER_CODES.test(e.code) || ['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return null;
  const code = e.code === 'NumpadEnter' ? 'Enter' : e.code || e.key;
  return [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.metaKey && 'Meta', e.shiftKey && 'Shift', code].filter(Boolean).join('+');
}

/** "Ctrl+Shift+KeyA" → "Ctrl+Shift+A", for people. */
export function pretty(combo: string): string {
  return combo
    .split('+')
    .map((p) =>
      p
        .replace(/^Key/, '')
        .replace(/^Digit/, '')
        .replace('BracketLeft', '[')
        .replace('BracketRight', ']')
        .replace('Slash', '/')
        .replace('Enter', 'Return')
        .replace('Meta', '⌘'),
    )
    .join('+');
}

export class Keybindings {
  private custom: Partial<Record<ActionId, string>>;

  constructor() {
    this.custom = {};
    try {
      this.custom = JSON.parse(localStorage.getItem(STORAGE) ?? '{}');
    } catch {
      /* storage blocked: defaults only */
    }
  }

  combo(id: ActionId): string {
    return this.custom[id] ?? ACTIONS.find((a) => a.id === id)!.combo;
  }

  isDefault(id: ActionId): boolean {
    return this.custom[id] === undefined;
  }

  /** The action bound to this event, if any. */
  match(e: KeyboardEvent): ActionId | null {
    const combo = comboOf(e);
    if (!combo) return null;
    return ACTIONS.find((a) => this.combo(a.id) === combo)?.id ?? null;
  }

  /** Bind `combo` to `id`. Returns the action that lost it, if any. */
  set(id: ActionId, combo: string): ActionId | null {
    const loser = ACTIONS.find((a) => a.id !== id && this.combo(a.id) === combo)?.id ?? null;
    if (loser) this.custom[loser] = '';
    const fallback = ACTIONS.find((a) => a.id === id)!.combo;
    if (combo === fallback) delete this.custom[id];
    else this.custom[id] = combo;
    this.persist();
    return loser;
  }

  /** Back to the default. Returns the action that held the default and lost it, if any. */
  reset(id?: ActionId): ActionId | null {
    if (!id) {
      this.custom = {};
      this.persist();
      return null;
    }
    delete this.custom[id];
    const combo = this.combo(id);
    const loser = ACTIONS.find((a) => a.id !== id && this.combo(a.id) === combo)?.id ?? null;
    if (loser) this.custom[loser] = '';
    this.persist();
    return loser;
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(this.custom));
    } catch {
      /* not persisted */
    }
  }
}

/** The shortcuts sheet as a visual editor. `onChange` runs after every change. */
export function keybindingsEditor(keys: Keybindings, onChange: () => void): HTMLElement {
  const wrap = document.createElement('div');
  const note = document.createElement('p');
  note.className = 'keys-note';
  const table = document.createElement('table');
  table.className = 'keys';
  let capturing: { id: ActionId; button: HTMLButtonElement } | null = null;

  const render = () => {
    table.replaceChildren();
    for (const action of ACTIONS) {
      const tr = table.insertRow();
      tr.insertCell().textContent = action.label;
      const cell = tr.insertCell();
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'key-btn';
      const combo = keys.combo(action.id);
      b.textContent = combo ? pretty(combo) : 'not set';
      b.title = 'Click, then press the new keys';
      b.onclick = () => {
        capturing = { id: action.id, button: b };
        b.textContent = 'press keys…';
        b.classList.add('capturing');
        note.textContent = 'Press the new keys, or Esc to cancel.';
      };
      cell.append(b);
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'key-reset';
      reset.textContent = 'reset';
      reset.disabled = keys.isDefault(action.id);
      reset.onclick = () => {
        const loser = keys.reset(action.id);
        note.textContent = `${action.label}: back to ${pretty(keys.combo(action.id))}.` +
          (loser ? ` “${ACTIONS.find((a) => a.id === loser)!.label}” had those keys and is now not set.` : '');
        render();
        onChange();
      };
      cell.append(reset);
    }
    for (const [label, combo] of FIXED) {
      const tr = table.insertRow();
      tr.className = 'fixed';
      tr.insertCell().textContent = label;
      const k = document.createElement('kbd');
      k.textContent = combo;
      tr.insertCell().append(k);
    }
  };

  wrap.addEventListener(
    'keydown',
    (e) => {
      if (!capturing) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        capturing = null;
        note.textContent = '';
        render();
        return;
      }
      const combo = comboOf(e);
      if (!combo) return;
      const why = rejectReason(combo);
      if (why) {
        note.textContent = `${why} Try other keys, or Esc to cancel.`;
        return;
      }
      const { id } = capturing;
      capturing = null;
      const loser = keys.set(id, combo);
      const label = ACTIONS.find((a) => a.id === id)!.label;
      note.textContent = loser
        ? `${label} is now ${pretty(combo)}. “${ACTIONS.find((a) => a.id === loser)!.label}” had those keys and is now not set.`
        : `${label} is now ${pretty(combo)}.`;
      render();
      onChange();
    },
    true,
  );

  const resetAll = document.createElement('button');
  resetAll.type = 'button';
  resetAll.className = 'key-reset-all';
  resetAll.textContent = 'Reset all to defaults';
  resetAll.onclick = () => {
    keys.reset();
    note.textContent = 'All shortcuts are back to their defaults.';
    render();
    onChange();
  };

  render();
  wrap.append(table, note, resetAll);
  return wrap;
}
