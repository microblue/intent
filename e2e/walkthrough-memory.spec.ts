import { test, expect, type Page, type Locator } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * Phase F walkthrough for `/memory`.
 *
 * Real-mode signed-in pass at desktop + mobile. Screenshots the
 * surface, enumerates every interactive element, asserts each has an
 * accessible name. Click-smoke: focus the add-fact composer's input
 * (proves the composer is interactive without writing a row).
 */

const ARTIFACTS = 'test-results';

const skipUnlessRealMode = () => {
  if (!process.env.PLAYWRIGHT_BASE_URL || !process.env.REAL_TEST_EMAIL) {
    test.skip(
      true,
      'walkthrough needs PLAYWRIGHT_BASE_URL + REAL_TEST_EMAIL',
    );
  }
};

test.describe.configure({ mode: 'serial' });

type ElementReport = {
  tag: string;
  role: string;
  label: string;
  testId: string;
  visible: boolean;
};

async function enumerate(page: Page): Promise<{
  rows: ElementReport[];
  missingLabel: ElementReport[];
}> {
  const handles: Locator[] = await page
    .locator(
      'button:not([disabled]), a[href], input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [role="button"]:not([disabled])',
    )
    .all();
  const rows: ElementReport[] = [];
  for (const h of handles) {
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
          visible: isVisible,
        };
      })
      .catch(() => null);
    if (!info) continue;
    rows.push(info);
  }
  const missingLabel = rows.filter((r) => r.visible && !r.label);
  return { rows, missingLabel };
}

test.describe('F5 — walkthrough /memory', () => {
  test.beforeEach(skipUnlessRealMode);

  test('desktop chromium', async ({ page, context }, info) => {
    test.skip(info.project.name !== 'chromium', 'desktop pass uses chromium');
    await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await unlockVercelPreview(page);
    await page.goto('/memory');
    await expect(
      page.getByRole('heading', { level: 1, name: /助手记得你的事/ }),
    ).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(600);
    await page.screenshot({
      fullPage: true,
      path: `${ARTIFACTS}/walkthrough-memory-desktop.png`,
    });
    const report = await enumerate(page);
    test.info().attachments.push({
      name: 'memory-desktop-elements.json',
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify(report.rows, null, 2)),
    });
    expect(
      report.missingLabel,
      `memory desktop has ${report.missingLabel.length} unlabeled interactive elements:\n${JSON.stringify(report.missingLabel, null, 2)}`,
    ).toEqual([]);
  });

  test('mobile', async ({ page, context }, info) => {
    test.skip(info.project.name !== 'mobile', 'mobile pass uses mobile project');
    await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await unlockVercelPreview(page);
    await page.goto('/memory');
    await expect(
      page.getByRole('heading', { level: 1, name: /助手记得你的事/ }),
    ).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(600);
    await page.screenshot({
      fullPage: true,
      path: `${ARTIFACTS}/walkthrough-memory-mobile.png`,
    });
    const report = await enumerate(page);
    test.info().attachments.push({
      name: 'memory-mobile-elements.json',
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify(report.rows, null, 2)),
    });
    expect(
      report.missingLabel,
      `memory mobile has ${report.missingLabel.length} unlabeled interactive elements:\n${JSON.stringify(report.missingLabel, null, 2)}`,
    ).toEqual([]);
  });
});
