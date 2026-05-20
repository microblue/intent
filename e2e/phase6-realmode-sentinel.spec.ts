import { test, expect } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';
import { createTestUser, deleteTestUser } from './helpers/test-user';

/**
 * Phase 6 — sentinel-claw flow smoke for a brand-new user.
 *
 * The myclaw `handle_new_auth_user()` trigger provisions a sentinel
 * claw (plan_id='aios-prototype', subdomain=null) on every signup so
 * the SPA's claw-gate doesn't lock newcomers out. From the user's
 * POV: they sign up, land on IntentList, and should see the
 * "还差一步,才能真正开始" banner that links to myclaw.one/aios/install.
 *
 * This spec drives that with an isolated throwaway user (so we don't
 * trample the shared REAL_TEST_EMAIL). Cleanup deletes the user;
 * CASCADE removes the sentinel claw + public.users mirror.
 */

const skipUnlessRealMode = () => {
  if (
    !process.env.PLAYWRIGHT_BASE_URL ||
    !process.env.SUPABASE_URL
  ) {
    test.skip(true, 'sentinel smoke needs PLAYWRIGHT_BASE_URL + VERCEL_AUTOMATION_BYPASS + SUPABASE_URL');
  }
};

test.describe.configure({ mode: 'serial' });

test.describe('Phase 6 — sentinel-claw flow (brand-new user)', () => {
  test.beforeEach(skipUnlessRealMode);
  test.skip(({ isMobile }) => isMobile === true, 'desktop-only smoke');

  test('new signup with only the sentinel claw sees the "open a real claw" banner', async ({
    page,
    context,
  }) => {
    test.setTimeout(60_000);
    const user = await createTestUser();
    try {
      // Inject a session for the just-created user — same path as
      // existing real-mode specs, but for this isolated identity.
      await injectRealSession(context, user.email);

      await unlockVercelPreview(page);
      await page.goto('/');

      // The sentinel banner is the load-bearing UX for this state.
      // It surfaces only when (a) signed in, (b) real-mode build,
      // (c) every claw the user owns is the sentinel placeholder.
      await expect(page.getByTestId('sentinel-claw-banner')).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByTestId('sentinel-claw-banner')).toContainText(
        '还差一步',
      );
      // CTA links out to myclaw.one — verify the href, don't navigate
      // (Vercel preview can't follow cross-origin during this test).
      const cta = page.getByTestId('sentinel-claw-cta');
      await expect(cta).toBeVisible();
      await expect(cta).toHaveAttribute('href', /myclaw\.one\/aios\/install/);

      // ClawPicker hides when there's no real claw (only sentinel).
      await expect(page.getByTestId('claw-picker')).toHaveCount(0);
    } finally {
      await deleteTestUser(user.id);
    }
  });
});
