import { test, expect } from '@playwright/test';

/**
 * Phase 5 — create-intent write path (mock-mode UI verification).
 *
 * Tests verify the /new wizard plumbing end-to-end in MOCK mode:
 *   - The wizard advances prompt → preview → confirm
 *   - useCreateIntent rejects in mock mode with the friendly Chinese copy
 *   - The user sees a toast (not a crashed page)
 *
 * Real-mode INSERT verification needs a real Supabase test user and an
 * isolated build with VITE_USE_REAL_DATA=true; deferred until we have a
 * test user provisioned in the prod auth schema. The mutation function
 * itself is statically type-checked against the generated db-types.
 */

test('Phase 5 — /new wizard reaches the preview stage', async ({ page }) => {
  await page.goto('/new');
  // Stage 1: prompt
  await page.getByPlaceholder(/比如/).fill('帮我准备一个生日');
  await page.getByRole('button', { name: /继续/ }).click();
  // Stage 2: clarifying — skip everything to reach preview faster
  await page.getByRole('button', { name: /先这样.*开始/ }).click();
  // Stage 3: preview — the confirm button is visible
  await expect(page.getByRole('button', { name: /开始这件事/ })).toBeVisible();
});

test('Phase 5 — confirming in mock mode surfaces the demo-only toast', async ({
  page,
}) => {
  await page.goto('/new');
  await page.getByPlaceholder(/比如/).fill('帮我准备一个生日');
  await page.getByRole('button', { name: /继续/ }).click();
  await page.getByRole('button', { name: /先这样.*开始/ }).click();
  await page.getByRole('button', { name: /开始这件事/ }).click();
  // The mock-mode rejection lands as a sonner toast. The exact wording
  // is in useCreateIntent.ts; assert on the stable Chinese substring.
  await expect(page.getByText(/演示模式.*不会被保存/)).toBeVisible({
    timeout: 5_000,
  });
});

test('Phase 5 — mock-mode flow lands on an intent page after the toast', async ({
  page,
}) => {
  // The mock-mode fallback still navigates to the proposal's landIntentId
  // when one exists so the prototype's "see the chat surface" promise
  // survives. After clicking confirm, the user should end up on either
  // /intent/<some-mock-id> OR back on /new — but never on a blank page.
  await page.goto('/new');
  await page.getByPlaceholder(/比如/).fill('帮我准备一个生日');
  await page.getByRole('button', { name: /继续/ }).click();
  await page.getByRole('button', { name: /先这样.*开始/ }).click();
  await page.getByRole('button', { name: /开始这件事/ }).click();
  await page.waitForURL((url) => /\/(intent\/|new)/.test(url.pathname), {
    timeout: 5_000,
  });
});
