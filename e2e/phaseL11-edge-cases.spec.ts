import { test, expect } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * L11 — edge cases: bad / missing tokens, gateway unreachable.
 *
 * These probe what the SPA does when the world isn't perfect:
 *   - mint returns 401 → user-facing surfaces don't crash; ClawStatus
 *     reflects the state.
 *   - gateway WS URL refuses connection → ClawStatus shows reconnecting,
 *     toast on send.
 *
 * We intercept the relevant network calls via Playwright route() so
 * we don't have to muck with the real backend.
 */

const skip = () => {
  if (!process.env.PLAYWRIGHT_BASE_URL || !process.env.REAL_TEST_EMAIL || !process.env.SUPABASE_URL) {
    test.skip(true, 'L11 needs PLAYWRIGHT_BASE_URL + REAL_TEST_EMAIL + SUPABASE_URL');
  }
};

test.describe.configure({ mode: 'serial' });

test.describe('L11 — edge cases', () => {
  test.beforeEach(skip);
  test.skip(({ isMobile }) => isMobile === true, 'desktop sweep');

  test('mint endpoint returning 401 leaves ClawStatus in "正在连…" not crashed', async ({
    page,
    context,
  }) => {
    test.setTimeout(30_000);
    await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    // Force every mint call to 401.
    await page.route('**/functions/v1/mint-claw-token', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'simulated', code: 'invalid_jwt' }),
      }),
    );
    await unlockVercelPreview(page);
    await page.goto('/');
    // Status should NOT reach 'connected'; it'll cycle through
    // connecting / reconnecting / error.
    await page.waitForTimeout(5_000);
    const status = await page.getByTestId('claw-status').getAttribute('data-status');
    expect(['connecting', 'reconnecting', 'error']).toContain(status);
    // Page chrome (sidebar, content) should still render.
    await expect(page.getByRole('heading', { level: 1, name: /下午好|早上好|晚上好|你好/ })).toBeVisible();
  });

  test('mint endpoint returning 409 claw_not_ready surfaces in ClawPicker as not-connected', async ({
    page,
    context,
  }) => {
    test.setTimeout(30_000);
    await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await page.route('**/functions/v1/mint-claw-token', (route) =>
      route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'claw_not_ready', code: 'claw_not_ready' }),
      }),
    );
    await unlockVercelPreview(page);
    await page.goto('/');
    await page.waitForTimeout(5_000);
    const status = await page.getByTestId('claw-status').getAttribute('data-status');
    expect(['connecting', 'reconnecting', 'error', 'stopped']).toContain(status);
  });

  test('signed-out user navigating to /intent/<random> redirects to signin', async ({
    page,
  }) => {
    test.setTimeout(15_000);
    await unlockVercelPreview(page);
    await page.goto('/intent/nonexistent-claw-grants-no-row', { waitUntil: 'domcontentloaded' });
    // Either auth gate redirects, OR the page renders 找不到 / not-found state.
    // Both are acceptable for production — no crash.
    const url = page.url();
    if (/\/auth\/signin/.test(url)) return;
    // Otherwise expect a not-found or anonymous viewer state, NOT a crash.
    await expect(
      page
        .getByText(/找不到|没有这件事|演示数据|登录/)
        .first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
