import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { handle } from './api';
import { getDeps } from './deps';

const port = Number(process.env.PORT ?? 5199);
const host = process.env.HOST ?? '127.0.0.1';
const root = resolve(process.env.INTENT_STATIC_DIR ?? 'dist');
const deps = getDeps(); // Fail at startup on missing model configuration.
const pending = new Set<Promise<unknown>>();
const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  try {
    const origin = process.env.INTENT_PUBLIC_ORIGIN ?? 'http://' + (req.headers.host ?? 'localhost:' + port);
    const url = new URL(req.url ?? '/', origin);
    if (url.pathname === '/healthz' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ status: 'ok', product: 'intent', storage: 'tinybase' })); return;
    }
    if (url.pathname.startsWith('/api/')) {
      let bytes = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 32768) { res.writeHead(413).end(); return; }
        chunks.push(Buffer.from(chunk));
      }
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) if (typeof value === 'string') headers.set(name, value);
      const response = await handle(new Request(url, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined }), deps, p => {
        const job = p.catch(() => console.error('[intent] background task failed'));
        pending.add(job); void job.finally(() => pending.delete(job));
      });
      res.statusCode = response.status;
      response.headers.forEach((value, name) => res.setHeader(name, value));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    let file = resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + sep) && file !== root) { res.writeHead(404).end(); return; }
    const exists = await stat(file).then(s => s.isFile()).catch(() => false);
    if (!exists) {
      if (extname(url.pathname)) { res.writeHead(404).end(); return; }
      file = resolve(root, 'index.html');
    }
    res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600');
    res.end(req.method === 'HEAD' ? undefined : await readFile(file));
  } catch { res.writeHead(500, { 'Content-Type': 'application/json' }).end('{"error":"server error"}'); }
});
server.requestTimeout = 30_000;
server.listen(port, host, () => console.log('Intent ready at http://' + host + ':' + port));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
  server.close(() => { void Promise.allSettled([...pending]).then(() => process.exit(0)); });
  setTimeout(() => process.exit(1), 50_000).unref();
});
