import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

let secret: string | undefined;
function getSecret(): string {
  if (secret) return secret;
  if (process.env.INTENT_SESSION_SECRET) return (secret = process.env.INTENT_SESSION_SECRET);
  const path = (process.env.INTENT_DATA_FILE ?? join(process.cwd(), '.data', 'intent-dev.json')) + '.session-key';
  try { secret = readFileSync(path, 'utf8'); }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    mkdirSync(dirname(path), { recursive: true });
    secret = randomBytes(32).toString('hex');
    writeFileSync(path, secret, { mode: 0o600, flag: 'wx' });
  }
  return secret;
}
const sign = (id: string) => createHmac('sha256', getSecret()).update(id).digest('hex');
export function sessionUser(req: Request): string | null {
  const cookie = req.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith('intent_session='));
  const [id, signature] = (cookie?.slice('intent_session='.length) ?? '').split('.');
  if (!id || !/^[a-f0-9]{64}$/.test(id) || !signature || !/^[a-f0-9]{64}$/.test(signature)) return null;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(sign(id))) ? id : null;
}
export function newSession(req: Request): Response {
  if (sessionUser(req)) return Response.json({ ok: true });
  const id = randomBytes(32).toString('hex');
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return Response.json({ ok: true }, { headers: {
    'Set-Cookie': 'intent_session=' + id + '.' + sign(id) + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000' + secure,
    'Cache-Control': 'no-store',
  } });
}
export function isSameOrigin(req: Request): boolean {
  if (req.headers.get('sec-fetch-site') === 'cross-site') return false;
  const origin = req.headers.get('origin');
  return !origin || origin === new URL(req.url).origin;
}
