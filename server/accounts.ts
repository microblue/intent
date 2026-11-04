/** Username + password login, hashed with scrypt from the runtime's own crypto. */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// Synchronous on purpose: Bun's threaded async scrypt intermittently returned
// wrong hashes on a small 2-vCPU VM. Logins are rare; ~50 ms of CPU is fine.
const scrypt = async (pw: string, salt: Buffer, len: number) => scryptSync(pw, salt, len);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, saltHex, hashHex] = stored.split('$');
  if (kind !== 'scrypt' || !saltHex || !hashHex) return false;
  const hash = await scrypt(password, Buffer.from(saltHex, 'hex'), 32);
  const want = Buffer.from(hashHex, 'hex');
  return want.length === hash.length && timingSafeEqual(want, hash);
}

/** Letters (any language), digits, dot, dash, underscore; case-insensitive. */
export function normalizeUsername(raw: string): string | null {
  const name = raw.trim().toLowerCase();
  return /^[\p{L}\p{N}._-]{2,32}$/u.test(name) ? name : null;
}

/** Slow down password guessing: at most 10 failures per key per 10 minutes. */
const failures = new Map<string, { n: number; until: number }>();
export function tooManyFailures(key: string): boolean {
  const f = failures.get(key);
  return !!f && f.until > Date.now() && f.n >= 10;
}
export function noteFailure(key: string) {
  const f = failures.get(key);
  if (!f || f.until < Date.now()) failures.set(key, { n: 1, until: Date.now() + 600_000 });
  else f.n++;
}
