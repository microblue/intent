import { test, expect, type Page, type Locator } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * Phase F walkthrough for `/settings/engines` (dev-mode dashboard).
 *
 * The Engines surface is a dev-mode-only conceptual map of the
 * 4-plane architecture (Supabase / apps/api / OpenClaw / Hermes). It
 * doesn't actually require dev-mode to load, but the link to reach it
 * does — and visually the page is most useful with the rest of the
 * UI also in dev-mode. We pre-seed `devMode: true` into the persisted
 * `myclaw-ui-v2` localStorage key so the surface renders in its
 * intended state.
 *
 * Spec verifies shape only: screenshots at both viewports, asserts
 * every interactive element has an accessible name.
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

/**
 * Pre-seed `devMode: true` into the persisted UI store before the SPA
 * boots. The Zustand persist middleware reads this on init.
 */
async function seedDevMode(context: {
  addInitScript: (fn: () => void) => Promise<void>;
}): Promise<void> {
  await context.addInitScript(() => {
    try {
      const key = 'myclaw-ui-v2';
      const existing = localStorage.getItem(key);
      const parsed = existing ? JSON.parse(existing) : { state: {}, version: 0 };
      parsed.state = { ...parsed.state, devMode: true };
      localStorage.setItem(key, JSON.stringify(parsed));
    } catch {
      // ignore — private mode or quota
    }
  });
}

test.describe('F11 — walkthrough /settings/engines (dev mode)', () => {
  test.beforeEach(skipUnlessRealMode);

  test('desktop chromium', async ({ page, context }, info) => {
    test.skip(info.project.name !== 'chromium', 'desktop pass uses chromium');
    await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await seedDevMode(context);
    await unlockVercelPreview(page);
    await page.goto('/settings/engines');
    await expect(
      page.getByRole('heading', { level: 1, name: /底层引擎/ }),
    ).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(700);
    await page.screenshot({
      fullPage: true,
      path: `${ARTIFACTS}/walkthrough-engines-desktop.png`,
    });
    const report = await enumerate(page);
    test.info().attachments.push({
      name: 'engines-desktop-elements.json',
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify(report.rows, null, 2)),
    });
    expect(
      report.missingLabel,
      `engines desktop has ${report.missingLabel.length} unlabeled interactive elements:\n${JSON.stringify(report.missingLabel, null, 2)}`,
    ).toEqual([]);
  });

  test('mobile', async ({ page, context }, info) => {
    test.skip(info.project.name !== 'mobile', 'mobile pass uses mobile project');
    await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await seedDevMode(context);
    await unlockVercelPreview(page);
    await page.goto('/settings/engines');
    await expect(
      page.getByRole('heading', { level: 1, name: /底层引擎/ }),
    ).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(700);
    await page.screenshot({
      fullPage: true,
      path: `${ARTIFACTS}/walkthrough-engines-mobile.png`,
    });
    const report = await enumerate(page);
    test.info().attachments.push({
      name: 'engines-mobile-elements.json',
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify(report.rows, null, 2)),
    });
    expect(
      report.missingLabel,
      `engines mobile has ${report.missingLabel.length} unlabeled interactive elements:\n${JSON.stringify(report.missingLabel, null, 2)}`,
    ).toEqual([]);
  });
});
