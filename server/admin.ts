/**
 * Owner's admin page at /_/ — like PocketBase's dashboard, but small:
 * first-run setup, login, health, users, request log, backup download.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { hashPassword, noteFailure, tooManyFailures, verifyPassword } from './accounts';
import type { Deps } from './deps';
import { isHttps, isSameOrigin, readCookie, sign } from './session';
import { requestLog, started } from './http';
import { ADMIN_PAGE } from './admin-page';
import { VERSION } from './version';
import { cancelTurn } from './agent/turn';

let setupToken: string | null = null;
/** Called at startup when no admin password exists; the link is printed to the console. */
export function newSetupToken(): string { return (setupToken = randomBytes(16).toString('hex')); }

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });
const password = z.object({ password: z.string().min(8).max(128) });
const TTL = 12 * 3600;

function adminCookie(req: Request, hash: string, maxAge = TTL): string {
  const exp = String(Math.floor(Date.now() / 1000) + maxAge);
  const value = maxAge > 0 ? `${exp}.${sign('admin', exp + hash)}` : '';
  return `intent_admin=${value}; Path=/_/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${isHttps(req) ? '; Secure' : ''}`;
}
function isAdmin(req: Request, hash: string | undefined): boolean {
  const [exp, sig] = (readCookie(req, 'intent_admin') ?? '').split('.');
  if (!hash || !exp || !sig || Number(exp) < Date.now() / 1000) return false;
  const want = sign('admin', exp + hash);
  return sig.length === want.length && timingSafeEqual(Buffer.from(sig), Buffer.from(want));
}

export async function handleAdmin(req: Request, deps: Deps): Promise<Response> {
  const url = new URL(req.url);
  const { store } = deps;
  if (url.pathname === '/_') return new Response(null, { status: 308, headers: { Location: '/_/' } });
  if (url.pathname === '/_/' && req.method === 'GET') {
    return new Response(ADMIN_PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'" } });
  }
  if (!isSameOrigin(req)) return json({ error: 'cross-origin request' }, 403);
  const hash = store.getSetting('adminHash');
  const path = url.pathname.slice('/_/api/'.length);

  if (path === 'state' && req.method === 'GET') return json({ setupNeeded: !hash, authed: isAdmin(req, hash), version: VERSION });
  if (path === 'setup' && req.method === 'POST') {
    const p = password.extend({ token: z.string() }).safeParse(await req.json().catch(() => ({})));
    if (hash || !setupToken) return json({ error: 'already set up' }, 409);
    if (!p.success) return json({ error: 'password must be at least 8 characters' }, 400);
    if (p.data.token.length !== setupToken.length || !timingSafeEqual(Buffer.from(p.data.token), Buffer.from(setupToken))) return json({ error: 'invalid setup link' }, 403);
    const h = await hashPassword(p.data.password);
    await store.setSetting('adminHash', h);
    setupToken = null;
    return json({ ok: true }, 200, { 'Set-Cookie': adminCookie(req, h) });
  }
  if (path === 'login' && req.method === 'POST') {
    const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
    if (tooManyFailures('admin:' + ip)) return json({ error: 'too many attempts' }, 429);
    const p = password.safeParse(await req.json().catch(() => ({})));
    if (!hash || !p.success || !(await verifyPassword(p.data.password, hash))) { noteFailure('admin:' + ip); return json({ error: 'wrong password' }, 401); }
    return json({ ok: true }, 200, { 'Set-Cookie': adminCookie(req, hash) });
  }
  if (path === 'logout' && req.method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': adminCookie(req, '', 0) });

  if (!isAdmin(req, hash)) return json({ error: 'not signed in' }, 401);

  if (path === 'stats' && req.method === 'GET') {
    const mem = process.memoryUsage();
    const users = store.listUsers();
    return json({
      version: VERSION,
      runtime: store.runtime === 'bun' ? `Bun ${(globalThis as { Bun?: { version: string } }).Bun?.version}` : `Node ${process.version}`,
      platform: `${process.platform}-${process.arch}`,
      uptimeSec: Math.round((Date.now() - started) / 1000),
      rssMB: +(mem.rss / 1048576).toFixed(1),
      heapMB: +(mem.heapUsed / 1048576).toFixed(1),
      dbFile: store.file,
      dbKB: Math.round(store.bytesOnDisk() / 1024),
      provider: deps.chat.id,
      model: deps.models.main,
      counts: { ...store.counts(), users: users.length },
    });
  }
  if (path === 'users' && req.method === 'GET') return json(store.listUsers());
  const del = path.match(/^users\/([a-f0-9]{64})$/);
  if (del && req.method === 'DELETE') {
    for (const t of await store.listThings(del[1])) cancelTurn(t.id);
    await store.deleteUserData(del[1]);
    return json({ ok: true });
  }
  if (path === 'logs' && req.method === 'GET') return json([...requestLog].reverse());
  if (path === 'backup' && req.method === 'GET') {
    await store.flush();
    const out = join(tmpdir(), `intent-backup-${randomBytes(6).toString('hex')}.db`);
    try {
      store.backup(out);
      const data = readFileSync(out);
      const name = `intent-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.db`;
      return new Response(data, { headers: { 'Content-Type': 'application/vnd.sqlite3', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' } });
    } finally { rmSync(out, { force: true }); }
  }
  return json({ error: 'not found' }, 404);
}
