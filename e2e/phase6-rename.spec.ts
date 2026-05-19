import { test, expect } from '@playwright/test';

/**
 * Phase 6 — intent rename UX (mock-mode UI verification).
 *
 * Real-mode UPDATE was verified manually against Supabase during the
 * Phase 5 verification (the row is RLS-narrowed to user_id = auth.uid()
 * and the policy is already in place). These e2e specs exercise the
 * click-to-edit → input → blur/Enter/Escape state machine that's shared
 * across desktop SlimHeader and the mobile thin header.
 */

test.describe('Intent rename — desktop', () => {
  test.skip(({ isMobile }) => isMobile === true, 'desktop variant');

  test('clicking the title swaps in an editable input', async ({ page }) => {
    await page.goto('/intent/birthday');
    await expect(page.getByTestId('intent-title-button')).toBeVisible();
    await page.getByTestId('intent-title-button').click();
    await expect(page.getByTestId('intent-title-input')).toBeVisible();
    await expect(page.getByTestId('intent-title-input')).toBeFocused();
  });

  test('Escape reverts without saving', async ({ page }) => {
    await page.goto('/intent/birthday');
    await page.getByTestId('intent-title-button').click();
    const input = page.getByTestId('intent-title-input');
    await input.fill('something else entirely');
    await input.press('Escape');
    // Back to button view with the original title.
    await expect(page.getByTestId('intent-title-button')).toContainText(
      '老婆 Lisa 的生日',
    );
    await expect(page.getByTestId('intent-title-input')).toHaveCount(0);
  });

  test('Enter triggers commit (mock mode → demo toast)', async ({ page }) => {
    await page.goto('/intent/birthday');
    await page.getByTestId('intent-title-button').click();
    const input = page.getByTestId('intent-title-input');
    await input.fill('换个名字');
    await input.press('Enter');
    // Mock mode: useUpdateIntent rejects with the demo-only message —
    // toast appears. Anchor on the substring unique to the toast copy
    // (the sidebar footer also has "演示模式 · 数据不保存").
    await expect(page.getByText(/改的内容不会被保存/)).toBeVisible({
      timeout: 5_000,
    });
    // Title reverts to the original.
    await expect(page.getByTestId('intent-title-button')).toContainText(
      '老婆 Lisa 的生日',
    );
  });

  test('empty title rolls back instead of saving an unusable name', async ({
    page,
  }) => {
    await page.goto('/intent/birthday');
    await page.getByTestId('intent-title-button').click();
    const input = page.getByTestId('intent-title-input');
    await input.fill('   ');
    await input.press('Enter');
    // No toast, no save attempt, original title restored.
    await expect(page.getByTestId('intent-title-button')).toContainText(
      '老婆 Lisa 的生日',
    );
  });
});

test.describe('Intent rename — mobile', () => {
  test.skip(({ isMobile }) => isMobile !== true, 'mobile variant');

  test('tapping the title swaps in an editable input', async ({ page }) => {
    await page.goto('/intent/birthday');
    await expect(page.getByTestId('intent-title-button-mobile')).toBeVisible();
    await page.getByTestId('intent-title-button-mobile').click();
    await expect(page.getByTestId('intent-title-input-mobile')).toBeVisible();
  });
});
