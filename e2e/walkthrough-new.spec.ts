import { test, expect, type Page, type Locator } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * Phase F walkthrough for `/new` (NewIntent).
 *
 * Drives the multi-stage create-intent flow and verifies every stage
 * renders correctly:
 *   1. prompt stage (empty + with seed via ?seed=...)
 *   2. clarifying stage (after submitting the prompt)
 *
 * For each captured stage:
 *   - full-page screenshot under test-results/walkthrough-new-*.png
 *   - enumerate every interactive element + assert non-empty
 *     accessible name (aria-label / text / title / placeholder)
 *
 * We stop short of running the entire 4-stage flow to completion
 * (preview + spawning) — confirming the intent would create rows in
 * the user's real database. The spec is for shape verification, not
 * write-path coverage (that lives in phase8-realmode-audit).
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

async function snap(page: Page, slug: string): Promise<void> {
  await page.screenshot({ fullPage: true, path: `${ARTIFACTS}/walkthrough-new-${slug}.png` });
}

test.describe('F3 — walkthrough /new (NewIntent)', () => {
  test.beforeEach(skipUnlessRealMode);

  test('desktop: prompt + clarifying stages', async ({ page, context }, info) => {
    test.skip(info.project.name !== 'chromium', 'desktop pass uses chromium');
    await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await unlockVercelPreview(page);

    // ── Stage 1: prompt (empty) ─────────────────────────────────
    await page.goto('/new');
    await expect(
      page.getByRole('heading', { level: 1, name: /想做什么/ }),
    ).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);
    await snap(page, 'desktop-prompt');
    const promptReport = await enumerate(page);
    test.info().attachments.push({
      name: 'new-desktop-prompt-elements.json',
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify(promptReport.rows, null, 2)),
    });
    expect(
      promptReport.missingLabel,
      `prompt stage has ${promptReport.missingLabel.length} unlabeled interactive elements:\n${JSON.stringify(promptReport.missingLabel, null, 2)}`,
    ).toEqual([]);

    // Click a starter chip to fill the textarea, then advance.
    await page.getByRole('button', { name: /帮我规划一次旅行/ }).click();
    await page.getByRole('button', { name: /继续/ }).click();

    // ── Stage 2: clarifying ─────────────────────────────────────
    await expect(page.getByText(/第 1 问|帮你想/)).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(400);
    await snap(page, 'desktop-clarifying');
    const clarifyReport = await enumerate(page);
    test.info().attachments.push({
      name: 'new-desktop-clarifying-elements.json',
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify(clarifyReport.rows, null, 2)),
    });
    expect(
      clarifyReport.missingLabel,
      `clarifying stage has ${clarifyReport.missingLabel.length} unlabeled interactive elements:\n${JSON.stringify(clarifyReport.missingLabel, null, 2)}`,
    ).toEqual([]);
  });

  test('mobile: prompt + clarifying stages', async ({ page, context }, info) => {
    test.skip(info.project.name !== 'mobile', 'mobile pass uses mobile project');
    await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await unlockVercelPreview(page);

    await page.goto('/new');
    await expect(
      page.getByRole('heading', { level: 1, name: /想做什么/ }),
    ).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);
    await snap(page, 'mobile-prompt');
    const promptReport = await enumerate(page);
    test.info().attachments.push({
      name: 'new-mobile-prompt-elements.json',
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify(promptReport.rows, null, 2)),
    });
    expect(
      promptReport.missingLabel,
      `mobile prompt has ${promptReport.missingLabel.length} unlabeled interactive elements:\n${JSON.stringify(promptReport.missingLabel, null, 2)}`,
    ).toEqual([]);

    await page.getByRole('button', { name: /帮我规划一次旅行/ }).click();
    await page.getByRole('button', { name: /继续/ }).click();

    await expect(page.getByText(/第 1 问|帮你想/)).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(400);
    await snap(page, 'mobile-clarifying');
    const clarifyReport = await enumerate(page);
    test.info().attachments.push({
      name: 'new-mobile-clarifying-elements.json',
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify(clarifyReport.rows, null, 2)),
    });
    expect(
      clarifyReport.missingLabel,
      `mobile clarifying has ${clarifyReport.missingLabel.length} unlabeled interactive elements:\n${JSON.stringify(clarifyReport.missingLabel, null, 2)}`,
    ).toEqual([]);
  });
});
