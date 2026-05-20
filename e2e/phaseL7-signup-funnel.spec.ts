import { test, expect } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { deleteTestUser } from './helpers/test-user';

/**
 * L7 — real signup funnel: brand new user fills the form, submits, and
 * lands on / with the sentinel-claw banner.
 *
 * Cleanup: delete the auth user; CASCADE drops the sentinel claw +
 * user_preferences + public.users mirror.
 *
 * Email/password sign-up needs a real email format Supabase accepts.
 * We use the `e2e+<stamp>@myclaw.dev` pattern; the project allows it
 * because email confirmation is disabled (handle_new_auth_user fires
 * synchronously on INSERT into auth.users).
 */

async function findUserIdByEmail(email: string): Promise<string | null> {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY!;
  const res = await fetch(`${url}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
  });
  const body = (await res.json()) as { users?: { id: string; email: string }[] };
  return body.users?.find((u) => u.email === email)?.id ?? null;
}

const skip = () => {
  if (!process.env.PLAYWRIGHT_BASE_URL || !process.env.SUPABASE_URL) {
    test.skip(true, 'L7 needs PLAYWRIGHT_BASE_URL + SUPABASE_URL');
  }
};

test.describe.configure({ mode: 'serial' });

test.describe('L7 — signup funnel (brand new user)', () => {
  test.beforeEach(skip);
  test.skip(({ isMobile }) => isMobile === true, 'desktop sweep');

  test('email/password signup → land on / → sentinel banner', async ({ page }) => {
    test.setTimeout(60_000);
    const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const email = `aios-e2e-signup-${stamp}@myclaw.test`;
    const password = `pw-${stamp}-${Math.random().toString(36).slice(2)}`;

    try {
      await unlockVercelPreview(page);
      await page.goto('/auth/signin');

      // Toggle to sign-up mode.
      await page.getByRole('button', { name: /^注册$|没账号|注册一个/ }).first().click();
      // Fill the form.
      await page.getByPlaceholder('your@email.com').fill(email);
      await page.locator('input[type="password"]').fill(password);
      // Submit.
      await page.getByRole('button', { name: /^注册$|创建账号/ }).first().click();

      // Email confirmation is OFF in this project → auto-signs in →
      // redirects to /. Wait for the route.
      await page.waitForURL(/\/$/, { timeout: 15_000 });

      // Sentinel banner is the load-bearing UX for new accounts (only
      // claw is the auto-provisioned placeholder).
      await expect(page.getByTestId('sentinel-claw-banner')).toBeVisible({
        timeout: 10_000,
      });
    } finally {
      // Always clean up — regardless of pass/fail.
      const id = await findUserIdByEmail(email);
      if (id) await deleteTestUser(id);
    }
  });
});
