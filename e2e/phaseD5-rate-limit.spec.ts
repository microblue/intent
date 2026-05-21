import { test, expect } from '@playwright/test';

/**
 * D5 — chat send rate limit (mock-mode).
 *
 * `src/routes/IntentHome.tsx → useChatThread.send` holds a
 * `createSendRateLimiter()` (5 sends per 10s sliding window). When the
 * window fills, further sends short-circuit before any persistence /
 * gateway call and surface a friendly toast ("发得太快啦, 稍等 N 秒再说").
 *
 * Mock-mode test: there's no real gateway to spam, but the user-message
 * persistence + toast layer behave identically — we can fire 20
 * messages, count how many actually landed in the thread, and verify
 * the rate-limit toast appeared.
 */

test.describe.configure({ mode: 'serial' });

test.describe('D5 — chat send rate limit', () => {
  test.skip(({ isMobile }) => isMobile === true, 'desktop layout — composer button text differs on mobile');

  test('20 rapid sends → at most 5 land in the thread + backoff toast surfaces', async ({ page }) => {
    test.setTimeout(30_000);
    await page.goto('/intent/birthday');
    const composer = page.getByPlaceholder(/想到什么直接说就好/);
    await expect(composer).toBeVisible();
    const sendBtn = page.getByRole('button', { name: '发送' });

    // Use a uniquely-prefixed message body so we can count exact landings.
    const tag = `D5-rl-${Date.now()}`;

    for (let i = 0; i < 20; i++) {
      await composer.fill(`${tag} ${i}`);
      await sendBtn.click({ noWaitAfter: true });
    }

    // Backoff toast appears (single toast, deduplicated via toast id).
    await expect(page.getByText(/发得太快啦/)).toBeVisible({ timeout: 5_000 });

    // No more than the limiter's max sneak through. Use a generous
    // bound (≤ 5 — the window starts empty so 5 should land) and check
    // that we're well below the 20 fired.
    const landed = await page.locator(`[data-role="user"]:has-text("${tag}")`).count();
    expect(
      landed,
      `expected ≤5 of the 20 rapid sends to persist, got ${landed}`,
    ).toBeLessThanOrEqual(5);
    expect(landed).toBeGreaterThan(0);
  });
});
