import type { PieceTimeline } from '../core/moments';
import type { EditEvent } from '../core/piece';

/** The learning layer's source: every choice, per piece, in this browser's IndexedDB. */
const DB = 'write-on';
const STORE = 'events';
const TIMELINE = 'timeline';

export type LoggedEvent = EditEvent & { pieceId: string; t: number };

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 3);
    req.onupgradeneeded = (e) => {
      if (e.oldVersion < 1) req.result.createObjectStore(STORE, { autoIncrement: true }).createIndex('pieceId', 'pieceId');
      if (!req.result.objectStoreNames.contains(TIMELINE)) req.result.createObjectStore(TIMELINE, { keyPath: 'pieceId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function logEvents(pieceId: string, events: EditEvent[]): Promise<void> {
  if (events.length === 0) return;
  try {
    const db = await open();
    const tx = db.transaction(STORE, 'readwrite');
    const t = Date.now();
    for (const e of events) tx.objectStore(STORE).add({ ...e, pieceId, t });
  } catch {
    /* IndexedDB unavailable (private window): writing still works, nothing is logged */
  }
}

export async function readEvents(pieceId: string): Promise<LoggedEvent[]> {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).index('pieceId').getAll(pieceId);
      req.onsuccess = () => resolve(req.result as LoggedEvent[]);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export function toJsonLines(events: LoggedEvent[]): string {
  return events.map((e) => JSON.stringify(e)).join('\n') + (events.length ? '\n' : '');
}

/** The full writing timeline of a piece, for the timeline. */
export async function saveTimeline(timeline: PieceTimeline): Promise<void> {
  try {
    const db = await open();
    db.transaction(TIMELINE, 'readwrite').objectStore(TIMELINE).put(timeline);
  } catch {
    /* no IndexedDB: the timeline only covers this visit */
  }
}

export async function loadTimeline(pieceId: string): Promise<PieceTimeline | null> {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(TIMELINE).objectStore(TIMELINE).get(pieceId);
      req.onsuccess = () => resolve((req.result as PieceTimeline | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

/** Every stored timeline in this browser, for "Your writing". */
export async function readAllTimelines(): Promise<PieceTimeline[]> {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(TIMELINE).objectStore(TIMELINE).getAll();
      req.onsuccess = () => resolve(req.result as PieceTimeline[]);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}
