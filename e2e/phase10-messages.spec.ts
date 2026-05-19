import { test, expect } from '@playwright/test';

/**
 * Phase 10 — chat messages persistence (mock-mode UI verification).
 *
 * Mock mode flow:
 *   1. Visit an intent's chat
 *   2. Existing mock messages appear (proves useMessages reads the seed)
 *   3. Type in the composer, press Enter
 *   4. User's message appears in the thread (useSendMessage's cache mutation)
 *   5. Typing indicator briefly appears (mock-mode auto-reply scaffold)
 *   6. An assistant reply appears within ~2s
 *
 * Real-mode (INSERT + Realtime cross-tab) was verified manually in dev;
 * automating it would need two parallel pages with stubbed sessions,
 * deferred to a future cross-tab e2e helper.
 */

test('Phase 10 — mock-mode chat persists send + auto-replies', async ({
  page,
}) => {
  await page.goto('/intent/birthday');
  // Mock seed: at least one mock message renders.
  await expect(page.getByText('老婆 Lisa 的生日').first()).toBeVisible();

  // Find the composer and type a message.
  const composer = page.getByPlaceholder(/想到什么直接说就好/);
  await expect(composer).toBeVisible();
  await composer.fill('生日礼物我想送一支钢笔,有什么品牌可以推荐?');
  // The composer commits on Cmd/Ctrl + Enter (per the existing wizard
  // convention); fall back to clicking the send button if that's how the
  // surface is wired.
  await page.getByRole('button', { name: '发送' }).click();

  // The user's message should appear immediately.
  await expect(page.getByText(/钢笔.*推荐/).first()).toBeVisible({
    timeout: 3_000,
  });

  // Mock-mode auto-reply lands within ~2s.
  // The mock reply is keyword-based; the question-mark in our prompt
  // routes it to the "让我想想" branch.
  await expect(page.getByText(/让我想想/).first()).toBeVisible({
    timeout: 4_000,
  });
});

test('Phase 10 — empty composer is rejected', async ({ page }) => {
  await page.goto('/intent/birthday');
  // Send button should be disabled when nothing is typed (existing UX
  // from Phase 1 wizard). This guards against accidentally sending
  // empty rows once we're on real persistence.
  const send = page.getByRole('button', { name: '发送' });
  await expect(send).toBeDisabled();
});
