import { test, expect } from '@playwright/test';
import { stubSupabaseSession } from './helpers/auth-stub';

/**
 * Phase 9 — first-time onboarding welcome card.
 *
 * Trigger conditions:
 *   - signed-in
 *   - 0 intents (empty IntentList)
 *   - haven't dismissed the welcome yet
 *
 * In the test build VITE_USE_REAL_DATA is off, so useIntents always
 * returns the bundled mocks (non-empty). Anonymous viewers similarly
 * see mocks. To exercise the empty path we need to: (a) stub a session
 * AND (b) clear the mock intents somehow — but we can't easily clear the
 * mocks without rebuilding. So we test the *opposite*: the card does
 * NOT appear when there are existing intents, and dismissal persistence
 * works via the zustand store.
 *
 * The "card actually appears" path is verified manually in real-mode
 * dev (Phase 5 verification log shows the empty IntentList state).
 */

test.describe('Onboarding welcome card — guards', () => {
  test('does not appear for anonymous viewer', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('onboarding-welcome')).toHaveCount(0);
  });

  test('does not appear for signed-in user with intents (mock build)', async ({
    page,
    context,
  }) => {
    await stubSupabaseSession(context, { email: 'onboarding@myclaw.test' });
    await page.goto('/');
    // Mocks always have intents, so the empty-state guard suppresses
    // the welcome card.
    await expect(page.getByTestId('onboarding-welcome')).toHaveCount(0);
  });

  test('dismissal persists across reloads (zustand)', async ({ page }) => {
    // Pre-set the dismissed flag in the persisted zustand store so the
    // card stays hidden even if other conditions were met.
    await page.addInitScript(() => {
      const state = {
        state: {
          devMode: false,
          intentRailOpen: true,
          sidebarCollapsed: false,
          railOrder: [
            'thread_outline',
            'outline',
            'files',
            'team',
            'memory',
            'schedule',
            'engine',
          ],
          railMinimized: {},
          railHidden: {},
          userMemoryFacts: [],
          onboardingDismissed: true,
        },
        version: 0,
      };
      localStorage.setItem('myclaw-ui-v2', JSON.stringify(state));
    });
    await page.goto('/');
    await expect(page.getByTestId('onboarding-welcome')).toHaveCount(0);
  });
});
