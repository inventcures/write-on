import { baseKeymap } from 'prosemirror-commands';
import { redo, undo } from 'prosemirror-history';
import { InputRule, inputRules } from 'prosemirror-inputrules';
import { keymap } from 'prosemirror-keymap';
import type { Node } from 'prosemirror-model';
import { Plugin, TextSelection, type Command } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { toggleMark, setBlockType } from 'prosemirror-commands';
import { createEditorState } from '../core/editor';
import { ghostRunAt, toggleGhost } from '../core/ghost';
import { deleteActiveVariant, findGroup, flip, groupAt } from '../core/groups';
import { stash, useFromOverflow } from '../core/overflow';
import { countPiece, eventsOf, isInOverflow, newId } from '../core/piece';
import { exportMarkdown, fromPieceFile, toPieceFile } from '../core/pieceFile';
import { schema } from '../core/schema';
import { samplePiece } from '../sample';
import { AltPanel } from './altPanel';
import { readEvents, toJsonLines } from './eventLog';
import { AccountLibrary, api, ApiError, BrowserLibrary, titleOf, whoAmI, type Library, type Me } from './library';
import { WritingView } from './writing';
import { record, replay, startTimeline, type PieceTimeline } from '../core/moments';
import { Timeline } from './timeline';
import { explode } from './explode';
import * as files from './files';
import { Keybindings, keybindingsEditor, pretty, type ActionId } from './keys';
import { colourKey } from './colours';
import { hasBeenWelcomed, Onboarding, type TourSignal } from './onboarding';
import { suggestionsEnabled } from './suggestions';
import { closeMenu, closeSheet, isSheetOpen, notify, showMenu, showSheet } from './menus';
import { drawMarks, groupRect } from './overlay';
import { isMuted, setMuted, tick } from './sound';
import { look, lookKey, OverflowView, pasteFreshIds, setLook } from './viewPlugins';


const markdownRules = inputRules({
  rules: [
    new InputRule(/^(#{1,3})\s$/, (state, match, start, end) => {
      const $start = state.doc.resolve(start);
      if (isInOverflow(state.doc, start) || !$start.node(-1).canReplaceWith($start.index(-1), $start.indexAfter(-1), schema.nodes.heading)) return null;
      return state.tr.delete(start, end).setBlockType(start, start, schema.nodes.heading, { level: match[1].length });
    }),
    new InputRule(/\*\*([^*]+)\*\*$/, (state, match, start, end) =>
      state.tr.replaceWith(start, end, schema.text(match[1], [schema.marks.strong.create()])).removeStoredMark(schema.marks.strong),
    ),
    new InputRule(/(?<![*\w])\*([^*\s][^*]*)\*$/, (state, match, start, end) =>
      state.tr.replaceWith(start, end, schema.text(match[1], [schema.marks.em.create()])).removeStoredMark(schema.marks.em),
    ),
  ],
});

/** Arrow keys belong to the pointer while it was the last thing used over a group. */
type InputMode = 'pointer' | 'caret';

export function startApp(root: HTMLElement): void {
  const body = document.body;
  let pieceName = 'piece.md';
  let mode: InputMode = 'caret';
  let flipSession: { id: string; original: number } | null = null;
  let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
  let pieceTimeline: PieceTimeline;
  let historyTimer: ReturnType<typeof setTimeout> | undefined;
  let timeline: Timeline | null = null;
  let writing: WritingView | null = null;
  const browserLibrary = new BrowserLibrary();
  let library: Library = browserLibrary;
  let me: Me = { accounts: false, user: null };
  let libraryTimer: ReturnType<typeof setTimeout> | undefined;
  let saveWarned = false;

  // Layout.
  const page = document.createElement('main');
  page.className = 'page';
  const column = document.createElement('div');
  column.className = 'column';
  const marks = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  marks.classList.add('marks');
  marks.setAttribute('aria-hidden', 'true');
  const host = document.createElement('div');
  column.append(host, marks);
  page.append(column);
  const fadeTop = document.createElement('div');
  fadeTop.className = 'fade top';
  const fadeBottom = document.createElement('div');
  fadeBottom.className = 'fade bottom';

  const keys = new Keybindings();
  const titled: [HTMLElement, ActionId, string][] = [];
  const tour = (b: HTMLButtonElement, name: string) => {
    b.dataset.tour = name;
    return b;
  };
  const button = (label: string, title: string, onClick: () => void, cls = 'tool', action?: ActionId) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.textContent = label;
    b.title = action ? `${title} (${pretty(keys.combo(action))})` : title;
    b.setAttribute('aria-label', title);
    b.onclick = onClick;
    if (action) titled.push([b, action, title]);
    return b;
  };

  const count = button('', 'Read mode: tools in or out', () => toggleRead(), 'count', 'read');
  const writingBtn = button('Your writing', 'Your writing: every piece and every moment, on one line', () => void openWriting(), 'tool writing-btn', 'writing');
  const marksToggle = button('⋯', 'Show or hide alternative marks', () => {
    body.classList.toggle('marks-off');
    marksToggle.setAttribute('aria-pressed', String(!body.classList.contains('marks-off')));
  });
  marksToggle.setAttribute('aria-pressed', 'true');
  const sourceBtn = button('M↓', 'Source view', () => showSource(), 'tool', 'source');
  const soundBtn = button(isMuted() ? '♪̸' : '♪', 'Sound on or off', () => {
    setMuted(!isMuted());
    soundBtn.textContent = isMuted() ? '♪̸' : '♪';
  });
  const keysBtn = button('⌨', 'Shortcuts and colours: change your keys here', () => showShortcuts());
  const helpBtn = button('?', 'Welcome and tour: what this is and how to use it', () => onboarding.showWelcome(), 'help');
  const top = document.createElement('header');
  top.className = 'chrome top';
  const center = document.createElement('div');
  center.className = 'group';
  center.append(marksToggle, sourceBtn);
  const right = document.createElement('div');
  right.className = 'group';
  right.append(soundBtn, keysBtn, helpBtn);
  const leftTop = document.createElement('div');
  leftTop.className = 'group';
  leftTop.append(count, writingBtn);
  top.append(leftTop, center, right);

  const bottom = document.createElement('footer');
  bottom.className = 'chrome bottom';
  const left = document.createElement('div');
  left.className = 'group';
  left.append(
    button('Save', 'Save', () => void saveFile(), 'tool', 'save'),
    button('Open', 'Open', () => void openFile(), 'tool', 'open'),
    button('New', 'New piece', () => newPiece()),
    button('Export', 'Export clean Markdown: no ghosts, no Overflow', () => exportClean()),
    tour(button('Timeline', 'Timeline: replay and revisit every moment', () => openTimeline(), 'tool', 'timeline'), 'timeline'),
    button('Log', 'Export the event log of your choices', () => void exportLog()),
  );
  // The editing actions, as buttons too, so they can be found without knowing a
  // shortcut. Pressing one must not take the selection away from the page.
  const actions = document.createElement('div');
  actions.className = 'group actions';
  const suggestBtn = tour(button('✦ Suggest', 'Suggest 3 alternatives (machine, shown in blue)', () => suggestNow(), 'tool act machine-act', 'suggest'), 'suggest');
  suggestBtn.hidden = true;
  void suggestionsEnabled().then((on) => (suggestBtn.hidden = !on));
  actions.append(
    tour(button('Alternatives', 'Alternatives for the word at the caret, or the selected sentence or paragraph', () => openAlternatives(), 'tool act', 'alternatives'), 'alternatives'),
    suggestBtn,
    tour(button('Ghost', 'Ghost it / revive it', () => ghost(), 'tool act', 'ghost'), 'ghost'),
    tour(button('Stash', 'Stash the selection in Overflow', () => doStash(), 'tool act', 'stash'), 'stash'),
  );
  for (const b of actions.querySelectorAll('button')) b.addEventListener('mousedown', (e) => e.preventDefault());
  const xyz = button('XYZ', 'Overflow', () => toggleOverflow(), 'tool xyz', 'overflow');
  bottom.append(left, actions, xyz);

  root.append(page, fadeTop, fadeBottom, top, bottom);
  const onboarding = new Onboarding(root, {
    showTools: () => {
      if (body.classList.contains('read')) toggleRead();
    },
    focusEditor: () => view.focus(),
  });

  // Editor.
  const restored = files.restore();
  let initial: Node;
  if (restored) {
    const loaded = fromPieceFile(restored.text);
    initial = loaded.doc;
    pieceName = restored.name;
  } else initial = samplePiece();

  let startDoc: Node;
  /** Settles once we know whether the writer is signed in and their piece is attached. */
  let ready: Promise<void> = Promise.resolve();
  const panel = new AltPanel(() => view, onFlipped);
  root.append(panel.el);

  const editorKeys = keymap({
    'Mod-z': undo,
    'Shift-Mod-z': redo,
    'Mod-y': redo,
    'Mod-b': toggleMark(schema.marks.strong),
    'Mod-i': toggleMark(schema.marks.em),
    'Shift-Ctrl-0': setBlockType(schema.nodes.paragraph),
  });

  let editorShortcuts: (e: KeyboardEvent) => boolean = () => false;
  const shortcutPlugin = new Plugin({ props: { handleKeyDown: (_view, e) => editorShortcuts(e) } });

  const view: EditorView = new EditorView(host, {
    state: createEditorState(withId(initial), [shortcutPlugin, markdownRules, editorKeys, keymap(baseKeymap), look, pasteFreshIds]),
    nodeViews: { overflow: () => new OverflowView() },
    attributes: { spellcheck: 'true', 'aria-label': 'Your piece' },
    dispatchTransaction(tr) {
      const before = view.state;
      view.updateState(view.state.apply(tr));
      if (tr.docChanged) {
        scheduleAutosave();
        panel.sync(tr.mapping);
      } else if (tr.getMeta(lookKey) === undefined) panel.sync();
      if (tr.docChanged) {
        pieceTimeline = record(pieceTimeline, tr);
        clearTimeout(historyTimer);
        historyTimer = setTimeout(() => void library.saveTimeline(pieceTimeline), library.kind === 'account' ? 4000 : 500);
      }
      const events = eventsOf(tr);
      // A drag out of Overflow onto the page is a Use, like Ctrl+Enter.
      const sel = before.selection;
      if (tr.getMeta('uiEvent') === 'drop' && !sel.empty && isInOverflow(before.doc, sel.from) && !isInOverflow(view.state.doc, view.state.selection.from))
        events.push({ kind: 'used', text: before.doc.textBetween(sel.from, sel.to, ' ') });
      if (events.length) onboarding.signal(events.map((ev) => ev.kind));
      if (events.length) void library.logEvents(view.state.doc.attrs.id as string, events);
      if (tr.docChanged || before.doc !== view.state.doc) updateCount();
      requestAnimationFrame(redraw);
    },
  });

  /** Continue the stored pieceTimeline if it still replays to this piece; otherwise start a new one. */
  async function attachTimeline(doc: Node): Promise<void> {
    pieceTimeline = startTimeline(doc);
    const stored = await library.loadTimeline(String(doc.attrs.id));
    // Edits made while the stored timeline was loading start from `doc`, so they
    // can follow it; only a different piece (another file opened) means stop.
    if (!stored || view.state.doc.attrs.id !== doc.attrs.id) return;
    try {
      const docs = replay(stored);
      if (docs[docs.length - 1].eq(doc)) pieceTimeline = { ...stored, moments: [...stored.moments, ...pieceTimeline.moments] };
    } catch {
      /* the stored timeline no longer replays; keep the fresh one */
    }
  }

  function openTimeline(at?: number, play = false): void {
    if (timeline) return;
    onboarding.signal(['timeline-opened' satisfies TourSignal]);
    panel.close();
    closeMenu();
    timeline = new Timeline({
      timeline: () => pieceTimeline,
      close: closeTimeline,
      editAt: (from, to) => {
        closeTimeline();
        const size = view.state.doc.content.size;
        const sel = TextSelection.create(view.state.doc, Math.min(from, size), Math.min(Math.max(to, from), size));
        view.dispatch(view.state.tr.setSelection(sel).scrollIntoView());
        view.focus();
        if (!isInOverflow(view.state.doc, sel.from)) openAlternatives();
      },
    });
    timeline.open(at, play);
  }

  function closeTimeline(): void {
    timeline?.destroy();
    timeline = null;
    view.focus();
  }

  function withId(doc: Node): Node {
    return doc.attrs.id ? doc : doc.type.create({ ...doc.attrs, id: newId() }, doc.content);
  }

  function updateCount(): void {
    const { words, chars } = countPiece(view.state.doc);
    count.textContent = `${words} words ${chars} chars`;
  }

  function redraw(): void {
    if (!body.classList.contains('read')) drawMarks(view, marks);
  }

  function scheduleAutosave(): void {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => files.autosave(toPieceFile(view.state.doc), pieceName), 300);
    clearTimeout(libraryTimer);
    libraryTimer = setTimeout(() => void saveToLibrary(), library.kind === 'account' ? 1500 : 400);
  }

  /** Save the open piece where the writer's pieces live (browser or account). */
  async function saveToLibrary(): Promise<void> {
    clearTimeout(libraryTimer);
    const doc = view.state.doc;
    const file = toPieceFile(doc);
    try {
      await library.save(String(doc.attrs.id), titleOf(file), file, countPiece(doc).words);
      saveWarned = false;
    } catch (err) {
      if (!saveWarned) notify(`${(err as Error).message} Your writing is still kept in this browser.`, 6000);
      saveWarned = true;
    }
  }

  async function flushSaves(): Promise<void> {
    clearTimeout(historyTimer);
    await Promise.all([saveToLibrary(), library.saveTimeline(pieceTimeline)]);
  }

  function replaceDoc(doc: Node, name: string): Promise<void> {
    // Save the piece being left first: its last edits may still be waiting on a timer.
    // (saveToLibrary and saveTimeline read the current piece before their first await.)
    void flushSaves();
    panel.close();
    pieceName = name;
    view.updateState(createEditorState(withId(doc), view.state.plugins.slice(3)));
    const attached = attachTimeline(view.state.doc);
    files.autosave(toPieceFile(view.state.doc), pieceName);
    void saveToLibrary();
    updateCount();
    requestAnimationFrame(redraw);
    view.focus();
    return attached;
  }

  // Your writing, pieces and accounts (ADR-0008).
  const fileName = (title: string) => `${title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60) || 'piece'}.md`;

  async function openPiece(id: string): Promise<boolean> {
    if (id === view.state.doc.attrs.id) return true;
    await flushSaves();
    let text: string | null = null;
    try {
      text = await library.load(id);
    } catch (err) {
      notify((err as Error).message, 4000);
      return false;
    }
    if (text === null) {
      notify('That piece could not be found.', 3000);
      return false;
    }
    files.forgetHandle();
    const loaded = fromPieceFile(text);
    await replaceDoc(loaded.doc, fileName(titleOf(text)));
    if (loaded.notice) notify(loaded.notice, 9000);
    return true;
  }

  async function openWriting(): Promise<void> {
    if (writing) return;
    await ready;
    if (writing) return;
    panel.close();
    closeMenu();
    await flushSaves();
    writing = new WritingView({
      library: () => library,
      me: () => me,
      currentId: () => String(view.state.doc.attrs.id),
      open: async (id) => {
        if (await openPiece(id)) closeWriting();
      },
      replay: async (id, at) => {
        if (!(await openPiece(id))) return;
        closeWriting();
        openTimeline(at, at === undefined);
      },
      signIn,
      signOut,
      bringBrowserPieces,
      browserPiecesNotInAccount: async () => {
        if (library.kind !== 'account') return 0;
        const [mine, here] = await Promise.all([library.list().catch(() => []), browserLibrary.list()]);
        const known = new Set(mine.map((p) => p.id));
        return here.filter((p) => !known.has(p.id)).length;
      },
      close: closeWriting,
    });
    writing.open();
  }

  function closeWriting(): void {
    writing?.destroy();
    writing = null;
    view.focus();
  }

  /** Copy a piece and its timeline from this browser into the account. */
  async function adopt(id: string): Promise<boolean> {
    const text = await browserLibrary.load(id);
    if (text === null) return false;
    const summary = (await browserLibrary.list()).find((p) => p.id === id);
    await library.save(id, summary?.title ?? titleOf(text), text, summary?.words ?? 0);
    const tl = await browserLibrary.loadTimeline(id);
    if (tl && !(await library.loadTimeline(id))) await library.saveTimeline(tl);
    return true;
  }

  async function bringBrowserPieces(): Promise<number> {
    if (library.kind !== 'account') return 0;
    const known = new Set((await library.list()).map((p) => p.id));
    let n = 0;
    for (const p of await browserLibrary.list()) {
      if (known.has(p.id)) continue;
      try {
        if (await adopt(p.id)) n++;
      } catch {
        break;
      }
    }
    return n;
  }

  async function useAccount(email: string, untouchedSample = false): Promise<void> {
    await flushSaves();
    const id = String(view.state.doc.attrs.id);
    library = new AccountLibrary(email);
    // A fresh browser shows the sample; a writer with pieces wants their latest instead.
    if (untouchedSample && view.state.doc.eq(startDoc)) {
      const [latest] = await library.list().catch(() => []);
      const text = latest ? await library.load(latest.id).catch(() => null) : null;
      if (text) {
        clearTimeout(libraryTimer);
        const loaded = fromPieceFile(text);
        pieceName = fileName(titleOf(text));
        view.updateState(createEditorState(withId(loaded.doc), view.state.plugins.slice(3)));
        files.autosave(text, pieceName);
        updateCount();
        requestAnimationFrame(redraw);
        await attachTimeline(view.state.doc);
        return;
      }
    }
    // The piece open on screen comes with the writer into their account.
    const there = await library.load(id).catch(() => null);
    if (there === null) await adopt(id).catch(() => saveToLibrary());
    await attachTimeline(view.state.doc);
  }

  async function signIn(email: string, password: string, create: boolean): Promise<string | null> {
    try {
      const res = await api<{ user: { email: string } }>('POST', create ? '/api/signup' : '/api/login', { email, password });
      me = { accounts: true, user: res.user };
      await useAccount(res.user.email);
      notify(create ? 'Account made. Your writing now saves to it.' : `Signed in as ${res.user.email}.`, 3000);
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : 'Couldn’t sign in.';
    }
  }

  async function signOut(): Promise<void> {
    await flushSaves();
    await api('POST', '/api/logout').catch(() => undefined);
    me = { ...me, user: null };
    library = browserLibrary;
    // Don't leave the account's writing on a shared screen: go back to this browser's own.
    files.clearAutosave();
    const [latest] = await browserLibrary.list();
    const text = latest ? await browserLibrary.load(latest.id) : null;
    await replaceDoc(text ? fromPieceFile(text).doc : samplePiece(), text ? fileName(titleOf(text)) : 'piece.md');
    notify('Signed out. Your account’s writing is no longer on this screen.', 3500);
  }

  // Commands with app-level effects.
  const exec = (cmd: Command) => cmd(view.state, view.dispatch, view);

  function onFlipped(id: string, from: number, to: number): void {
    if (!flipSession || flipSession.id !== id) flipSession = { id, original: from };
    tick(to === flipSession.original);
    setLook(view, { flashed: id });
    setTimeout(() => lookKey.getState(view.state)?.flashed === id && setLook(view, { flashed: null }), 240);
  }

  function flipGroup(id: string, dir: 1 | -1): void {
    const loc = findGroup(view.state.doc, id);
    if (!loc || loc.attrs.variants.length < 2) return;
    const from = loc.attrs.active;
    if (exec(flip(id, dir))) onFlipped(id, from, findGroup(view.state.doc, id)!.attrs.active);
  }

  function deleteVariant(id: string): void {
    const rect = groupRect(view, id);
    const grain = findGroup(view.state.doc, id)?.attrs.grain ?? 'word';
    if (exec(deleteActiveVariant(id)) && rect) explode(rect, getComputedStyle(body).getPropertyValue(`--${grain}`));
    flipSession = null;
  }

  function openAlternatives(): void {
    if (body.classList.contains('read')) toggleRead();
    const { selection, doc } = view.state;
    let id: string | null = null;
    if (!isInOverflow(doc, selection.from)) {
      const at = groupAt(doc, selection.from);
      const loc = at ? findGroup(doc, at) : null;
      if (loc && (selection.empty || (selection.from >= loc.from && selection.to <= loc.to))) id = at;
    }
    if (!panel.openForSelection(id)) notify('Put the caret in a word, or select a sentence or paragraph, first.', 3000);
  }

  function suggestNow(): void {
    openAlternatives();
    void panel.suggest();
  }

  function ghost(): void {
    if (!exec(toggleGhost)) notify('Select some text to ghost it.', 2500);
  }

  function doStash(): void {
    if (exec(stash)) {
      if (!body.classList.contains('overflow-open')) notify('Stashed in Overflow (Ctrl+Shift+D to see it).', 2500);
    }
  }

  function toggleRead(): void {
    body.classList.toggle('read');
    if (body.classList.contains('read')) panel.close();
    setOverflowEditable();
    requestAnimationFrame(redraw);
  }

  function toggleOverflow(): void {
    if (body.classList.contains('read')) toggleRead();
    body.classList.toggle('overflow-open');
    setOverflowEditable();
    const aside = view.dom.querySelector('aside.overflow .overflow-body') as HTMLElement | null;
    if (body.classList.contains('overflow-open') && aside) {
      const end = view.state.doc.content.size - 2;
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, end)));
      view.focus();
    } else if (isInOverflow(view.state.doc, view.state.selection.from)) {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
      view.focus();
    }
  }

  /** A closed Overflow must not take the caret. */
  function setOverflowEditable(): void {
    const open = body.classList.contains('overflow-open') && !body.classList.contains('read');
    view.dom.querySelector('aside.overflow')?.setAttribute('contenteditable', String(open));
  }

  // Files.
  async function saveFile(): Promise<void> {
    const name = await files.save(toPieceFile(view.state.doc), pieceName);
    if (name) {
      pieceName = name;
      files.autosave(toPieceFile(view.state.doc), pieceName);
      notify(`Saved ${name}`, 2000);
    }
  }

  async function openFile(): Promise<void> {
    const picked = await files.open();
    if (!picked) return;
    const loaded = fromPieceFile(picked.text);
    replaceDoc(loaded.doc, picked.name);
    if (loaded.notice) notify(loaded.notice, 9000);
  }

  function newPiece(): void {
    files.forgetHandle();
    replaceDoc(fromPieceFile('').doc, 'piece.md');
    notify('New piece. Your last one is still in its file if you saved it.', 3500);
  }

  function exportClean(): void {
    files.download(exportMarkdown(view.state.doc), pieceName.replace(/(\.md)?$/, '-clean.md'));
  }

  async function exportLog(): Promise<void> {
    const events = await readEvents(view.state.doc.attrs.id as string);
    files.download(toJsonLines(events), pieceName.replace(/(\.md)?$/, '-events.jsonl'), 'application/x-ndjson');
  }

  function showSource(): void {
    const pre = document.createElement('pre');
    pre.textContent = toPieceFile(view.state.doc);
    showSheet(pieceName, pre, () => view.focus());
  }

  function showShortcuts(): void {
    const body = document.createElement('div');
    body.append(keybindingsEditor(keys, refreshTitles), colourKey());
    showSheet('Shortcuts and colours', body, () => view.focus());
  }

  /** Keep button tooltips and the context menu in step with custom keys. */
  function refreshTitles(): void {
    for (const [el, id, label] of titled) el.title = `${label} (${pretty(keys.combo(id))})`;
  }

  // Pointer: hover tint and arrow ownership.
  let lastPointer = { x: 0, y: 0 };
  view.dom.addEventListener('mousemove', (e) => {
    if (Math.abs(e.clientX - lastPointer.x) + Math.abs(e.clientY - lastPointer.y) < 3) return;
    lastPointer = { x: e.clientX, y: e.clientY };
    const hit = view.posAtCoords({ left: e.clientX, top: e.clientY });
    const id = hit && !isInOverflow(view.state.doc, hit.pos) ? groupAt(view.state.doc, hit.inside >= 0 ? hit.pos : hit.pos) : null;
    mode = 'pointer';
    const current = lookKey.getState(view.state)?.hovered ?? null;
    if (id !== current) {
      if (flipSession && flipSession.id !== id) flipSession = null;
      setLook(view, { hovered: id });
    }
  });
  view.dom.addEventListener('mouseleave', () => {
    flipSession = null;
    if (lookKey.getState(view.state)?.hovered) setLook(view, { hovered: null });
  });

  view.dom.addEventListener('contextmenu', (e) => {
    if (body.classList.contains('read')) return;
    e.preventDefault();
    const inGhost = ghostRunAt(view.state.doc, view.state.selection.from);
    const hit = view.posAtCoords({ left: e.clientX, top: e.clientY });
    if (hit && view.state.selection.empty) view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, hit.pos)));
    showMenu(e.clientX, e.clientY, [
      { label: 'Alternatives for selection', keys: pretty(keys.combo('alternatives')), run: openAlternatives },
      { label: inGhost ? 'Revive it' : 'Ghost it', keys: pretty(keys.combo('ghost')), run: ghost },
      { label: 'Stash this in Overflow', keys: pretty(keys.combo('stash')), run: doStash },
    ]);
  });
  window.addEventListener('mousedown', (e) => {
    if (!(e.target as HTMLElement).closest('.menu')) closeMenu();
  });

  // Keyboard. Shortcuts come from the keybindings table. Inside the editor they
  // run from ProseMirror's own key handler, after it has read the latest
  // selection from the page; elsewhere (panels, chrome) from the window.
  function runShortcut(e: KeyboardEvent, inEditor: boolean): boolean {
    const action = keys.match(e);
    // The browser reports a fresh click or double-click selection a moment
    // later (selectionchange); read it now so the shortcut acts where you clicked.
    if (action && inEditor) (view as unknown as { domObserver?: { flush(): void } }).domObserver?.flush();
    const inOverflow = inEditor && isInOverflow(view.state.doc, view.state.selection.from);
    const caretGroup = () => (inEditor ? groupAt(view.state.doc, view.state.selection.head) : null);
    switch (action) {
      case 'read': toggleRead(); return true;
      case 'alternatives': openAlternatives(); return true;
      case 'suggest': suggestNow(); return true;
      case 'overflow': toggleOverflow(); return true;
      case 'timeline': openTimeline(); return true;
      case 'writing': void openWriting(); return true;
      case 'source': showSource(); return true;
      case 'save': void saveFile(); return true;
      case 'open': void openFile(); return true;
      case 'ghost': if (!inEditor) return false; ghost(); return true;
      case 'stash': if (!inEditor) return false; doStash(); return true;
      case 'use': return inOverflow ? (exec(useFromOverflow), true) : false;
      case 'flipNext':
      case 'flipPrev': {
        const id = caretGroup();
        if (!id) return false;
        flipGroup(id, action === 'flipNext' ? 1 : -1);
        return true;
      }
    }
    if (!inEditor || e.ctrlKey || e.metaKey || e.altKey) return false;
    const hovered = lookKey.getState(view.state)?.hovered;
    if (mode === 'pointer' && hovered && !e.shiftKey) {
      if (e.key === 'ArrowRight') return flipGroup(hovered, 1), true;
      if (e.key === 'ArrowLeft') return flipGroup(hovered, -1), true;
      if (e.key === 'Delete' || e.key === 'Backspace') return deleteVariant(hovered), true;
    }
    if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) {
      mode = 'caret';
      flipSession = null;
    }
    return false;
  }
  editorShortcuts = (e) => runShortcut(e, true);

  window.addEventListener(
    'keydown',
    (e) => {
      if (timeline || writing) return;
      if (isSheetOpen()) {
        if (document.querySelector('.key-btn.capturing')) return;
        if (e.key === 'Escape' || keys.match(e) === 'source') {
          e.preventDefault();
          closeSheet();
        }
        return;
      }
      if (e.key === 'Escape' && onboarding.welcoming) {
        e.preventDefault();
        e.stopPropagation();
        onboarding.closeWelcome();
        return;
      }
      if (e.key === 'Escape') {
        closeMenu();
        if (panel.isOpen) panel.close();
      }
    },
    true,
  );
  window.addEventListener('keydown', (e) => {
    if (timeline || writing || isSheetOpen() || e.defaultPrevented || view.dom.contains(e.target as globalThis.Node)) return;
    if (runShortcut(e, false)) e.preventDefault();
  });

  window.addEventListener('resize', () => requestAnimationFrame(redraw));
  
  void document.fonts?.ready.then(() => requestAnimationFrame(redraw));

  startDoc = view.state.doc;
  ready = attachTimeline(view.state.doc).then(async () => {
    me = await whoAmI();
    if (me.user) await useAccount(me.user.email, !restored);
    else await saveToLibrary();
  });
  updateCount();
  setOverflowEditable();
  requestAnimationFrame(redraw);
  view.focus();
  if (!hasBeenWelcomed()) onboarding.showWelcome();
  // Exposed for end-to-end tests and the curious.
  (window as unknown as { writeOn: unknown }).writeOn = { view, toPieceFile: () => toPieceFile(view.state.doc) };
}
