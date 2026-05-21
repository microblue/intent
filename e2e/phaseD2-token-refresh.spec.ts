import { test, expect } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * D2 — token-refresh on WS reconnect.
 *
 * The gateway client (`src/gateway/client.ts`) calls
 * `getCredentials()` on every (re)connect attempt. That callback is
 * `mintClawToken(clawId)` (`src/gateway/mint.ts`), which POSTs to
 * the `mint-claw-token` Supabase Edge Function for a fresh,
 * short-lived JWT. So a mid-stream WS close should produce a
 * brand-new mint request before the next socket opens.
 *
 * This spec verifies the contract:
 *
 *   1. Sign in, open an intent, wait for ClawStatus → connected
 *      (first mint already happened during the initial connect).
 *   2. Snapshot `mint-claw-token` call count from a route handler.
 *   3. Force the WS to drop via `window.__aios.simulateGatewayWsClose()`
 *      (the test escape hatch in src/main.tsx).
 *   4. Wait for ClawStatus to flip back to `connected`.
 *   5. Assert the mint endpoint was hit at least one additional
 *      time — the reconnect picked up a fresh JWT.
 */

const skip = () => {
  if (
    !process.env.PLAYWRIGHT_BASE_URL ||
    !process.env.REAL_TEST_EMAIL ||
    !process.env.SUPABASE_URL
  ) {
    test.skip(true, 'D2 needs PLAYWRIGHT_BASE_URL + REAL_TEST_EMAIL + SUPABASE_URL');
  }
};

test.describe.configure({ mode: 'serial' });

test.describe('D2 — WS reconnect picks up a fresh mint JWT', () => {
  test.beforeEach(skip);
  test.skip(({ isMobile }) => isMobile === true, 'desktop sweep');

  test('forced WS close → mint endpoint hit again → ClawStatus reaches connected', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);

    // Count mint calls without disturbing the response (pass-through).
    let mintCalls = 0;
    await context.route('**/functions/v1/mint-claw-token', async (route) => {
      mintCalls += 1;
      await route.continue();
    });

    await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await unlockVercelPreview(page);
    await page.goto('/');

    // Wait for the initial gateway connect — ClawStatus surfaces in
    // the sidebar AccountFooter and `data-status=connected` once the
    // mint → WS open → connect handshake completes.
    const status = page.getByTestId('claw-status');
    await expect(status).toBeVisible({ timeout: 15_000 });
    await expect(status).toHaveAttribute('data-status', 'connected', { timeout: 20_000 });

    // Initial connect produced at least one mint.
    expect(mintCalls).toBeGreaterThanOrEqual(1);
    const mintsBefore = mintCalls;

    // Wait for the test escape hatch to be mounted (env stamp).
    await page.waitForFunction(
      () =>
        typeof (window as unknown as { __aios?: { simulateGatewayWsClose?: unknown } })
          .__aios?.simulateGatewayWsClose === 'function',
      undefined,
      { timeout: 5_000 },
    );

    // Force the WS to drop. The built-in close handler in
    // `GatewayClient.handleClose` schedules a reconnect, which
    // re-invokes `getCredentials()` (= mint).
    await page.evaluate(() => {
      (window as unknown as { __aios: { simulateGatewayWsClose: () => void } }).__aios.simulateGatewayWsClose();
    });

    // Briefly we'll see a non-connected state (reconnecting), then
    // back to connected after the fresh mint + WS open.
    await expect(status).not.toHaveAttribute('data-status', 'connected', { timeout: 8_000 });
    await expect(status).toHaveAttribute('data-status', 'connected', { timeout: 30_000 });

    // The reconnect should have produced at least one additional
    // mint call beyond the snapshot.
    expect(mintCalls).toBeGreaterThan(mintsBefore);
  });
});
