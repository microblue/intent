import { test, expect } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * E10 — Cmd+K Launcher in real-mode hides the mock "最近的对话" + "文件"
 * groups so signed-in users don't see fabricated data from other
 * people's mock intents.
 *
 * "你的项目" still renders because it's backed by `useIntents()` which
 * is real-data-aware. The mock-fed groups stay until a cross-intent
 * recent-messages / files hook lands (see
 * `docs/handoff/launcher-cross-intent-recent.md`).
 */

const skip = () => {
  if (
    !process.env.PLAYWRIGHT_BASE_URL ||
    !process.env.REAL_TEST_EMAIL ||
    !process.env.SUPABASE_URL
  ) {
    test.skip(true, 'E10 needs PLAYWRIGHT_BASE_URL + REAL_TEST_EMAIL + SUPABASE_URL');
  }
};

test.describe.configure({ mode: 'serial' });

test.describe('E10 — Launcher real-mode collapses mock shortcut groups', () => {
  test.beforeEach(skip);
  test.skip(({ isMobile }) => isMobile === true, 'desktop launcher');

  test('opening Cmd+K signed-in does not show 最近的对话 or 文件 headings', async ({
    page,
    context,
  }) => {
    test.setTimeout(45_000);
    await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await unlockVercelPreview(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Open the launcher via the visible search button (Cmd+K parity per
    // CLAUDE.md). Sidebar exposes it as aria-label="搜索".
    await page.getByRole('button', { name: '搜索' }).first().click();
    const launcher = page.locator('[cmdk-root]');
    await expect(launcher).toBeVisible({ timeout: 5_000 });

    // The two mock-fed sections are gated behind `isMock` and should
    // not render in real-mode.
    await expect(launcher.getByText('最近的对话', { exact: true })).toHaveCount(0);
    await expect(launcher.getByText('文件', { exact: true })).toHaveCount(0);

    // "你的项目" still appears because useIntents is real-data-aware.
    await expect(launcher.getByText('你的项目')).toBeVisible({ timeout: 5_000 });
  });
});
