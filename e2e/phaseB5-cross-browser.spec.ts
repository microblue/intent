import { test, expect } from '@playwright/test';
import { skipIfRealMode } from './helpers/build-mode';
import { stubSupabaseSession, SUPABASE_STORAGE_KEY } from './helpers/auth-stub';

/**
 * B5 — cross-browser smoke (Firefox + WebKit).
 *
 * Chromium has dense coverage already. WebKit (Safari engine) and
 * Firefox (Gecko) historically catch CSS / layout / IME / event
 * regressions that Chromium-only suites miss. We don't run the
 * whole suite on those engines — too much install + flake. Instead
 * we lock in the three load-bearing surfaces for a lay user:
 *
 *   1. `/` renders + IntentList grid is visible
 *   2. `/intent/<mock-id>` chat-send adds a user bubble
 *   3. `/settings` signout clears the Supabase session key + redirects
 *
 * playwright.config.ts gates these to the `firefox` + `webkit`
 * projects via testMatch. Other projects ignore this file.
 *
 * Mock-mode only — real-mode coverage on the same paths lives in the
 * existing chromium specs (phase6-realmode-*, phaseL*).
 */

test.beforeEach(async ({ page }) => {
  await skipIfRealMode(page);
});

test('/ renders + IntentList grid is visible', async ({ page }) => {
  await page.goto('/');
  // The page header "想做的事" is the stable anchor every other
  // route smoke uses. Use `.first()` because both sidebar nav and
  // page header contain the string.
  await expect(page.getByText('想做的事').first()).toBeVisible({ timeout: 10_000 });
  // IntentList renders intent cards from the mocks; at least one
  // should mount. Look for the "新想做的事" CTA pill that always
  // anchors the empty / non-empty grid.
  await expect(page.getByText(/新想做的事|起一个新的/).first()).toBeVisible({
    timeout: 5_000,
  });
});

test('/intent/<mock-id> chat-send adds a user bubble', async ({ page }) => {
  // 'birthday' is a stable mock intent ID from src/mocks/intents.ts
  // with title "老婆 Lisa 的生日".
  await page.goto('/intent/birthday');
  await expect(page.getByText('老婆 Lisa 的生日').first()).toBeVisible({
    timeout: 10_000,
  });

  // The composer is the textarea with the "想到什么直接说" placeholder.
  const composer = page.getByPlaceholder(/想到什么直接说/);
  await expect(composer).toBeVisible({ timeout: 5_000 });

  const stamp = `B5-${Date.now().toString(36)}`;
  await composer.fill(`你好,这是 ${stamp}`);
  await page.getByRole('button', { name: '发送' }).click();

  // The user bubble should appear with the text we just sent.
  await expect(page.getByText(stamp).first()).toBeVisible({ timeout: 8_000 });
  // The composer should clear after send.
  await expect(composer).toHaveValue('');
});

test('/settings signout clears sb- localStorage + redirects', async ({ page, context }) => {
  await stubSupabaseSession(context, { email: 'b5@myclaw.test' });
  await page.goto('/settings');

  const signOut = page.getByTestId('settings-signout');
  await expect(signOut).toBeVisible({ timeout: 10_000 });
  await signOut.click();

  await page.waitForURL(/\/auth\/signin$/, { timeout: 8_000 });
  const sbKeys = await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.startsWith('sb-')),
  );
  expect(sbKeys).toEqual([]);
  expect(sbKeys).not.toContain(SUPABASE_STORAGE_KEY);
});
