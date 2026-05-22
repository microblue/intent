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
 * We monkey-patch `window.location.assign` via addInitScript so we can
 * observe the redirect target without leaving the test origin (the
 * actual redemption lives on myclaw.one — out of scope for the SPA's
 * verification).
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

      // Stash any window.location.assign call so we can read it back
      // out from the page context once the user submits the key.
      await context.addInitScript(() => {
        const w = window as typeof window & {
          __assignSpy?: string[];
        };
        w.__assignSpy = [];
        const original = window.location.assign.bind(window.location);
        try {
          window.location.assign = (url: string | URL) => {
            w.__assignSpy!.push(String(url));
          };
        } catch {
          // Older browsers may guard location; in that case keep the
          // original behaviour and the test will fail loudly on the
          // assertion below.
          void original;
        }
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

      // The submit handler called window.location.assign with the
      // install URL + encoded key.
      const assigned = await page.evaluate(() => {
        const w = window as typeof window & { __assignSpy?: string[] };
        return w.__assignSpy ?? [];
      });
      expect(assigned).toHaveLength(1);
      const url = new URL(assigned[0]!);
      expect(url.origin).toBe('https://myclaw.one');
      expect(url.pathname).toBe('/aios/install');
      expect(url.searchParams.get('key')).toBe(fakeKey);

      // Modal closes after submit.
      await expect(modal).toBeHidden({ timeout: 2_000 });
    } finally {
      await deleteTestUser(user.id);
    }
  });
});
