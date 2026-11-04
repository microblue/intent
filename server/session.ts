import { createHmac, timingSafeEqual } from 'node:crypto';

/** Set once at startup from the database (or INTENT_SESSION_SECRET). */
let secret: string | undefined;
export function setSessionSecret(s: string) { secret = s; }
function getSecret(): string {
  if (!secret) throw new Error('session secret not initialised');
  return secret;
}

/** HMAC for other signed tokens (e.g. the admin cookie), separated by purpose. */
export const sign = (purpose: string, data: string) => createHmac('sha256', getSecret()).update(purpose + ':' + data).digest('hex');
const userSig = (id: string) => createHmac('sha256', getSecret()).update(id).digest('hex');

export function readCookie(req: Request, name: string): string | undefined {
  return req.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))?.slice(name.length + 1);
}

export function sessionUser(req: Request): string | null {
  const [id, signature] = (readCookie(req, 'intent_session') ?? '').split('.');
  if (!id || !/^[a-f0-9]{64}$/.test(id) || !signature || !/^[a-f0-9]{64}$/.test(signature)) return null;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(userSig(id))) ? id : null;
}

export function isHttps(req: Request) {
  return new URL(req.url).protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';
}
const secure = (req: Request) => (isHttps(req) ? '; Secure' : '');

/** Cookie that makes this browser act as user `id`. */
export function sessionCookie(req: Request, id: string): string {
  return 'intent_session=' + id + '.' + userSig(id) + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000' + secure(req);
}
export function clearSessionCookie(req: Request): string {
  return 'intent_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' + secure(req);
}

export function newSession(req: Request, newId: () => string): Response {
  if (sessionUser(req)) return Response.json({ ok: true });
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': sessionCookie(req, newId()), 'Cache-Control': 'no-store' } });
}

/** Reject cross-site writes. INTENT_PUBLIC_ORIGIN may list extra allowed origins. */
export function isSameOrigin(req: Request): boolean {
  if (req.headers.get('sec-fetch-site') === 'cross-site') return false;
  const origin = req.headers.get('origin');
  if (!origin) return true;
  const allowed = new Set([new URL(req.url).origin, ...(process.env.INTENT_PUBLIC_ORIGIN ?? '').split(',').map(s => s.trim()).filter(Boolean)]);
  return allowed.has(origin);
}
