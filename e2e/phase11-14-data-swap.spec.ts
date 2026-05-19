import { test, expect } from '@playwright/test';

/**
 * Phase 11–14 data-adapter swap — surface-level smoke + the one place
 * the behaviour visibly changed (permission toggle optimistic update).
 *
 * The /schedule, /memory, /permissions, /now routes existed in Phase 1
 * and have smoke coverage in phase1-surfaces.spec.ts ensuring they
 * render without console errors. The Phase 11–14 hooks preserve that
 * by falling back to mocks when VITE_USE_REAL_DATA is off (test build).
 * Real-mode write paths (INSERT schedule, DELETE memory, UPDATE
 * permission, RESOLVE approval) are RLS-tested manually against
 * Supabase — the same pattern as Phase 5/6/10.
 */

test('/permissions: clicking a mode triggers the persistence toast', async ({
  page,
}) => {
  await page.goto('/permissions');
  // Scope under the section heading so we don't accidentally match the
  // sidebar's <ul> in the parallel-test run (the original locator was
  // racing the sidebar's recent-intents list).
  await expect(page.getByRole('heading', { name: /看你的资料/ })).toBeVisible();
  // "不行" is unlikely to already be active for any capability default,
  // so the click definitively changes state. Desktop layout has no
  // `<main>` wrapper around content, so anchor on the button text — the
  // sidebar / dock don't have a "不行" button anywhere.
  await page.getByRole('button', { name: '不行' }).first().click();
  await expect(page.getByText(/已改成「不行」/)).toBeVisible({ timeout: 5_000 });
});

test('/schedule: quick-add toast surfaces but stays in demo mode', async ({
  page,
}) => {
  await page.goto('/schedule');
  await page.getByPlaceholder(/加一个提醒/).fill('每周一 9 点开会');
  await page.getByRole('button', { name: '加' }).click();
  // Mock mode: confirms the input was accepted with the demo disclaimer.
  await expect(page.getByText(/演示模式不会保存|agent 接入/)).toBeVisible({
    timeout: 5_000,
  });
});
