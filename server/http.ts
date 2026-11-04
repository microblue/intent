/**
 * The whole web surface on node:http (works in Node and Bun): the UI,
 * /api, the /_/ admin page, health check. No framework.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { handle } from './api';
import { handleAdmin } from './admin';
import type { Deps } from './deps';

export type Asset = { body: Uint8Array; type: string };
export type Assets = (path: string) => Asset | undefined;

export interface LogLine { at: string; method: string; path: string; status: number; ms: number }
const LOG_MAX = 300;
export const requestLog: LogLine[] = [];
export const started = Date.now();

const MAX_BODY = 32768;

export function createIntentServer(deps: Deps, assets: Assets): { server: Server; pending: Set<Promise<unknown>> } {
  const pending = new Set<Promise<unknown>>();
  const background = (p: Promise<unknown>) => {
    const job = p.catch((e) => console.error('[intent] background task failed', e));
    pending.add(job);
    void job.finally(() => pending.delete(job));
  };

  const server = createServer(async (req, res) => {
    const t0 = Date.now();
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    let path = '/';
    res.once('close', () => log(req.method ?? 'GET', path, res.statusCode, Date.now() - t0));
    try {
      const proto = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
      const url = new URL(req.url ?? '/', `${proto}://${req.headers.host ?? 'localhost'}`);
      path = url.pathname;
      if (path === '/healthz' && req.method === 'GET') {
        return void res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ status: 'ok', product: 'intent', storage: 'tinybase+sqlite', runtime: deps.store.runtime }));
      }
      if (path.startsWith('/api/') || path === '/_' || path.startsWith('/_/')) {
        const body = await readBody(req);
        if (body === null) return void res.writeHead(413).end();
        const request = toRequest(url, req, body);
        const response = path.startsWith('/api/') ? await handle(request, deps, background) : await handleAdmin(request, deps);
        return void (await send(res, response, req));
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return void res.writeHead(405).end();
      const asset = assets(path) ?? (path.includes('.', path.lastIndexOf('/')) ? undefined : assets('/index.html'));
      if (!asset) return void res.writeHead(404).end();
      res.setHeader('Content-Type', asset.type);
      res.setHeader('Cache-Control', path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
      res.end(req.method === 'HEAD' ? undefined : asset.body);
    } catch (e) {
      console.error('[intent] request failed', e);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end('{"error":"server error"}');
    }
  });
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 65_000;
  return { server, pending };
}

function log(method: string, path: string, status: number, ms: number) {
  if (path.startsWith('/assets/') || path === '/healthz') return;
  requestLog.push({ at: new Date().toISOString(), method, path: path.replace(/[0-9a-f-]{36}/g, ':id'), status, ms });
  if (requestLog.length > LOG_MAX) requestLog.splice(0, requestLog.length - LOG_MAX);
}

async function readBody(req: IncomingMessage): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of req) {
    n += (c as Buffer).length;
    if (n > MAX_BODY) return null;
    chunks.push(Buffer.from(c as Buffer));
  }
  return Buffer.concat(chunks);
}

function toRequest(url: URL, req: IncomingMessage, body: Buffer): Request {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && body.length > 0;
  return new Request(url, { method: req.method, headers, body: hasBody ? body : undefined });
}

/** Write a Web Response to node's res; streams event-stream bodies. */
export async function send(res: ServerResponse, r: Response, req?: IncomingMessage): Promise<void> {
  res.statusCode = r.status;
  const cookies = r.headers.getSetCookie?.() ?? [];
  r.headers.forEach((v, k) => { if (k !== 'set-cookie') res.setHeader(k, v); });
  if (cookies.length) res.setHeader('Set-Cookie', cookies);
  if (r.body && r.headers.get('content-type')?.startsWith('text/event-stream')) {
    res.flushHeaders();
    const reader = r.body.getReader();
    const stop = () => { void reader.cancel().catch(() => {}); };
    req?.on('close', stop);
    res.on('close', stop);
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    } catch { /* client went away */ }
    res.end();
    return;
  }
  res.end(Buffer.from(await r.arrayBuffer()));
}
