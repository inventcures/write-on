// Minimal static server for Railway: serves the built app from dist/ on $PORT.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aiConfig, rateLimiter, suggest } from './server/suggest.mjs';
import { apiLimits, handleApi } from './server/api.mjs';
import { googleConfig } from './server/google.mjs';
import { createUsage, resendSender, usageConfig } from './server/usage.mjs';
import { openStore } from './server/store.mjs';

const root = join(fileURLToPath(new URL('.', import.meta.url)), 'dist');
const port = Number(process.env.PORT) || 4173;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.vtt': 'text/vtt; charset=utf-8',
  '.webm': 'video/webm',
};

const limit = rateLimiter();
const usageCfg = usageConfig(process.env);
const usage = createUsage({ dir: process.env.DATA_DIR || null, cfg: usageCfg, send: resendSender(usageCfg) });
// Accounts are on only when DATA_DIR points at lasting storage (a Railway
// volume); without it, accounts would vanish on every deploy (ADR-0008).
const store = process.env.DATA_DIR ? await openStore(process.env.DATA_DIR) : null;
const limits = apiLimits();
const google = googleConfig(process.env);
const json = (res, status, body, cookie) =>
  res
    .writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...(cookie ? { 'set-cookie': cookie } : {}),
    })
    .end(JSON.stringify(body));

function readBody(req, max) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > max) {
        resolve(null);
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
    return;
  }
  if (url.pathname === '/api/ai') {
    const ai = aiConfig(process.env);
    json(res, 200, { enabled: ai.enabled, code: Boolean(ai.code) });
    return;
  }
  if (url.pathname.startsWith('/api/') && url.pathname !== '/api/suggest' && url.pathname !== '/api/ai') {
    if (!store) return json(res, url.pathname === '/api/me' ? 200 : 503, url.pathname === '/api/me' ? { accounts: false, google: false, user: null } : { error: 'Accounts are not switched on for this site.' });
    const max = url.pathname.startsWith('/api/timelines/') ? 9_000_000 : 2_500_000;
    const input = req.method === 'GET' || req.method === 'HEAD' ? null : await readBody(req, max);
    const ip = String(req.headers['x-real-ip'] ?? req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0].trim();
    try {
      const out = await handleApi(
        { method: req.method, path: url.pathname, query: url.searchParams, headers: req.headers, body: input, ip, secure: req.headers['x-forwarded-proto'] === 'https', now: Date.now() },
        { store, limits, google, fetch },
      );
      if (out.location) {
        res.writeHead(302, { location: out.location, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'set-cookie': out.cookies }).end();
        return;
      }
      return json(res, out.status, out.body, out.cookie);
    } catch (err) {
      console.error('api error', err?.message);
      return json(res, 500, { error: 'Something went wrong on our side.' });
    }
  }
  if (url.pathname === '/api/suggest') {
    if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
    const input = await readBody(req, 20_000);
    const ip = String(req.headers['x-real-ip'] ?? req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0].trim();
    const out = await suggest(input, req.headers, { env: process.env, fetch, ip, now: Date.now(), limit, usage });
    json(res, out.status, out.body);
    return;
  }
  let path = '/';
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    /* malformed escape: serve the app */
  }
  const safe = normalize(path).replace(/^(\.\.[/\\])+/, '');
  let file = join(root, safe);
  if (!file.startsWith(root)) file = join(root, 'index.html');
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch {
    file = join(root, 'index.html');
  }
  const ext = extname(file);
  const headers = {
    'content-type': types[ext] ?? 'application/octet-stream',
    'cache-control': file.includes(`${join(root, 'assets')}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'accept-ranges': 'bytes',
  };
  const { size } = await stat(file);
  // Byte ranges, so video can seek (Safari won't play without them).
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''));
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    let end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      res.writeHead(416, { 'content-range': `bytes */${size}` }).end();
      return;
    }
    res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { ...headers, 'content-length': size });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`write-on listening on ${port}`));
