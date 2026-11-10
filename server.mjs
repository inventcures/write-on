// Minimal static server for Railway: serves the built app from dist/ on $PORT.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aiConfig, rateLimiter, suggest } from './server/suggest.mjs';

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
};

const limit = rateLimiter();
const json = (res, status, body) =>
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }).end(JSON.stringify(body));

function readBody(req, max = 20_000) {
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
    json(res, 200, { enabled: aiConfig(process.env).enabled });
    return;
  }
  if (url.pathname === '/api/suggest') {
    if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
    const input = await readBody(req);
    const ip = String(req.headers['x-real-ip'] ?? req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0].trim();
    const out = await suggest(input, req.headers, { env: process.env, fetch, ip, now: Date.now(), limit });
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
  res.writeHead(200, {
    'content-type': types[ext] ?? 'application/octet-stream',
    'cache-control': file.includes(`${join(root, 'assets')}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`write-on listening on ${port}`));
