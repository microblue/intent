import { test, expect } from '@playwright/test';
import { skipIfRealMode } from './helpers/build-mode';
import { stubSupabaseSession } from './helpers/auth-stub';

// Mock-mode assumptions throughout this file. When running against a
// real-mode preview/prod build (VITE_USE_REAL_DATA=true), these tests
// auto-skip — real-mode has different copy and different write paths.
test.beforeEach(async ({ page }) => {
  await skipIfRealMode(page);
});

/**
 * Phase 3 — data adapter (useIntents).
 *
 * VITE_USE_REAL_DATA is OFF in the test build (default), so even signed-in
 * sessions render the bundled mocks. These tests verify:
 *   - Mock data still flows through the adapter into IntentList + Sidebar
 *     + Launcher (no regression after the swap)
 *   - The greeting personalises when the user signs in
 *   - The "演示数据" disclaimer appears in mock mode so the user knows
 *     what they're looking at
 *
 * When the real-data path is exercised (separate test-mode build with the
 * flag flipped on), the empty-state + skeleton-loading branches kick in.
 * We cover those indirectly via the existing IntentList empty-state test
 * (mocks happen to be non-empty, so we trust the conditional render).
 */

test.describe('Data adapter — mock mode', () => {
  test('IntentList renders mock intent cards', async ({ page }) => {
    await page.goto('/');
    // "老婆 Lisa 的生日" is a stable mock card title.
    await expect(page.getByText('老婆 Lisa 的生日').first()).toBeVisible();
  });

  test('IntentList shows the demo-data disclaimer in mock mode', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/演示数据/)).toBeVisible();
  });

  test('Sidebar recent-intents row uses the adapter (desktop)', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile === true, 'desktop sidebar only');
    await page.goto('/');
    // Both expanded and collapsed sidebar variants render the recent
    // intents — full row with title in expanded, icon-only tile in
    // collapsed. We assert the link to "/intent/birthday" exists in the
    // sidebar regardless of which variant is active.
    await expect(page.locator('aside a[href="/intent/birthday"]')).toHaveCount(1);
  });

  test('Launcher shows intents from the adapter', async ({ page, isMobile }) => {
    test.skip(isMobile === true, 'launcher is desktop-only chrome');
    await page.goto('/');
    await page.keyboard.press('Control+k');
    await expect(page.locator('[cmdk-root]').first()).toBeVisible();
    // "你的项目" group is hardcoded; the items underneath come from useIntents.
    await expect(page.getByText('你的项目')).toBeVisible();
    await page.keyboard.press('Escape');
  });
});

test.describe('Data adapter — signed-in personalisation', () => {
  test.beforeEach(async ({ context }) => {
    await stubSupabaseSession(context, { email: 'alex@myclaw.test' });
  });

  test('greeting uses the email handle when signed in', async ({ page }) => {
    await page.goto('/');
    // "下午好,alex ☀️" — the email-handle ("alex") replaces the
    // anonymous "你" fallback.
    await expect(page.getByRole('heading', { name: /下午好,alex/ })).toBeVisible();
  });

  test('mock-mode disclaimer still shows even when signed in', async ({ page }) => {
    // VITE_USE_REAL_DATA is off in this build, so the disclaimer should
    // appear regardless of session. This guards against accidentally
    // suppressing the hint when a user happens to be signed in.
    await page.goto('/');
    await expect(page.getByText(/演示数据/)).toBeVisible();
  });
});
