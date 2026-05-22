import { test, expect, type Page, type Locator } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';

/**
 * Phase F walkthrough for `/auth/reset-password`.
 *
 * Unauthenticated visit (no recovery token) — the page shows the
 * "链接好像失效了" stale-link card with a button back to sign-in.
 * That's the only path we can verify without a real Supabase recovery
 * exchange. Screenshots both viewports, enumerates interactive
 * elements, asserts each has an accessible name.
 *
 * Active-recovery-session form is exercised by Supabase's own
 * auth flow tests; what matters for F13 is that the unauthenticated
 * landing is friendly and labelled.
 */

const ARTIFACTS = 'test-results';

const skipUnlessRealMode = () => {
  if (!process.env.PLAYWRIGHT_BASE_URL) {
    test.skip(true, 'walkthrough needs PLAYWRIGHT_BASE_URL');
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
        let parentLabelText = '';
        const parentLabel = el.closest('label');
        if (parentLabel) {
          parentLabelText = (parentLabel.textContent || '').trim().replace(/\s+/g, ' ');
        }
        let forLabelText = '';
        const id = el.getAttribute('id');
        if (id) {
          const explicit = document.querySelector(`label[for="${id}"]`);
          if (explicit) {
            forLabelText = (explicit.textContent || '').trim().replace(/\s+/g, ' ');
          }
        }
        return {
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute('role') || '',
          label: (
            aria ||
            text ||
            title ||
            value ||
            placeholder ||
            parentLabelText ||
            forLabelText
          ).slice(0, 80),
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

test.describe('F13 — walkthrough /auth/reset-password', () => {
  test.beforeEach(skipUnlessRealMode);

  test('desktop chromium — stale-link state', async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium', 'desktop pass uses chromium');
    await unlockVercelPreview(page);
    await page.goto('/auth/reset-password');
    await expect(
      page.getByRole('heading', { name: /链接好像失效了/ }),
    ).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(400);
    await page.screenshot({
      fullPage: true,
      path: `${ARTIFACTS}/walkthrough-reset-password-desktop.png`,
    });
    const report = await enumerate(page);
    test.info().attachments.push({
      name: 'reset-password-desktop-elements.json',
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify(report.rows, null, 2)),
    });
    expect(
      report.missingLabel,
      `reset-password desktop unlabeled:\n${JSON.stringify(report.missingLabel, null, 2)}`,
    ).toEqual([]);

    // Click smoke: 重新发一个 link goes to /auth/signin.
    await page.getByRole('link', { name: /重新发一个/ }).click();
    await expect(page).toHaveURL(/\/auth\/signin/, { timeout: 5_000 });
  });

  test('mobile — stale-link state', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile', 'mobile pass uses mobile project');
    await unlockVercelPreview(page);
    await page.goto('/auth/reset-password');
    await expect(
      page.getByRole('heading', { name: /链接好像失效了/ }),
    ).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(400);
    await page.screenshot({
      fullPage: true,
      path: `${ARTIFACTS}/walkthrough-reset-password-mobile.png`,
    });
    const report = await enumerate(page);
    test.info().attachments.push({
      name: 'reset-password-mobile-elements.json',
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify(report.rows, null, 2)),
    });
    expect(
      report.missingLabel,
      `reset-password mobile unlabeled:\n${JSON.stringify(report.missingLabel, null, 2)}`,
    ).toEqual([]);
  });
});
