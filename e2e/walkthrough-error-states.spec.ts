import { test, expect } from '@playwright/test';

/**
 * H6 — error-state audit.
 *
 * Per H6 spec: every page hit by a network failure must surface a
 * friendly retry, not a blank/broken view. The shared ErrorPanel
 * component owns the contract (friendly title + friendlyError'd
 * message + 再试一次 button); each data-loading surface now wires
 * its error branch through it.
 *
 * Coverage check is bundle-content based — we fetch the served JS
 * and assert every surface's error testid + the ErrorPanel's
 * retry-button testid + Chinese copy are present. A future
 * refactor that quietly drops an error branch will fail this test.
 *
 * Surfaces audited:
 *   - /              → intentlist-error testid
 *   - /schedule      → schedule-error testid
 *   - /memory        → memory-error testid
 *   - /archive       → archive-error testid
 *   - /now           → now-error testid
 *   - /intent/<id>   → intent-error testid (existing)
 *
 * Static-content surfaces (/permissions, /help, /settings/engines,
 * /new) don't fetch async data and don't need an error panel.
 */

test.describe.configure({ mode: 'serial' });

test.describe('H6 — error-panel bundle markers', () => {
  test.skip(({ isMobile }) => isMobile === true, 'desktop pass');

  test('every data-loading surface owns an error testid + ErrorPanel ships', async ({
    page,
  }) => {
    await page.goto('/');
    const bundleUrl = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script[src]'));
      const main = scripts
        .map((s) => (s as HTMLScriptElement).src)
        .find((s) => /assets\/index-.*\.js$/.test(s));
      return main ?? '';
    });
    expect(bundleUrl, 'main JS bundle should be present').toMatch(/index-.*\.js$/);

    const bundleSrc = await page.evaluate(async (url: string) => {
      const res = await fetch(url);
      return res.text();
    }, bundleUrl);

    const requiredMarkers = [
      // Per-surface error testids.
      'intentlist-error',
      'schedule-error',
      'memory-error',
      'archive-error',
      'now-error',
      'intent-error',
      // ErrorPanel retry button — every panel routes through this.
      'error-panel-retry',
      // The friendly retry button copy.
      '再试一次',
    ];
    for (const m of requiredMarkers) {
      expect(
        bundleSrc.includes(m),
        `bundle should contain "${m}" (error marker)`,
      ).toBe(true);
    }
  });
});
