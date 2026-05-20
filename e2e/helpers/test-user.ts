import type { BrowserContext } from '@playwright/test';
import { injectRealSession } from './real-session';

/**
 * Provision a brand-new auth user via Supabase admin API. Useful for
 * tests that need an isolated identity (e.g. sentinel-claw flow) and
 * shouldn't pollute the shared REAL_TEST_EMAIL session cache.
 *
 * Cleanup: call `deleteTestUser(id)` in finally. CASCADE on
 * auth.users → public.users + public.claws drops the auto-provisioned
 * sentinel claw and any other rows automatically.
 */

interface CreatedTestUser {
  id: string;
  email: string;
}

export async function createTestUser(): Promise<CreatedTestUser> {
  const url = process.env.SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY!;
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const email = `aios-e2e-${stamp}@myclaw.test`;
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email,
      email_confirm: true,
      // Random throwaway password — never used, but Supabase requires
      // *something* to create the user.
      password: `pw-${stamp}-${Math.random().toString(36).slice(2)}`,
    }),
  });
  if (!res.ok) throw new Error(`createTestUser failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { id: string; email: string };
  return { id: body.id, email: body.email };
}

export async function deleteTestUser(id: string): Promise<void> {
  const url = process.env.SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY!;
  await fetch(`${url}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: { apikey: key, authorization: `Bearer ${key}` },
  });
}

/** Combines createTestUser + injectRealSession. */
export async function provisionedSession(
  context: BrowserContext,
): Promise<CreatedTestUser> {
  const user = await createTestUser();
  await injectRealSession(context, user.email);
  return user;
}
