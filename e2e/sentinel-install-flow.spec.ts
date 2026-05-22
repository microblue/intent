import { test, expect } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';
import { createTestUser, deleteTestUser } from './helpers/test-user';

/**
 * H1 — sentinel-claw install flow: end-to-end UX for a brand-new user.
 *
 * Verifies the two redemption paths exposed by IntentList's sentinel
 * banner:
 *   1. Primary CTA "去开一台 →" links out to myclaw.one/aios/install.
 *   2. Secondary CTA "已经有激活码?点这儿激活" opens the activation
 *      modal; submitting a key redirects to
 *      myclaw.one/aios/install?key=<encoded>.
 *
 * For (2) we intercept the top-level navigation via page.route and
 * abort it before the browser actually loads myclaw.one — we only
 * care that the SPA dispatched the user to the right URL; the
 * downstream redeem flow lives in the sibling repo and has its own
 * tests.
 */

const skip = () => {
  if (
    !process.env.PLAYWRIGHT_BASE_URL ||
    !process.env.SUPABASE_URL ||
    !(process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY)
  ) {
    test.skip(
      true,
      'sentinel install spec needs PLAYWRIGHT_BASE_URL + SUPABASE_URL + service-role key',
    );
  }
};

test.describe.configure({ mode: 'serial' });

test.describe('H1 — sentinel-claw install flow', () => {
  test.beforeEach(skip);
  test.skip(({ isMobile }) => isMobile === true, 'desktop-only smoke');

  test('new user sees banner, secondary CTA redirects to install with the key', async ({
    page,
    context,
  }) => {
    test.setTimeout(60_000);
    const user = await createTestUser();
    try {
      await injectRealSession(context, user.email);

      // Intercept the cross-origin navigation so the test doesn't
      // actually leave for myclaw.one. We record the URL the SPA tried
      // to navigate to and abort the request.
      const navigations: string[] = [];
      await page.route('https://myclaw.one/**', async (route) => {
        navigations.push(route.request().url());
        await route.abort('aborted');
      });

      await unlockVercelPreview(page);
      await page.goto('/');

      const banner = page.getByTestId('sentinel-claw-banner');
      await expect(banner).toBeVisible({ timeout: 10_000 });
      await expect(banner).toContainText('还差一步');

      // Primary CTA still links out to the install page.
      const primary = page.getByTestId('sentinel-claw-cta');
      await expect(primary).toHaveAttribute('href', /myclaw\.one\/aios\/install$/);

      // Secondary CTA opens the activation modal.
      const secondary = page.getByTestId('sentinel-activation-cta');
      await expect(secondary).toBeVisible();
      await secondary.click();

      const modal = page.getByTestId('activation-key-modal');
      await expect(modal).toBeVisible();

      const input = page.getByTestId('activation-key-input');
      const fakeKey = 'MYCL-TEST-0000-0001';
      await input.fill(fakeKey);

      await page.getByTestId('activation-key-submit').click();

      // Give the navigation a beat to fire + be intercepted.
      await page.waitForTimeout(500);

      expect(
        navigations.length,
        `expected exactly one navigation to myclaw.one, got: ${JSON.stringify(navigations)}`,
      ).toBeGreaterThanOrEqual(1);
      const url = new URL(navigations[0]!);
      expect(url.origin).toBe('https://myclaw.one');
      expect(url.pathname).toBe('/aios/install');
      expect(url.searchParams.get('key')).toBe(fakeKey);
    } finally {
      await deleteTestUser(user.id);
    }
  });
});
