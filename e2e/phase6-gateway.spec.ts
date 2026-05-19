import { test, expect } from '@playwright/test';
import { stubSupabaseSession } from './helpers/auth-stub';

/**
 * Phase 6 — gateway WS scaffold smoke tests.
 *
 * The real gateway connection requires:
 *   1. myclaw `mint-claw-token` Edge Function (see docs/phase6-myclaw-prompt.md)
 *   2. cool-brook Caddyfile `/ws` reverse proxy (see docs/phase6-coolbrook-prompt.md)
 *   3. a real (non-sentinel) claw in the user's account
 *
 * Until all three land, aios shows the ClawStatus indicator but it
 * stays in an unreachable state. These tests cover the visibility
 * contract: mock-mode users see no indicator; the gateway client
 * scaffold is wired but inert.
 *
 * End-to-end "actually connected" verification belongs in a separate
 * real-mode preview deploy spec — same pattern we use for other Phase
 * 6+ data swaps.
 */

test.describe('Phase 6 ClawStatus indicator', () => {
  test('hidden in mock mode for anonymous viewer', async ({ page, isMobile }) => {
    test.skip(isMobile === true, 'sidebar indicator is desktop-only');
    await page.goto('/');
    await expect(page.getByTestId('claw-status')).toHaveCount(0);
  });

  test('hidden in mock mode even when signed-in', async ({
    page,
    context,
    isMobile,
  }) => {
    test.skip(isMobile === true, 'sidebar indicator is desktop-only');
    // VITE_USE_REAL_DATA=false in the local + prod build, so useGateway
    // short-circuits and the indicator stays hidden. This guards
    // against accidentally surfacing WS plumbing to demo users.
    await stubSupabaseSession(context, { email: 'gw-test@myclaw.test' });
    await page.goto('/');
    await expect(page.getByTestId('claw-status')).toHaveCount(0);
  });
});
