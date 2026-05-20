import { test, expect } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * Phase 7 — /new wizard creates an intent end-to-end in real-mode.
 *
 * Validates: signed-in user types a prompt, hits the wizard's "start
 * directly" path, lands on /intent/<newId>, and the intent persists
 * in Supabase. Cleanup deletes the intent.
 */

interface SupabaseIntent { id: string; title: string }

function supabaseHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY!;
  return { apikey: key, authorization: `Bearer ${key}` };
}

async function fetchIntent(id: string): Promise<SupabaseIntent | null> {
  const url = process.env.SUPABASE_URL!;
  const res = await fetch(`${url}/rest/v1/intents?id=eq.${id}&select=id,title`, {
    headers: supabaseHeaders(),
  });
  const rows = (await res.json()) as SupabaseIntent[];
  return rows[0] ?? null;
}

async function deleteIntent(id: string): Promise<void> {
  const url = process.env.SUPABASE_URL!;
  await fetch(`${url}/rest/v1/intents?id=eq.${id}`, {
    method: 'DELETE',
    headers: supabaseHeaders(),
  });
}

const skipUnlessRealMode = () => {
  if (
    !process.env.PLAYWRIGHT_BASE_URL ||
    !process.env.REAL_TEST_EMAIL ||
    !process.env.SUPABASE_URL
  ) {
    test.skip(true, '/new real-mode smoke needs PLAYWRIGHT_BASE_URL + REAL_TEST_EMAIL + SUPABASE_URL');
  }
};

test.describe.configure({ mode: 'serial' });

test.describe('Phase 7 — /new wizard creates a real intent', () => {
  test.beforeEach(skipUnlessRealMode);
  test.skip(({ isMobile }) => isMobile === true, 'desktop-only');

  test('seed → 继续 → 先这样直接开始 → 开始这件事 → /intent/<id> + DB row', async ({
    page,
    context,
  }) => {
    test.setTimeout(60_000);
    await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await unlockVercelPreview(page);

    const seed = `phase7-${Date.now().toString(36)}-写一段欢迎语`;
    await page.goto(`/new?seed=${encodeURIComponent(seed)}`);

    // Wizard input prefilled by ?seed=…; hit 继续 to advance.
    await expect(page.locator('textarea')).toHaveValue(seed);
    await page.getByRole('button', { name: /继续/ }).click();

    // Bypass clarifying questions — go straight to preview.
    await page.getByRole('button', { name: /先这样.*开始/ }).click();
    await expect(
      page.getByRole('button', { name: /开始这件事/ }),
    ).toBeVisible({ timeout: 10_000 });

    // Capture console errors + sonner toast text so a real-mode create
    // failure doesn't masquerade as a navigation timeout.
    const consoleErrors: string[] = [];
    page.on('pageerror', (e) => consoleErrors.push(e.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // Commit. In real-mode this INSERTs the intent and routes to
    // /intent/<newId>.
    await page.getByRole('button', { name: /开始这件事/ }).click();
    // Race: navigation, spawn stage rendering, or a toast.
    const navP = page.waitForURL(/\/intent\/.+/, { timeout: 20_000 }).then(() => 'nav');
    const spawnP = page
      .getByText(/正在为你开起这件事/)
      .waitFor({ timeout: 20_000 })
      .then(() => 'spawn');
    const toastP = page
      .locator('[data-sonner-toast]')
      .waitFor({ timeout: 20_000 })
      .then(() => 'toast');
    const winner = await Promise.race([navP, spawnP, toastP]).catch(() => 'timeout');
    if (winner !== 'nav') {
      const toastText = await page
        .locator('[data-sonner-toast]')
        .first()
        .innerText()
        .catch(() => '<no toast>');
      throw new Error(
        `wizard did not navigate (winner=${winner}); toast="${toastText}"; consoleErrors=${JSON.stringify(consoleErrors)}`,
      );
    }
    const url = new URL(page.url());
    const intentId = url.pathname.split('/').pop() ?? '';
    expect(intentId).not.toBe('');

    try {
      const row = await fetchIntent(intentId);
      expect(row, `intent ${intentId} not found in DB`).not.toBeNull();
      // Title should derive from the seed (Phase 8 title extraction).
      expect(row!.title.length).toBeGreaterThan(0);
    } finally {
      await deleteIntent(intentId);
    }
  });
});
