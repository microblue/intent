import type { Page } from '@playwright/test';
import { test } from '@playwright/test';

/**
 * Detect whether the running bundle was built with
 * VITE_USE_REAL_DATA=true (real-mode preview) vs false (mock-mode
 * prod). The flag is stamped onto window.__aios at app bootstrap.
 *
 * Use this in mock-mode specs to opt out of running on a real-mode
 * preview — those tests assume RLS-free anonymous reads and would
 * spurious-fail when Supabase rejects them.
 */
export async function isRealModeBuild(page: Page): Promise<boolean> {
  // Navigate to a tiny route if we don't already have a page open;
  // window.__aios is set at app bootstrap regardless of which route.
  if (!page.url() || page.url() === 'about:blank') {
    await page.goto('/');
  }
  try {
    return await page.evaluate(() => Boolean(window.__aios?.useRealData));
  } catch {
    return false;
  }
}

/** beforeEach helper to skip mock-mode specs when running against a real-mode build. */
export async function skipIfRealMode(page: Page): Promise<void> {
  if (await isRealModeBuild(page)) {
    test.skip(true, 'mock-mode spec skipped against real-mode preview build');
  }
}
