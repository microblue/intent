import { test, expect } from '@playwright/test';

/**
 * Phase 4 — intent detail surface backed by useIntent(id).
 *
 * Coverage:
 *   - Known mock id → chat surface renders
 *   - Unknown id    → friendly 404 page (not a blank screen)
 *   - Mode coverage in both viewports (desktop + mobile layouts share the
 *     same hook, so the 404 path is the same on both)
 */

test('Phase 4 — known intent id renders the chat surface', async ({ page }) => {
  await page.goto('/intent/birthday');
  // 'birthday' is a stable mock id with title "老婆 Lisa 的生日".
  await expect(page.getByText('老婆 Lisa 的生日').first()).toBeVisible();
  // 404 markers must not appear for a valid id.
  await expect(page.getByTestId('intent-notfound')).toHaveCount(0);
  await expect(page.getByTestId('intent-error')).toHaveCount(0);
});

test('Phase 4 — unknown intent id shows the 404 page', async ({ page }) => {
  await page.goto('/intent/this-id-does-not-exist');
  await expect(page.getByTestId('intent-notfound')).toBeVisible();
  await expect(page.getByRole('heading', { name: '没找到这个项目' })).toBeVisible();
  await expect(page.getByRole('link', { name: '回到首页' })).toBeVisible();
});

test('Phase 4 — 404 link navigates back home', async ({ page }) => {
  await page.goto('/intent/nope');
  await page.getByRole('link', { name: '回到首页' }).click();
  await page.waitForURL((url) => url.pathname === '/');
});
