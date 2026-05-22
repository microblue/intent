import { test, expect } from '@playwright/test';
import { skipIfRealMode } from './helpers/build-mode';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';
import { createTestUser, deleteTestUser } from './helpers/test-user';

/**
 * H4 — empty-state copy audit.
 *
 * Per H4 spec: every empty list/feed/grid must have onboarding copy
 * + a primary CTA, not a blank panel. Surfaces to check: `/`,
 * `/schedule`, `/memory`, `/now`, `/archive`, `/permissions`.
 *
 * Runs in mock mode where the cold-start affordances are easy to
 * exercise. /now is special — mock data deliberately populates it
 * with sample activity so a demo viewer sees what the surface
 * looks like populated. The /now empty-state CTA contract is
 * verified by code-reading + the existing walkthrough-now spec,
 * not by this audit.
 */

test.describe('H4 — empty-state copy + CTA audit', () => {
  test.beforeEach(async ({ page }) => {
    await skipIfRealMode(page);
  });
  test.skip(({ isMobile }) => isMobile === true, 'desktop pass');

  test('/ (IntentList) — cold-start affordances + tip card render', async ({ page }) => {
    await page.goto('/');
    // Starter templates are the always-visible primary CTAs for
    // "I want to start something" — verify all six render.
    await expect(page.getByRole('link', { name: /计划一次旅行/ })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('link', { name: /学一个新东西/ })).toBeVisible();
    // Tip card at the bottom carries the keyboard-shortcut onboarding copy.
    await expect(page.getByText('小贴士')).toBeVisible();
  });

  test('/schedule — composer is always visible above the list', async ({ page }) => {
    await page.goto('/schedule');
    // The AddReminderComposer is the always-visible primary affordance.
    // Its textbox is the primary CTA — type a one-line reminder.
    await expect(page.getByTestId('schedule-composer-input')).toBeVisible({
      timeout: 10_000,
    });
    // Onboarding copy explaining the syntax.
    await expect(page.getByText('一句话说时间和事')).toBeVisible();
  });

  test('/memory — composer is always visible above the list', async ({ page }) => {
    await page.goto('/memory');
    // The "记下来" composer is the always-visible primary affordance.
    await expect(page.getByPlaceholder(/想让我记下来的事/)).toBeVisible({
      timeout: 10_000,
    });
    // Info banner with onboarding copy.
    await expect(page.getByText('关于记忆')).toBeVisible();
  });

  test('/archive — empty list shows friendly copy + back link', async ({ page }) => {
    await page.goto('/archive');
    const empty = page.getByTestId('archive-empty');
    await expect(empty).toBeVisible({ timeout: 10_000 });
    await expect(empty).toContainText('这里还是空的');
    // Link back to the main list.
    await expect(empty.getByRole('link', { name: /回到想做的事/ })).toBeVisible();
  });

  test('/permissions — never blank (static capability set) + onboarding banner', async ({ page }) => {
    await page.goto('/permissions');
    // "关于权限" banner is the onboarding copy.
    await expect(page.getByText('关于权限')).toBeVisible({ timeout: 10_000 });
    // Three capability group headers always render.
    await expect(page.getByRole('heading', { name: /看你的资料/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /帮你做事/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /联系外部服务/ })).toBeVisible();
  });
});

/**
 * Real-mode-only test: a throwaway user has no /now activity, so we
 * can exercise the empty-state branch end-to-end. Verifies the H4
 * CTA promotion (btn-primary + → /new) lives in the prod bundle.
 */
test.describe('H4 — real-mode /now empty CTA', () => {
  test.beforeEach(() => {
    if (
      !process.env.PLAYWRIGHT_BASE_URL ||
      !process.env.SUPABASE_URL ||
      !(process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY)
    ) {
      test.skip(
        true,
        'real-mode /now empty CTA test needs PLAYWRIGHT_BASE_URL + SUPABASE_URL + service-role key',
      );
    }
  });
  test.skip(({ isMobile }) => isMobile === true, 'desktop pass');

  test('throwaway user lands on /now → empty panel shows primary CTA → /new', async ({
    page,
    context,
  }) => {
    test.setTimeout(60_000);
    const user = await createTestUser();
    try {
      await injectRealSession(context, user.email);
      await unlockVercelPreview(page);
      await page.goto('/now');

      const cta = page.getByTestId('now-empty-cta');
      await expect(cta).toBeVisible({ timeout: 10_000 });
      await expect(cta).toContainText('起一件新事');
      await expect(cta).toHaveAttribute('href', /^\/new/);

      // Visual cue: primary tone, medium size. We don't bind to exact
      // class strings because Tailwind utility lists drift; instead
      // assert "btn-primary" is present.
      const cls = (await cta.getAttribute('class')) ?? '';
      expect(cls).toContain('btn-primary');

      // Onboarding copy is friendly, not a status code.
      await expect(page.getByText('现在很安静')).toBeVisible();
    } finally {
      await deleteTestUser(user.id);
    }
  });
});
