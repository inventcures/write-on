/** Opening and saving piece files on the writer's own disk, plus the browser autosave. */
const AUTOSAVE_KEY = 'write-on:piece';
const NAME_KEY = 'write-on:name';

interface FileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
}

type PickerWindow = Window & {
  showOpenFilePicker?: (opts: unknown) => Promise<FileHandle[]>;
  showSaveFilePicker?: (opts: unknown) => Promise<FileHandle>;
};

const pickerTypes = [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown', '.txt'] } }];
let handle: FileHandle | null = null;

export function autosave(text: string, name: string): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, text);
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* storage full or blocked */
  }
}

export function restore(): { text: string; name: string } | null {
  try {
    const text = localStorage.getItem(AUTOSAVE_KEY);
    return text ? { text, name: localStorage.getItem(NAME_KEY) || 'piece.md' } : null;
  } catch {
    return null;
  }
}

export function download(text: string, name: string, type = 'text/markdown'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Save to the same file when the browser allows it; otherwise download. Returns the file name. */
export async function save(text: string, name: string): Promise<string | null> {
  const w = window as PickerWindow;
  try {
    if (!handle && w.showSaveFilePicker) handle = await w.showSaveFilePicker({ suggestedName: name, types: pickerTypes });
    if (handle) {
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return handle.name;
    }
  } catch (err) {
    if ((err as DOMException).name === 'AbortError') return null;
    handle = null;
  }
  download(text, name);
  return name;
}

export async function open(): Promise<{ text: string; name: string } | null> {
  const w = window as PickerWindow;
  if (w.showOpenFilePicker) {
    try {
      const [picked] = await w.showOpenFilePicker({ types: pickerTypes });
      handle = picked;
      return { text: await (await picked.getFile()).text(), name: picked.name };
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return null;
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.markdown,.txt,text/markdown,text/plain';
    input.onchange = async () => {
      const file = input.files?.[0];
      handle = null;
      resolve(file ? { text: await file.text(), name: file.name } : null);
    };
    input.click();
  });
}

export function forgetHandle(): void {
  handle = null;
}
