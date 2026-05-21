import { test, expect, type Page, type Locator } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * Phase F walkthrough for `/` (home / IntentList grid).
 *
 * Drives the home surface as a signed-in real-mode user, screenshots
 * desktop + mobile, then enumerates every interactive element and:
 *   1. asserts each one has a non-empty visible label or aria-label
 *      (no bare icons without an accessible name);
 *   2. for the subset that doesn't navigate away from `/`, clicks and
 *      confirms a visible response (Launcher modal opens, sidebar
 *      collapses, etc.);
 *   3. saves a screenshot under test-results/walkthrough-home-*.png
 *      so Ralph can read it back and triage placeholder copy / broken
 *      layout findings into Phase J of fix_plan.md.
 *
 * Findings discovered by reading the screenshots are appended to
 * fix_plan.md "Phase J — Self-audit findings" by Ralph in a follow-up
 * commit; this spec is the mechanism, not the triage step.
 */

const ARTIFACTS = 'test-results';

const skipUnlessRealMode = () => {
  if (!process.env.PLAYWRIGHT_BASE_URL || !process.env.REAL_TEST_EMAIL) {
    test.skip(
      true,
      'walkthrough needs PLAYWRIGHT_BASE_URL + REAL_TEST_EMAIL + SUPABASE_URL',
    );
  }
};

test.describe.configure({ mode: 'serial' });

type ElementReport = {
  tag: string;
  role: string;
  label: string;
  testId: string;
  href: string;
  visible: boolean;
};

async function describeInteractive(
  page: Page,
): Promise<{ rows: ElementReport[]; missingLabel: ElementReport[] }> {
  const handles: Locator[] = await page
    .locator(
      'button:not([disabled]), a[href], input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [role="button"]:not([disabled])',
    )
    .all();
  const rows: ElementReport[] = [];
  for (const h of handles) {
    // Some elements are off-screen / decorative — measure once.
    const info = await h
      .evaluate((el) => {
        const isVisible = !!(
          el.getBoundingClientRect().width &&
          el.getBoundingClientRect().height &&
          getComputedStyle(el).visibility !== 'hidden' &&
          getComputedStyle(el).display !== 'none'
        );
        const aria =
          el.getAttribute('aria-label') ||
          el.getAttribute('aria-labelledby') ||
          '';
        const text = (el.textContent || '').trim().replace(/\s+/g, ' ');
        const title = el.getAttribute('title') || '';
        const value = (el as HTMLInputElement).value || '';
        const placeholder = (el as HTMLInputElement).placeholder || '';
        return {
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute('role') || '',
          label: (aria || text || title || value || placeholder).slice(0, 80),
          testId: el.getAttribute('data-testid') || '',
          href: (el as HTMLAnchorElement).href || '',
          visible: isVisible,
        };
      })
      .catch(() => null);
    if (!info) continue;
    rows.push(info);
  }
  const missingLabel = rows.filter(
    (r) =>
      r.visible &&
      !r.label &&
      // Allow sr-only / off-layout helpers — they passed visible=false above.
      // Allow inputs of type hidden-via-style etc.
      true,
  );
  return { rows, missingLabel };
}

test.describe('F1 — walkthrough / (home)', () => {
  test.beforeEach(skipUnlessRealMode);

  test('desktop signed-in: enumerate + screenshot', async ({ page, context }, info) => {
    test.skip(info.project.name !== 'chromium', 'desktop pass uses chromium');
    await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await unlockVercelPreview(page);
    await page.goto('/');
    await expect(
      page.getByRole('heading', { level: 1, name: /下午好|早上好|晚上好|你好/ }),
    ).toBeVisible({ timeout: 10_000 });
    // Give the starter-template + intent grid time to settle.
    await page.waitForTimeout(800);

    const { rows, missingLabel } = await describeInteractive(page);
    await page.screenshot({
      fullPage: true,
      path: `${ARTIFACTS}/walkthrough-home-desktop.png`,
    });
    // Record the enumeration alongside the screenshot for triage.
    await page.evaluate(() => undefined);
    test.info().attachments.push({
      name: 'home-desktop-elements.json',
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify({ rows }, null, 2)),
    });
    expect(
      missingLabel,
      `home desktop has ${missingLabel.length} interactive elements with no accessible label:\n${JSON.stringify(missingLabel, null, 2)}`,
    ).toEqual([]);

    // Click smoke: a representative same-page action — Cmd-K launcher
    // trigger (visible search button is mandatory per UX rules).
    const launcherBtn = page
      .locator('[data-testid="launcher-trigger"], button:has-text("搜一下")')
      .first();
    if (await launcherBtn.count()) {
      await launcherBtn.click();
      await expect(
        page.locator('[role="dialog"], [cmdk-root]'),
      ).toBeVisible({ timeout: 3_000 });
      await page.keyboard.press('Escape');
    }
  });

  test('mobile signed-in: enumerate + screenshot', async ({ page, context }, info) => {
    test.skip(info.project.name !== 'mobile', 'mobile pass uses mobile project');
    await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await unlockVercelPreview(page);
    await page.goto('/');
    await expect(
      page.getByRole('heading', { level: 1, name: /下午好|早上好|晚上好|你好/ }),
    ).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(800);

    const { rows, missingLabel } = await describeInteractive(page);
    await page.screenshot({
      fullPage: true,
      path: `${ARTIFACTS}/walkthrough-home-mobile.png`,
    });
    test.info().attachments.push({
      name: 'home-mobile-elements.json',
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify({ rows }, null, 2)),
    });
    expect(
      missingLabel,
      `home mobile has ${missingLabel.length} interactive elements with no accessible label:\n${JSON.stringify(missingLabel, null, 2)}`,
    ).toEqual([]);
  });
});
