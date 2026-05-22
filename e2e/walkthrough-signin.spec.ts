import { test, expect, type Page, type Locator } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';

/**
 * Phase F walkthrough for `/auth/signin`.
 *
 * Unauthenticated route — does NOT inject a real session (the page
 * auto-redirects to `/` when signedIn). Screenshots the surface at
 * desktop + mobile, enumerates every interactive element, asserts
 * each has an accessible name. Also exercises the 4-mode tabs
 * (signin / signup / magic / forgot) to surface any per-mode
 * unlabeled controls.
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
        // For form inputs, accessibility also comes from an associated
        // <label> — either a parent <label> (implicit) or one elsewhere
        // pointing at this element via `for=id` (explicit).
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

test.describe('F12 — walkthrough /auth/signin', () => {
  test.beforeEach(skipUnlessRealMode);

  test('desktop chromium — all 4 modes', async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium', 'desktop pass uses chromium');
    await unlockVercelPreview(page);

    // ── signin (default) ─────────────────────────────────────
    await page.goto('/auth/signin');
    await expect(
      page.getByRole('heading', { name: /欢迎回来/ }),
    ).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(400);
    await page.screenshot({
      fullPage: true,
      path: `${ARTIFACTS}/walkthrough-signin-desktop-signin.png`,
    });
    let report = await enumerate(page);
    expect(
      report.missingLabel,
      `signin mode unlabeled:\n${JSON.stringify(report.missingLabel, null, 2)}`,
    ).toEqual([]);

    // ── signup (via 注册 link on the signin page) ────────────
    await page.getByRole('button', { name: '注册', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: /创建账号/ }),
    ).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(300);
    await page.screenshot({
      fullPage: true,
      path: `${ARTIFACTS}/walkthrough-signin-desktop-signup.png`,
    });
    report = await enumerate(page);
    expect(
      report.missingLabel,
      `signup mode unlabeled:\n${JSON.stringify(report.missingLabel, null, 2)}`,
    ).toEqual([]);

    // ── magic (via 改用邮件链接 link on a fresh signin page) ─
    await page.goto('/auth/signin');
    await page.getByRole('button', { name: '改用邮件链接' }).click();
    await expect(
      page.getByRole('heading', { name: /邮件链接登录/ }),
    ).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(300);
    await page.screenshot({
      fullPage: true,
      path: `${ARTIFACTS}/walkthrough-signin-desktop-magic.png`,
    });
    report = await enumerate(page);
    expect(
      report.missingLabel,
      `magic mode unlabeled:\n${JSON.stringify(report.missingLabel, null, 2)}`,
    ).toEqual([]);

    // ── forgot (via 忘记密码? link on a fresh signin page) ──
    await page.goto('/auth/signin');
    await page.getByRole('button', { name: /忘记密码/ }).click();
    await expect(
      page.getByRole('heading', { name: /找回密码/ }),
    ).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(300);
    await page.screenshot({
      fullPage: true,
      path: `${ARTIFACTS}/walkthrough-signin-desktop-forgot.png`,
    });
    report = await enumerate(page);
    expect(
      report.missingLabel,
      `forgot mode unlabeled:\n${JSON.stringify(report.missingLabel, null, 2)}`,
    ).toEqual([]);
  });

  test('mobile — signin mode shape', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile', 'mobile pass uses mobile project');
    await unlockVercelPreview(page);
    await page.goto('/auth/signin');
    await expect(
      page.getByRole('heading', { name: /欢迎回来/ }),
    ).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(400);
    await page.screenshot({
      fullPage: true,
      path: `${ARTIFACTS}/walkthrough-signin-mobile.png`,
    });
    const report = await enumerate(page);
    test.info().attachments.push({
      name: 'signin-mobile-elements.json',
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify(report.rows, null, 2)),
    });
    expect(
      report.missingLabel,
      `signin mobile unlabeled:\n${JSON.stringify(report.missingLabel, null, 2)}`,
    ).toEqual([]);
  });
});
