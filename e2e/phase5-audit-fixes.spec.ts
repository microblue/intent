import { test, expect } from '@playwright/test';
import { stubSupabaseSession } from './helpers/auth-stub';

/**
 * Self-audit follow-up — verify the copy + Settings wiring fixes.
 *
 * 1. Anonymous user in mock mode still sees the "登录后看到的是你自己的"
 *    hint (their existing demo experience).
 * 2. Signed-in user in mock mode (current prod state with flag off)
 *    sees the alternate "真实数据接通后..." hint — not the misleading
 *    "登录后..." copy.
 * 3. Settings page exposes the new display_name input + language
 *    selector with testids so we can drive them from tests.
 *
 * Note: the stubbed session puts useReal=false (flag is off in the
 * build), so all "signed-in" tests still exercise mock mode. Real-mode
 * persistence is verified manually in dev (see Phase 5 verification log).
 */

test.describe('Audit fix — mock-mode disclaimer', () => {
  test('anonymous viewer sees the "登录后" hint', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('登录后看到的是你自己的')).toBeVisible();
  });

  test('signed-in viewer in mock mode sees the alternate hint', async ({
    page,
    context,
  }) => {
    await stubSupabaseSession(context, { email: 'audit@myclaw.test' });
    await page.goto('/');
    // Should NOT see "登录后..." — they're already signed in.
    await expect(page.getByText('登录后看到的是你自己的')).toHaveCount(0);
    // SHOULD see the new copy.
    await expect(page.getByText(/真实数据接通后/)).toBeVisible();
  });
});

test.describe('Audit fix — Settings exposes useUserPreferences inputs', () => {
  test.beforeEach(async ({ context }) => {
    await stubSupabaseSession(context, { email: 'audit-settings@myclaw.test' });
  });

  test('display name + language fields are present', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByTestId('settings-display-name')).toBeVisible();
    await expect(page.getByTestId('settings-language')).toBeVisible();
  });

  test('display name placeholder defaults to email handle', async ({ page }) => {
    await page.goto('/settings');
    const input = page.getByTestId('settings-display-name');
    await expect(input).toHaveAttribute('placeholder', 'audit-settings');
  });

  test('language selector reflects the default zh-CN', async ({ page }) => {
    await page.goto('/settings');
    const select = page.getByTestId('settings-language');
    await expect(select).toHaveValue('zh-CN');
  });
});
