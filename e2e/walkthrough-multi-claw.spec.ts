import { test, expect, type Page, type Locator } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';
import { createTestUser, deleteTestUser } from './helpers/test-user';

/**
 * H2 walkthrough — visual capture of the multi-claw picker.
 *
 * Seeds a throwaway user with two real claws (different names), opens
 * the home, screenshots the sidebar with the picker closed, clicks the
 * picker, screenshots with the menu open. Ralph reads both — does the
 * trigger look like an obvious "this opens a menu"? Are the options
 * legibly distinct? Does the active option have a visible cue?
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

function hdr() {
  const k = (process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY)!;
  return {
    apikey: k,
    authorization: `Bearer ${k}`,
    'content-type': 'application/json',
  };
}

interface InsertClaw {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

async function insertRealClaw(c: InsertClaw): Promise<void> {
  const url = process.env.SUPABASE_URL!;
  const res = await fetch(`${url}/rest/v1/claws`, {
    method: 'POST',
    headers: { ...hdr(), Prefer: 'return=minimal' },
    body: JSON.stringify({
      id: c.id,
      user_id: c.user_id,
      name: c.name,
      plan_id: 'aios-vm-90d',
      claw_type: 'aios-vm',
      provider: 'test',
      status: 'active',
      created_at: c.created_at,
    }),
  });
  if (!res.ok) {
    throw new Error(`insertRealClaw failed: ${res.status} ${await res.text()}`);
  }
}

async function deleteClaw(id: string): Promise<void> {
  const url = process.env.SUPABASE_URL!;
  await fetch(`${url}/rest/v1/claws?id=eq.${id}`, {
    method: 'DELETE',
    headers: hdr(),
  });
}

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

test.describe('H2 — walkthrough multi-claw picker', () => {
  test.beforeEach(skip);
  test.skip(({ isMobile }) => isMobile === true, 'desktop-only — sidebar lives on desktop');

  test('two real claws: snap picker closed + open', async ({ page, context }) => {
    test.setTimeout(60_000);
    const user = await createTestUser();
    const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const olderId = `aios-e2e-walk-older-${stamp}`;
    const newerId = `aios-e2e-walk-newer-${stamp}`;
    try {
      await insertRealClaw({
        id: olderId,
        user_id: user.id,
        name: `cool-brook (${stamp})`,
        created_at: '2020-01-01T00:00:00Z',
      });
      await insertRealClaw({
        id: newerId,
        user_id: user.id,
        name: `warm-river (${stamp})`,
        created_at: '2020-06-01T00:00:00Z',
      });

      await injectRealSession(context, user.email);
      await unlockVercelPreview(page);
      await page.goto('/');
      await expect(page.getByTestId('claw-picker')).toBeVisible({
        timeout: 10_000,
      });
      await page.waitForTimeout(400);

      // 1) Picker closed — full-page snap so we capture the sidebar.
      await page.screenshot({
        fullPage: true,
        path: `${ARTIFACTS}/walkthrough-multi-claw-closed.png`,
      });

      // 2) Click to open the menu, snap again.
      await page.getByTestId('claw-picker').click();
      await expect(page.getByTestId('claw-picker-menu')).toBeVisible();
      await page.waitForTimeout(200);
      await page.screenshot({
        fullPage: true,
        path: `${ARTIFACTS}/walkthrough-multi-claw-open.png`,
      });

      // 3) Enumeration with the menu open — every option must have an
      //    accessible name.
      const report = await enumerate(page);
      test.info().attachments.push({
        name: 'multi-claw-elements.json',
        contentType: 'application/json',
        body: Buffer.from(JSON.stringify(report.rows, null, 2)),
      });
      expect(
        report.missingLabel,
        `multi-claw has ${report.missingLabel.length} unlabeled elements:\n${JSON.stringify(report.missingLabel, null, 2)}`,
      ).toEqual([]);
    } finally {
      await deleteClaw(olderId).catch(() => {});
      await deleteClaw(newerId).catch(() => {});
      await deleteTestUser(user.id);
    }
  });
});
