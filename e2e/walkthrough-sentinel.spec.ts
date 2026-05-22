import { test, expect, type Page, type Locator } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';
import { createTestUser, deleteTestUser } from './helpers/test-user';

/**
 * H1 walkthrough — visual capture of the sentinel-only home for a
 * brand-new user. Reads as the screenshot Ralph scrutinizes per
 * PROMPT.md "Walkthrough protocol": is the banner legible, the CTA
 * obvious, the secondary activation-code affordance discoverable?
 *
 * Throwaway-user-based (sentinel-only state) and runs at both desktop
 * + mobile viewports.
 */

const ARTIFACTS = 'test-results';

const skip = () => {
  if (
    !process.env.PLAYWRIGHT_BASE_URL ||
    !process.env.SUPABASE_URL ||
    !(process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY)
  ) {
    test.skip(true, 'walkthrough needs prod url + service-role creds');
  }
};

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

test.describe.configure({ mode: 'serial' });

test.describe('H1 — walkthrough sentinel-only home', () => {
  test.beforeEach(skip);

  test('desktop chromium', async ({ page, context }, info) => {
    test.skip(info.project.name !== 'chromium', 'desktop pass uses chromium');
    const user = await createTestUser();
    try {
      await injectRealSession(context, user.email);
      await unlockVercelPreview(page);
      await page.goto('/');
      await expect(page.getByTestId('sentinel-claw-banner')).toBeVisible({
        timeout: 10_000,
      });
      await page.waitForTimeout(600);
      await page.screenshot({
        fullPage: true,
        path: `${ARTIFACTS}/walkthrough-sentinel-desktop.png`,
      });
      const report = await enumerate(page);
      test.info().attachments.push({
        name: 'sentinel-desktop-elements.json',
        contentType: 'application/json',
        body: Buffer.from(JSON.stringify(report.rows, null, 2)),
      });
      expect(
        report.missingLabel,
        `sentinel desktop has ${report.missingLabel.length} unlabeled elements:\n${JSON.stringify(report.missingLabel, null, 2)}`,
      ).toEqual([]);
    } finally {
      await deleteTestUser(user.id);
    }
  });

  test('mobile', async ({ page, context }, info) => {
    test.skip(info.project.name !== 'mobile', 'mobile pass uses mobile project');
    const user = await createTestUser();
    try {
      await injectRealSession(context, user.email);
      await unlockVercelPreview(page);
      await page.goto('/');
      await expect(page.getByTestId('sentinel-claw-banner')).toBeVisible({
        timeout: 10_000,
      });
      await page.waitForTimeout(600);
      await page.screenshot({
        fullPage: true,
        path: `${ARTIFACTS}/walkthrough-sentinel-mobile.png`,
      });
      const report = await enumerate(page);
      test.info().attachments.push({
        name: 'sentinel-mobile-elements.json',
        contentType: 'application/json',
        body: Buffer.from(JSON.stringify(report.rows, null, 2)),
      });
      expect(
        report.missingLabel,
        `sentinel mobile has ${report.missingLabel.length} unlabeled elements:\n${JSON.stringify(report.missingLabel, null, 2)}`,
      ).toEqual([]);
    } finally {
      await deleteTestUser(user.id);
    }
  });
});
