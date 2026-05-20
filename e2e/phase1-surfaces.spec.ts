import { test, expect } from '@playwright/test';
import { skipIfRealMode } from './helpers/build-mode';

// Mock-mode bundle assumed. When running against a real-mode preview
// build, anonymous visitors trip Supabase RLS errors and these
// "renders without errors" assertions spuriously fail. Auto-skip in
// that case — real-mode previews use `pnpm test:e2e:realmode`.
test.beforeEach(async ({ page }) => {
  await skipIfRealMode(page);
});

/**
 * Phase 1 — UX prototype surface coverage.
 *
 * Every public route should mount without errors, render its hero copy,
 * and keep the persistent chrome (sidebar / mobile dock) visible. These
 * are smoke tests: catching "the bundle is broken" or "router lost a
 * route" before deeper feature tests run.
 *
 * Strategy: visit each route and assert a string that's unique to that
 * surface. We keep these strings stable across tweaks by anchoring on
 * the PageHeader title / hero copy, not implementation details.
 */

/**
 * Page-unique markers — anchor on PageHeader titles, not sidebar nav text.
 * Sidebar isn't rendered on mobile, so a string like "记得的事" (which lives
 * only in the nav) won't match. Use the full headline copy instead.
 */
const ROUTES: Array<{ path: string; expect: string }> = [
  { path: '/', expect: '想做的事' },
  { path: '/new', expect: '想做什么?' },
  { path: '/schedule', expect: '提醒' },
  { path: '/memory', expect: '助手记得你的事' },
  { path: '/now', expect: '正在为你做的事' },
  { path: '/settings', expect: '设置' },
  { path: '/help', expect: '帮助' },
  { path: '/permissions', expect: '助手能做什么' },
];

for (const route of ROUTES) {
  test(`Phase 1 — ${route.path} renders without errors`, async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await page.goto(route.path);

    // First match — multiple elements can contain the title text (sidebar
    // nav + page header), and we only need to prove the page rendered.
    await expect(page.getByText(route.expect).first()).toBeVisible();

    // Filter benign noise: React DevTools, Sentry not configured, etc.
    const fatal = consoleErrors.filter(
      (e) => !/react-devtools|download the react devtools|sentry/i.test(e),
    );
    expect(fatal, `Console errors on ${route.path}:\n${fatal.join('\n')}`).toEqual([]);
  });
}

test('Phase 1 — Intent detail route loads with mock data', async ({ page }) => {
  // 'birthday' is a stable mock ID from src/mocks/intents.ts with title
  // "老婆 Lisa 的生日". If the mock list is refactored this needs to follow.
  await page.goto('/intent/birthday');
  await expect(page.getByText('老婆 Lisa 的生日').first()).toBeVisible({
    timeout: 10_000,
  });
});

test.describe('Desktop-only chrome', () => {
  // The persistent sidebar + Cmd+K launcher are desktop affordances —
  // mobile gets a BottomDock instead. Mobile coverage lives below.
  test.skip(({ isMobile }) => isMobile === true, 'desktop-only');

  test('Phase 1 — Cmd+K launcher opens via keyboard', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('想做的事').first()).toBeVisible();
    await page.keyboard.press('Control+k');
    await expect(page.locator('[cmdk-root]').first()).toBeVisible({ timeout: 3_000 });
    await page.keyboard.press('Escape');
  });

  test('Phase 1 — visible search button opens the same launcher', async ({ page }) => {
    await page.goto('/');
    // Phase 1 spec: every Cmd+K action must also be reachable by a
    // visible button. Sidebar has "搜一下…" wired to the launcher.
    await page.getByRole('button', { name: '搜索' }).first().click();
    await expect(page.locator('[cmdk-root]').first()).toBeVisible({ timeout: 3_000 });
  });
});

test.describe('Mobile-only chrome', () => {
  test.skip(({ isMobile }) => isMobile !== true, 'mobile-only');

  test('Phase 1 — BottomDock primary nav is visible on mobile', async ({ page }) => {
    await page.goto('/');
    // Mobile primary nav. The dock has the same Intent home / Schedule /
    // Now anchors as the desktop sidebar.
    await expect(page.getByRole('button', { name: '新想做的事' })).toBeVisible();
  });
});
