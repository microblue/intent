import { test, expect } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * Phase 7 — production-readiness sweep.
 *
 * Single signed-in user walks through every surface in real-mode and
 * we assert each one loads without console errors AND renders its
 * canonical hero copy. This is what catches regressions like "RLS
 * rejected our SELECT and the page is a blank skeleton forever."
 *
 * Two-row grid:
 *   - Anonymous routes (no session injected) — sign-in / sign-up funnel
 *     must work for new users hitting the public URL cold.
 *   - Signed-in routes — every persistent surface a real user lands on
 *     after auth.
 *
 * Console-error gate is strict but tolerant of: react devtools nags,
 * Sentry boot, expected RLS messages when probing (none should land
 * in real-mode signed-in user state, but the filter mirrors phase1).
 */

const ANON_HEADER_BY_PATH: Record<string, RegExp> = {
  '/auth/signin': /欢迎|登录|sign in/i,
  // Without a recovery token in the URL, this page shows the
  // "链接好像失效了" error state — that's the right behavior cold.
  '/auth/reset-password': /重置密码|reset|链接好像失效了/i,
};

// Each surface's H1 / level-1 heading copy. Anchoring on
// getByRole('heading', { level: 1 }) avoids sidebar nav-link collisions.
const SIGNED_IN_HEADER_BY_PATH: Record<string, RegExp> = {
  '/': /下午好|早上好|晚上好|你好/,
  '/new': /想做什么/,
  '/schedule': /^提醒/,
  '/memory': /助手记得你的事/,
  '/now': /正在为你做的事/,
  '/permissions': /助手能做什么/,
  '/settings': /^设置/,
  '/help': /帮助/,
  '/archive': /封存|archive/i,
};

const skipUnlessRealMode = () => {
  if (
    !process.env.PLAYWRIGHT_BASE_URL ||
    !process.env.REAL_TEST_EMAIL ||
    !process.env.VERCEL_AUTOMATION_BYPASS ||
    !process.env.SUPABASE_URL
  ) {
    test.skip(true, 'phase 7 prod-readiness smoke needs all four env vars');
  }
};

const collectConsoleErrors = (page: import('@playwright/test').Page) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
};

const filterErrors = (errors: string[]) =>
  errors.filter(
    (e) =>
      !/react-devtools|react developer tools|sentry|preload|VercelInsights/i.test(
        e,
      ),
  );

test.describe.configure({ mode: 'serial' });

test.describe('Phase 7 — anonymous surfaces (signed-out funnel)', () => {
  test.beforeEach(skipUnlessRealMode);
  test.skip(({ isMobile }) => isMobile === true, 'desktop-only sweep');

  for (const [path, header] of Object.entries(ANON_HEADER_BY_PATH)) {
    test(`anon ${path} loads cleanly`, async ({ page }) => {
      const errors = collectConsoleErrors(page);
      await unlockVercelPreview(page);
      await page.goto(path);
      await expect(page.getByText(header).first()).toBeVisible({
        timeout: 10_000,
      });
      const real = filterErrors(errors);
      expect(real, `unexpected console errors on ${path}:\n${real.join('\n')}`).toEqual([]);
    });
  }
});

test.describe('Phase 7 — signed-in surfaces (real claw user)', () => {
  test.beforeEach(skipUnlessRealMode);
  test.skip(({ isMobile }) => isMobile === true, 'desktop-only sweep');

  for (const [path, header] of Object.entries(SIGNED_IN_HEADER_BY_PATH)) {
    test(`signed-in ${path} loads cleanly`, async ({ page, context }) => {
      const errors = collectConsoleErrors(page);
      await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
      await unlockVercelPreview(page);
      await page.goto(path);
      // Anchor on the page's h1, not free text, so sidebar nav-link
      // labels (which use the same word in many cases) don't false-match.
      await expect(
        page.getByRole('heading', { level: 1, name: header }),
      ).toBeVisible({ timeout: 10_000 });
      const real = filterErrors(errors);
      expect(real, `unexpected console errors on ${path}:\n${real.join('\n')}`).toEqual([]);
    });
  }
});

test.describe('Phase 7 — interactions that write to Supabase in real-mode', () => {
  test.beforeEach(skipUnlessRealMode);
  test.skip(({ isMobile }) => isMobile === true, 'desktop-only sweep');

  test('Settings: change display_name + blur fires the saved toast', async ({
    page,
    context,
  }) => {
    await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await unlockVercelPreview(page);
    await page.goto('/settings');
    const input = page.getByTestId('settings-display-name');
    await input.fill(`smoke-${Date.now().toString(36)}`);
    await input.blur();
    await expect(page.getByText('已保存')).toBeVisible({ timeout: 5_000 });
  });

  test('Permissions: clicking 不行 persists + fires toast', async ({
    page,
    context,
  }) => {
    await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await unlockVercelPreview(page);
    await page.goto('/permissions');
    await page.getByRole('button', { name: '不行' }).first().click();
    await expect(page.getByText(/已改成「不行」/)).toBeVisible({
      timeout: 5_000,
    });
  });

  test('Sign-out lands back on /auth/signin and clears the storage key', async ({
    page,
    context,
  }) => {
    await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await unlockVercelPreview(page);
    await page.goto('/settings');
    await page.getByTestId('settings-signout').click();
    await page.waitForURL(/\/auth\/signin$/);
    const remainingSbKeys = await page.evaluate(() =>
      Object.keys(localStorage).filter((k) => k.startsWith('sb-')),
    );
    expect(remainingSbKeys).toEqual([]);
  });
});
