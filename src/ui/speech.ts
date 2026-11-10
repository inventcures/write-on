/**
 * Speech (ADR-0010): the writer speaks, and their own words land in the page
 * or in an alternative. Recognition is the browser's own (no key, no server of
 * ours). The raw recording is kept in this browser, with what was heard.
 */

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function recognitionClass(): (new () => Recognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const speechSupported = (): boolean => recognitionClass() !== null;

export interface Recording {
  id: string;
  pieceId: string;
  t: number;
  ms: number;
  type: string;
  blob: Blob;
  heard: string;
}

export interface ListenHandlers {
  /** A stretch of speech the engine is sure of. */
  final(text: string): void;
  /** What it thinks it is hearing right now; replaced as it goes. */
  interim(text: string): void;
  /** Listening stopped, by the writer or by the browser. `error` says why, if it went wrong. */
  end(error?: string): void;
}

const ERRORS: Record<string, string> = {
  'not-allowed': 'The microphone is blocked for this site. Allow it in the address bar, then try again.',
  'service-not-allowed': 'This browser won’t turn speech into text here.',
  'audio-capture': 'No microphone was found.',
  network: 'Speech needs a connection in this browser, and it seems to be offline.',
  'language-not-supported': 'This browser can’t hear that language.',
};

/** One spell of listening: speech to text, and the raw audio kept alongside. */
export class Listener {
  private rec: Recognition | null = null;
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private started = 0;
  private heard: string[] = [];
  private wanted = false;
  private failed: string | undefined;
  private saved: Promise<Recording | null> = Promise.resolve(null);

  constructor(
    private pieceId: string,
    private on: ListenHandlers,
  ) {}

  get listening(): boolean {
    return this.wanted;
  }

  async start(): Promise<void> {
    const Rec = recognitionClass();
    if (!Rec) return this.on.end('This browser can’t turn speech into text. Chrome, Edge and Safari can.');
    this.wanted = true;
    this.started = Date.now();
    void this.record();
    const rec = new Rec();
    rec.lang = navigator.language || 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0]?.transcript ?? '';
        if (r.isFinal) {
          if (text.trim()) {
            this.heard.push(text.trim());
            this.on.final(text);
          }
        } else interim += text;
      }
      this.on.interim(interim);
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      this.failed = ERRORS[e.error] ?? 'Listening stopped.';
      this.wanted = false;
    };
    // Browsers stop on their own after a pause; carry on until the writer stops.
    rec.onend = () => {
      if (this.wanted) {
        try {
          rec.start();
          return;
        } catch {
          this.wanted = false;
        }
      }
      void this.finish();
    };
    this.rec = rec;
    try {
      rec.start();
    } catch {
      this.wanted = false;
      void this.finish();
    }
  }

  /** Stop listening. Resolves with the kept recording, if there is one. */
  stop(): Promise<Recording | null> {
    this.wanted = false;
    this.rec?.stop();
    return this.saved;
  }

  private async record(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return; // recognition may still work; there is just no recording
    }
    if (!this.wanted) return this.release();
    const recorder = new MediaRecorder(this.stream);
    recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.saved = new Promise((resolve) => {
      recorder.onstop = async () => {
        this.release();
        if (!this.chunks.length) return resolve(null);
        const blob = new Blob(this.chunks, { type: recorder.mimeType || 'audio/webm' });
        const rec: Recording = {
          id: `${this.started.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          pieceId: this.pieceId,
          t: this.started,
          ms: Date.now() - this.started,
          type: blob.type,
          blob,
          heard: this.heard.join(' '),
        };
        resolve((await saveRecording(rec)) ? rec : null);
      };
    });
    recorder.start(1000);
    this.recorder = recorder;
  }

  private release(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  private async finish(): Promise<void> {
    this.on.interim('');
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    else this.release();
    this.on.end(this.failed);
  }
}

// Recordings live in their own IndexedDB database, so audio never slows the event log.
const DB = 'write-on-audio';
const STORE = 'recordings';
let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' }).createIndex('pieceId', 'pieceId');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

const done = (tx: IDBTransaction) => new Promise<void>((ok, no) => ((tx.oncomplete = () => ok()), (tx.onerror = () => no(tx.error))));

export async function saveRecording(rec: Recording): Promise<boolean> {
  try {
    const tx = (await open()).transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(rec);
    await done(tx);
    return true;
  } catch {
    return false;
  }
}

/** A piece's recordings, newest first; or every recording in this browser. */
export async function recordings(pieceId?: string): Promise<Recording[]> {
  try {
    const store = (await open()).transaction(STORE).objectStore(STORE);
    const req = pieceId ? store.index('pieceId').getAll(pieceId) : store.getAll();
    const all = await new Promise<Recording[]>((ok, no) => ((req.onsuccess = () => ok(req.result as Recording[])), (req.onerror = () => no(req.error))));
    return all.sort((a, b) => b.t - a.t);
  } catch {
    return [];
  }
}

export async function deleteRecording(id: string): Promise<void> {
  try {
    const tx = (await open()).transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    await done(tx);
  } catch {
    /* nothing to delete */
  }
}

/** "1:07" */
export function clock(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
