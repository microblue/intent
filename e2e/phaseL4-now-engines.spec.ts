import { test, expect } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * L4 — /now activity sections + /settings/engines (dev mode only).
 *
 * /now in real-mode: approvals come from Supabase; running + done
 * activity is still mock-sourced (agent traces table not built yet).
 * Verify the page renders cleanly with the empty-state when no
 * approvals exist for this user.
 *
 * /settings/engines: dev mode page. Available without toggle for
 * direct URL access; renders the platform topology layout.
 */

const skip = () => {
  if (!process.env.PLAYWRIGHT_BASE_URL || !process.env.REAL_TEST_EMAIL || !process.env.SUPABASE_URL) {
    test.skip(true, 'L4 needs PLAYWRIGHT_BASE_URL + REAL_TEST_EMAIL + SUPABASE_URL');
  }
};

test.describe.configure({ mode: 'serial' });

test.describe('L4 — /now real-mode (desktop)', () => {
  test.beforeEach(skip);
  test.skip(({ isMobile }) => isMobile === true, 'desktop sweep');

  test('renders 正在为你做的事 header + handles empty approvals gracefully', async ({
    page,
    context,
  }) => {
    await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await unlockVercelPreview(page);
    await page.goto('/now');
    await expect(page.getByRole('heading', { level: 1, name: /正在为你做的事/ })).toBeVisible();
    // With no current approvals + no active intents, the empty-state
    // copy should be reachable. Loose match because mock data may seed
    // some running activity for the demo profile.
    const empty = page.getByText(/现在很安静/);
    const anySection = page.getByRole('heading', { name: /等你点头|正在做|刚刚做完/ });
    // At least one of: empty state OR a real section should be visible.
    await Promise.race([
      empty.first().waitFor({ state: 'visible', timeout: 5_000 }).then(() => 'empty'),
      anySection.first().waitFor({ state: 'visible', timeout: 5_000 }).then(() => 'section'),
    ]).catch(() => {
      // If neither hit, fail explicitly so we know there's a layout regression.
      throw new Error('/now showed neither empty-state nor any activity section');
    });
  });
});

test.describe('L4 — /settings/engines dev page', () => {
  test.beforeEach(skip);
  test.skip(({ isMobile }) => isMobile === true, 'desktop sweep');

  test('renders the platform topology', async ({ page, context }) => {
    await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await unlockVercelPreview(page);
    await page.goto('/settings/engines');
    await expect(page.getByRole('heading', { level: 1, name: /底层引擎/ })).toBeVisible();
    // Topology cards reference the actual platforms.
    await expect(page.getByText(/Supabase/i).first()).toBeVisible();
    await expect(page.getByText(/OpenClaw/i).first()).toBeVisible();
  });
});
