/**
 * Where a writer's pieces live (ADR-0008): in this browser when signed out,
 * in their account when signed in. Both look the same to the app.
 */
import type { PieceTimeline } from '../core/moments';
import type { EditEvent } from '../core/piece';
import { loadTimeline, logEvents, readAllTimelines, saveTimeline } from './eventLog';

export interface PieceSummary {
  id: string;
  title: string;
  words: number;
  created: number;
  updated: number;
}

/** One piece's moments without their steps: enough to draw "Your writing". */
export interface PieceActivity {
  pieceId: string;
  moments: [number, string, string?][];
}

export interface Library {
  readonly kind: 'browser' | 'account';
  list(): Promise<PieceSummary[]>;
  load(id: string): Promise<string | null>;
  save(id: string, title: string, file: string, words: number): Promise<void>;
  remove(id: string): Promise<void>;
  logEvents(pieceId: string, events: EditEvent[]): Promise<void>;
  saveTimeline(timeline: PieceTimeline): Promise<void>;
  loadTimeline(pieceId: string): Promise<PieceTimeline | null>;
  activity(): Promise<PieceActivity[]>;
}

/** A piece's title: its first heading, or else its first line. */
export function titleOf(markdownBody: string): string {
  const lines = markdownBody.split('\n').map((l) => l.trim()).filter(Boolean);
  const heading = lines.find((l) => /^#{1,6}\s/.test(l));
  const raw = (heading ?? lines[0] ?? '').replace(/^#{1,6}\s+/, '').replace(/[*_`>]/g, '').trim();
  if (!raw || raw.startsWith('<!--')) return 'Untitled';
  return raw.length > 80 ? `${raw.slice(0, 77)}…` : raw;
}

const INDEX = 'write-on:pieces';
const PIECE = (id: string) => `write-on:piece:${id}`;

function readIndex(): PieceSummary[] {
  try {
    const raw = JSON.parse(localStorage.getItem(INDEX) ?? '[]') as PieceSummary[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeIndex(index: PieceSummary[]): void {
  try {
    localStorage.setItem(INDEX, JSON.stringify(index));
  } catch {
    /* storage full or blocked */
  }
}

/** Pieces in this browser: localStorage for the files, IndexedDB for events and timelines. */
export class BrowserLibrary implements Library {
  readonly kind = 'browser' as const;

  async list(): Promise<PieceSummary[]> {
    return readIndex().sort((a, b) => b.updated - a.updated);
  }

  async load(id: string): Promise<string | null> {
    try {
      return localStorage.getItem(PIECE(id));
    } catch {
      return null;
    }
  }

  async save(id: string, title: string, file: string, words: number): Promise<void> {
    try {
      localStorage.setItem(PIECE(id), file);
    } catch {
      return;
    }
    const now = Date.now();
    const index = readIndex();
    const at = index.findIndex((p) => p.id === id);
    if (at === -1) index.push({ id, title, words, created: now, updated: now });
    else index[at] = { ...index[at], title, words, updated: now };
    writeIndex(index);
  }

  async remove(id: string): Promise<void> {
    try {
      localStorage.removeItem(PIECE(id));
    } catch {
      /* nothing to remove */
    }
    writeIndex(readIndex().filter((p) => p.id !== id));
  }

  logEvents(pieceId: string, events: EditEvent[]): Promise<void> {
    return logEvents(pieceId, events);
  }

  saveTimeline(timeline: PieceTimeline): Promise<void> {
    return saveTimeline(timeline);
  }

  loadTimeline(pieceId: string): Promise<PieceTimeline | null> {
    return loadTimeline(pieceId);
  }

  async activity(): Promise<PieceActivity[]> {
    const known = new Set(readIndex().map((p) => p.id));
    return (await readAllTimelines())
      .filter((t) => known.has(t.pieceId))
      .map((t) => ({ pieceId: t.pieceId, moments: t.moments.map((m) => (m.by ? [m.t, m.kind, m.by] : [m.t, m.kind])) }));
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: { 'x-write-on': '1', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'You seem to be offline.');
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(res.status, json.error ?? 'Something went wrong.');
  return json;
}

/** Pieces in the writer's account on the server. */
export class AccountLibrary implements Library {
  readonly kind = 'account' as const;

  constructor(readonly email: string) {}

  async list(): Promise<PieceSummary[]> {
    return (await api<{ pieces: PieceSummary[] }>('GET', '/api/pieces')).pieces;
  }

  async load(id: string): Promise<string | null> {
    try {
      return (await api<{ piece: { file: string } }>('GET', `/api/pieces/${encodeURIComponent(id)}`)).piece.file;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  }

  async save(id: string, title: string, file: string, words: number): Promise<void> {
    await api('PUT', `/api/pieces/${encodeURIComponent(id)}`, { title, file, words });
  }

  async remove(id: string): Promise<void> {
    await api('DELETE', `/api/pieces/${encodeURIComponent(id)}`);
  }

  async logEvents(pieceId: string, events: EditEvent[]): Promise<void> {
    const t = Date.now();
    await api('POST', '/api/events', { pieceId, events: events.map((e) => ({ ...e, t })) }).catch(() => undefined);
  }

  async saveTimeline(timeline: PieceTimeline): Promise<void> {
    await api('PUT', `/api/timelines/${encodeURIComponent(timeline.pieceId)}`, { timeline }).catch(() => undefined);
  }

  async loadTimeline(pieceId: string): Promise<PieceTimeline | null> {
    try {
      return (await api<{ timeline: PieceTimeline | null }>('GET', `/api/timelines/${encodeURIComponent(pieceId)}`)).timeline;
    } catch {
      return null;
    }
  }

  async activity(): Promise<PieceActivity[]> {
    return (await api<{ activity: PieceActivity[] }>('GET', '/api/activity')).activity;
  }
}

export interface Me {
  accounts: boolean;
  user: { email: string } | null;
}

export async function whoAmI(): Promise<Me> {
  try {
    return await api<Me>('GET', '/api/me');
  } catch {
    return { accounts: false, user: null };
  }
}
