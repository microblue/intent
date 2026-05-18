import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserContext } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Test-only auth helpers.
 *
 * Sign-in via real Supabase requires an actual test user (TODO Phase 3:
 * provision e2e+phase2@myclaw.test with a stable password). For now we
 * stub a Supabase session directly into localStorage so we can exercise
 * the signed-in chrome (sidebar account dropdown, sign-out flow, etc.)
 * without ever hitting auth.signInWithPassword.
 *
 * Why this works: `supabase.auth.getSession()` reads its session from
 * localStorage under the project-namespaced key. The session blob's
 * `expires_at` is checked client-side; signatures are validated only by
 * the server. So a future-dated fake session presents as "signed in"
 * for any client-side UI logic, which is exactly what we want to test.
 *
 * Why we don't validate against the real Supabase backend in e2e:
 *   - Creating real test users pollutes the prod project's auth.users
 *   - Email confirmation flows can't be e2e'd without inbox access
 *   - Slow + flaky compared to in-browser stubbing
 *
 * Path of the storage key: `sb-<project-ref>-auth-token`, where the ref
 * is derived from VITE_SUPABASE_URL's subdomain. We read .env.local once
 * at test startup so the test stays in sync with whichever project the
 * app is pointing at.
 */

function readProjectRef(): string {
  // .env.local lives at the repo root; this file is at e2e/helpers/.
  const envPath = resolve(__dirname, '../../.env.local');
  const raw = readFileSync(envPath, 'utf-8');
  const line = raw.split('\n').find((l) => l.startsWith('VITE_SUPABASE_URL='));
  if (!line) {
    throw new Error(
      'VITE_SUPABASE_URL not found in .env.local — e2e auth-stub needs it ' +
        'to compute the Supabase localStorage key',
    );
  }
  const url = line.replace(/^VITE_SUPABASE_URL=/, '').trim().replace(/^["']|["']$/g, '');
  const host = new URL(url).hostname;
  const ref = host.split('.')[0];
  if (!ref) throw new Error(`Could not extract project ref from "${url}"`);
  return ref;
}

export const SUPABASE_STORAGE_KEY = `sb-${readProjectRef()}-auth-token`;

/** Inject a "signed-in" Supabase session into the context's localStorage. */
export async function stubSupabaseSession(
  context: BrowserContext,
  user: { id?: string; email: string } = { email: 'e2e@myclaw.test' },
) {
  const id = user.id ?? '00000000-0000-0000-0000-000000000001';
  // 24h in the future — far enough that supabase-js won't try to refresh
  // during the test.
  const expiresAt = Math.floor(Date.now() / 1000) + 24 * 3600;
  // A JWT-shaped string. The body decodes to a session payload supabase
  // helpers may peek at; signature is unverified on the client.
  const fakeJwtBody = Buffer.from(
    JSON.stringify({
      aud: 'authenticated',
      role: 'authenticated',
      sub: id,
      email: user.email,
      exp: expiresAt,
    }),
  )
    .toString('base64url')
    .replace(/=+$/, '');
  const accessToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${fakeJwtBody}.fake-signature`;

  const session = {
    access_token: accessToken,
    token_type: 'bearer',
    expires_at: expiresAt,
    expires_in: 24 * 3600,
    refresh_token: 'fake-refresh-token-e2e',
    user: {
      id,
      aud: 'authenticated',
      role: 'authenticated',
      email: user.email,
      email_confirmed_at: new Date().toISOString(),
      phone: '',
      confirmed_at: new Date().toISOString(),
      last_sign_in_at: new Date().toISOString(),
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      identities: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };

  const payload = JSON.stringify(session);
  await context.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, value);
    },
    { key: SUPABASE_STORAGE_KEY, value: payload },
  );
}
