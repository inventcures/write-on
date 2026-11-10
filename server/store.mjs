// Accounts and each writer's pieces, events and timelines, in one SQLite file
// (ADR-0008). Node's built-in SQLite: no dependency, one file on a volume.
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);
const SESSION_DAYS = 30;

export const LIMITS = {
  pieces: 500,
  fileBytes: 2_000_000,
  timelineBytes: 8_000_000,
  eventsPerPost: 500,
  eventTextChars: 4000,
};

/** Open the store. `dir` null means in memory (tests). */
export async function openStore(dir) {
  const { DatabaseSync } = await import('node:sqlite');
  let path = ':memory:';
  if (dir) {
    mkdirSync(dir, { recursive: true });
    path = join(dir, 'write-on.sqlite');
  }
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, pass TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS pieces (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, id TEXT NOT NULL,
      title TEXT NOT NULL, file TEXT NOT NULL, words INTEGER NOT NULL DEFAULT 0,
      created INTEGER NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY (user_id, id));
    CREATE TABLE IF NOT EXISTS events (
      seq INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      piece_id TEXT NOT NULL, t INTEGER NOT NULL, kind TEXT NOT NULL, by TEXT, data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS events_user_t ON events(user_id, t);
    CREATE TABLE IF NOT EXISTS timelines (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, piece_id TEXT NOT NULL,
      data TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY (user_id, piece_id));
    CREATE TABLE IF NOT EXISTS google_ids (
      sub TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE);
  `);
  return new Store(db);
}

const hashToken = (token) => createHash('sha256').update(token).digest('hex');

async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function checkPassword(password, stored) {
  const [scheme, salt, key] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !key) {
    // A Google-only account has no password. Hash anyway, so timing looks the same.
    await scrypt(password, 'no-password', 64, { N: 16384, r: 8, p: 1 });
    return false;
  }
  const want = Buffer.from(key, 'base64');
  const got = await scrypt(password, Buffer.from(salt, 'base64'), want.length, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(got, want);
}

export class Store {
  constructor(db) {
    this.db = db;
  }

  close() {
    this.db.close();
  }

  async createUser(email, password, now = Date.now()) {
    if (this.db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return null;
    const id = randomBytes(12).toString('hex');
    this.db.prepare('INSERT INTO users (id, email, pass, created) VALUES (?, ?, ?, ?)').run(id, email, await hashPassword(password), now);
    return { id, email };
  }

  async verifyUser(email, password) {
    const row = this.db.prepare('SELECT id, email, pass FROM users WHERE email = ?').get(email);
    // Hash anyway when there is no such user, so timing doesn't reveal which emails exist.
    if (!row) {
      await checkPassword(password, 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64'));
      return null;
    }
    return (await checkPassword(password, row.pass)) ? { id: row.id, email: row.email } : null;
  }

  /**
   * The account for a Google sign-in: the one already linked to this Google
   * account, else the account with the same (Google-verified) email, which is
   * then linked, else a new account with no password.
   */
  userForGoogle(sub, email, now = Date.now()) {
    const linked = this.db.prepare('SELECT u.id, u.email FROM google_ids g JOIN users u ON u.id = g.user_id WHERE g.sub = ?').get(sub);
    if (linked) return { id: linked.id, email: linked.email, created: false };
    let row = this.db.prepare('SELECT id, email FROM users WHERE email = ?').get(email);
    let created = false;
    if (!row) {
      row = { id: randomBytes(12).toString('hex'), email };
      // An empty password can never match: checkPassword wants the scrypt scheme.
      this.db.prepare('INSERT INTO users (id, email, pass, created) VALUES (?, ?, ?, ?)').run(row.id, email, '', now);
      created = true;
    }
    this.db.prepare('INSERT INTO google_ids (sub, user_id) VALUES (?, ?)').run(sub, row.id);
    return { id: row.id, email: row.email, created };
  }

  createSession(userId, now = Date.now()) {
    const token = randomBytes(32).toString('base64url');
    this.db.prepare('DELETE FROM sessions WHERE expires < ?').run(now);
    this.db.prepare('INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)').run(hashToken(token), userId, now + SESSION_DAYS * 86_400_000);
    return { token, maxAge: SESSION_DAYS * 86_400 };
  }

  userForSession(token, now = Date.now()) {
    if (!token) return null;
    const row = this.db
      .prepare('SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires > ?')
      .get(hashToken(token), now);
    return row ? { id: row.id, email: row.email } : null;
  }

  endSession(token) {
    if (token) this.db.prepare('DELETE FROM sessions WHERE token = ?').run(hashToken(token));
  }

  listPieces(userId) {
    return this.db
      .prepare('SELECT id, title, words, created, updated FROM pieces WHERE user_id = ? ORDER BY updated DESC')
      .all(userId)
      .map((r) => ({ ...r }));
  }

  getPiece(userId, id) {
    const row = this.db.prepare('SELECT id, title, file, words, created, updated FROM pieces WHERE user_id = ? AND id = ?').get(userId, id);
    return row ? { ...row } : null;
  }

  /** Returns 'ok', or why not: 'too-big' or 'too-many'. */
  putPiece(userId, id, { title, file, words }, now = Date.now()) {
    if (Buffer.byteLength(file) > LIMITS.fileBytes) return 'too-big';
    const exists = this.db.prepare('SELECT 1 FROM pieces WHERE user_id = ? AND id = ?').get(userId, id);
    if (!exists) {
      const { n } = this.db.prepare('SELECT COUNT(*) AS n FROM pieces WHERE user_id = ?').get(userId);
      if (n >= LIMITS.pieces) return 'too-many';
      this.db
        .prepare('INSERT INTO pieces (user_id, id, title, file, words, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(userId, id, title, file, words, now, now);
    } else {
      this.db.prepare('UPDATE pieces SET title = ?, file = ?, words = ?, updated = ? WHERE user_id = ? AND id = ?').run(title, file, words, now, userId, id);
    }
    return 'ok';
  }

  deletePiece(userId, id) {
    this.db.prepare('DELETE FROM pieces WHERE user_id = ? AND id = ?').run(userId, id);
    this.db.prepare('DELETE FROM timelines WHERE user_id = ? AND piece_id = ?').run(userId, id);
    this.db.prepare('DELETE FROM events WHERE user_id = ? AND piece_id = ?').run(userId, id);
  }

  addEvents(userId, pieceId, events) {
    const insert = this.db.prepare('INSERT INTO events (user_id, piece_id, t, kind, by, data) VALUES (?, ?, ?, ?, ?, ?)');
    for (const e of events) insert.run(userId, pieceId, e.t, e.kind, e.by ?? null, JSON.stringify(e));
  }

  /** Every event of every piece, oldest first: the source of "Your writing". */
  allEvents(userId) {
    return this.db
      .prepare('SELECT piece_id, data FROM events WHERE user_id = ? ORDER BY t, seq')
      .all(userId)
      .map((r) => ({ ...JSON.parse(r.data), pieceId: r.piece_id }));
  }

  /** Every moment of every piece, without the steps: when, what, and whether WO was in it. */
  activity(userId) {
    return this.db
      .prepare('SELECT piece_id, data FROM timelines WHERE user_id = ?')
      .all(userId)
      .map((r) => ({
        pieceId: r.piece_id,
        moments: (JSON.parse(r.data).moments ?? []).map((m) => (m.by ? [m.t, m.kind, m.by] : [m.t, m.kind])),
      }));
  }

  getTimeline(userId, pieceId) {
    const row = this.db.prepare('SELECT data FROM timelines WHERE user_id = ? AND piece_id = ?').get(userId, pieceId);
    return row ? JSON.parse(row.data) : null;
  }

  putTimeline(userId, pieceId, json, now = Date.now()) {
    if (Buffer.byteLength(json) > LIMITS.timelineBytes) return 'too-big';
    this.db
      .prepare('INSERT INTO timelines (user_id, piece_id, data, updated) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, piece_id) DO UPDATE SET data = excluded.data, updated = excluded.updated')
      .run(userId, pieceId, json, now);
    return 'ok';
  }
}
