/** Small pieces of chrome: the right-click menu, sheets, and notices. */

export interface MenuItem {
  label: string;
  keys: string;
  run: () => void;
}

let openMenu: HTMLElement | null = null;

export function closeMenu(): void {
  openMenu?.remove();
  openMenu = null;
}

export function showMenu(x: number, y: number, items: MenuItem[]): void {
  closeMenu();
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.setAttribute('role', 'menu');
  for (const item of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    const label = document.createElement('span');
    label.textContent = item.label;
    const kbd = document.createElement('kbd');
    kbd.textContent = item.keys;
    b.append(label, kbd);
    b.onmousedown = (e) => e.preventDefault();
    b.onclick = () => {
      closeMenu();
      item.run();
    };
    menu.append(b);
  }
  document.body.append(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(x, innerWidth - r.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, innerHeight - r.height - 8))}px`;
  openMenu = menu;
}

let openSheet: HTMLElement | null = null;
let onSheetClose: (() => void) | null = null;

export function isSheetOpen(): boolean {
  return openSheet !== null;
}

export function closeSheet(): void {
  openSheet?.remove();
  openSheet = null;
  onSheetClose?.();
  onSheetClose = null;
}

export function showSheet(title: string, body: HTMLElement, onClose?: () => void): void {
  closeSheet();
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  backdrop.onclick = (e) => e.target === backdrop && closeSheet();
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', title);
  const h = document.createElement('h2');
  h.textContent = title;
  sheet.append(h, body);
  backdrop.append(sheet);
  document.body.append(backdrop);
  openSheet = backdrop;
  onSheetClose = onClose ?? null;
}

export function shortcutsTable(rows: [string, string][]): HTMLElement {
  const table = document.createElement('table');
  for (const [action, keys] of rows) {
    const tr = table.insertRow();
    tr.insertCell().textContent = action;
    const k = document.createElement('kbd');
    k.textContent = keys;
    tr.insertCell().append(k);
  }
  return table;
}

let noticeTimer: ReturnType<typeof setTimeout> | undefined;

export function notify(text: string, ms = 6000): void {
  document.querySelector('.notice')?.remove();
  const n = document.createElement('div');
  n.className = 'notice';
  n.setAttribute('role', 'status');
  n.textContent = text;
  document.body.append(n);
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => n.remove(), ms);
}
