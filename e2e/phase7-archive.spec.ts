import { test, expect } from '@playwright/test';

/**
 * Phase 7 — soft-delete (封存) loop.
 *
 * Mock-mode coverage of the closed loop: archive action exists + reachable
 * from the intent header dropdown + reachable via the empty Archive route.
 * The actual UPDATE archived_at flip is mock-rejected in this build (no
 * real session), but the surface, copy, and routing are exercised.
 */

test.describe('Archive — intent header dropdown', () => {
  test.skip(({ isMobile }) => isMobile === true, 'desktop dropdown');

  test('actions dropdown surfaces both rename and archive', async ({ page }) => {
    await page.goto('/intent/birthday');
    await page.getByTestId('intent-actions').click();
    await expect(page.getByTestId('intent-action-rename')).toBeVisible();
    await expect(page.getByTestId('intent-action-archive')).toBeVisible();
  });

  test('clicking archive in mock mode shows the demo toast', async ({ page }) => {
    await page.goto('/intent/birthday');
    await page.getByTestId('intent-actions').click();
    await page.getByTestId('intent-action-archive').click();
    // Mock mode: useUpdateIntent rejects → archive failure toast.
    // The exact wording is "演示模式,改的内容不会被保存..." (anonymous)
    // or the signed-in variant. Both contain "改的内容".
    await expect(page.getByText(/改的内容不会被保存/)).toBeVisible({
      timeout: 5_000,
    });
  });
});

test.describe('Archive — /archive view', () => {
  test('reachable directly and renders the empty state when nothing is archived', async ({
    page,
  }) => {
    await page.goto('/archive');
    await expect(page.getByRole('heading', { name: '封存的' })).toBeVisible();
    // Mock data has no archived intents, so the empty state shows.
    await expect(page.getByTestId('archive-empty')).toBeVisible();
  });

  test('reachable from Settings 数据与隐私 row', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('link', { name: /去看看/ }).nth(2).click();
    await page.waitForURL(/\/archive$/);
    await expect(page.getByRole('heading', { name: '封存的' })).toBeVisible();
  });

  test('empty-state link navigates back home', async ({ page }) => {
    await page.goto('/archive');
    await page.getByRole('link', { name: /回到想做的事/ }).click();
    await page.waitForURL((url) => url.pathname === '/');
  });
});
