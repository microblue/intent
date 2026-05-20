import { test, expect } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * L3 — Settings language + dev toggle, Cmd+K launcher, BottomDock,
 * sidebar collapse/expand. UI interactions that must keep working in
 * real-mode for the prod URL.
 */

const skip = () => {
  if (!process.env.PLAYWRIGHT_BASE_URL || !process.env.REAL_TEST_EMAIL || !process.env.SUPABASE_URL) {
    test.skip(true, 'L3 needs PLAYWRIGHT_BASE_URL + REAL_TEST_EMAIL + SUPABASE_URL');
  }
};

test.describe.configure({ mode: 'serial' });

test.describe('L3 — Settings interactions (desktop)', () => {
  test.beforeEach(skip);
  test.skip(({ isMobile }) => isMobile === true, 'desktop sweep');

  test('language switch persists toast', async ({ page, context }) => {
    await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await unlockVercelPreview(page);
    await page.goto('/settings');
    await page.getByTestId('settings-language').selectOption('ja');
    // The i18n toast may use the target language's "switched" copy.
    await expect(
      page.getByText(/日本語に切り替えました|已切换|saved|Saved/),
    ).toBeVisible({ timeout: 5_000 });
    // Reset to zh-CN so the test user's other tests see expected copy.
    await page.getByTestId('settings-language').selectOption('zh-CN');
  });

  test('dev mode toggle flips aria-checked + fires toast', async ({ page, context }) => {
    await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await unlockVercelPreview(page);
    await page.goto('/settings');
    const toggle = page.locator('button[role="switch"]');
    const before = await toggle.getAttribute('aria-checked');
    await toggle.click();
    await expect(page.getByText(/开启开发者模式|关闭开发者模式/)).toBeVisible({
      timeout: 5_000,
    });
    const after = await toggle.getAttribute('aria-checked');
    expect(after).not.toBe(before);
    // Flip back so we don't leave state dirty.
    await toggle.click();
  });
});

test.describe('L3 — Cmd+K launcher (desktop)', () => {
  test.beforeEach(skip);
  test.skip(({ isMobile }) => isMobile === true, 'desktop launcher');

  test('keyboard shortcut opens + ESC closes', async ({ page, context }) => {
    await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await unlockVercelPreview(page);
    await page.goto('/');
    await page.keyboard.press('Control+k');
    await expect(page.locator('[cmdk-root]').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[cmdk-root]')).toHaveCount(0);
  });

  test('visible 搜一下 button opens the same launcher', async ({ page, context }) => {
    await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await unlockVercelPreview(page);
    await page.goto('/');
    // The sidebar "search" trigger button has aria-label="搜索" + label text "搜一下…".
    await page.getByRole('button', { name: /搜索|搜一下/ }).first().click();
    await expect(page.locator('[cmdk-root]').first()).toBeVisible();
  });
});

test.describe('L3 — Sidebar collapse / expand (desktop)', () => {
  test.beforeEach(skip);
  test.skip(({ isMobile }) => isMobile === true, 'desktop sidebar');

  test('round-trip preserves AccountFooter visibility', async ({ page, context }) => {
    await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await unlockVercelPreview(page);
    await page.goto('/');
    const collapseBtn = page.getByRole('button', { name: '收起侧栏' });
    await expect(collapseBtn).toBeVisible();
    await collapseBtn.click();
    await expect(page.getByRole('button', { name: '展开侧栏' })).toBeVisible();
    await page.getByRole('button', { name: '展开侧栏' }).click();
    await expect(collapseBtn).toBeVisible();
  });
});

test.describe('L3 — BottomDock (mobile)', () => {
  test.beforeEach(skip);
  test.skip(({ isMobile }) => isMobile !== true, 'mobile dock');

  test('提醒 dock navigates to /schedule', async ({ page, context }) => {
    await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await unlockVercelPreview(page);
    await page.goto('/');
    await page.getByRole('button', { name: '提醒' }).click();
    await page.waitForURL(/\/schedule$/);
  });

  test('通知 dock navigates to /now (with optional badge)', async ({ page, context }) => {
    await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await unlockVercelPreview(page);
    await page.goto('/');
    await page.getByRole('button', { name: /^通知( \d+)?$/ }).click();
    await page.waitForURL(/\/now$/);
  });

  test('center ✨ FAB navigates to /new', async ({ page, context }) => {
    await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await unlockVercelPreview(page);
    await page.goto('/');
    await page.getByRole('button', { name: '新想做的事' }).click();
    await page.waitForURL(/\/new(\?|$)/);
  });
});
