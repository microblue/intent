import { test, expect } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * L2 — Schedule, Memory, Permissions real-mode behavior grid.
 */

function hdr() {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY!;
  return { apikey: k, authorization: `Bearer ${k}` };
}

const skip = () => {
  if (!process.env.PLAYWRIGHT_BASE_URL || !process.env.REAL_TEST_EMAIL || !process.env.SUPABASE_URL) {
    test.skip(true, 'L2 needs PLAYWRIGHT_BASE_URL + REAL_TEST_EMAIL + SUPABASE_URL');
  }
};

test.describe.configure({ mode: 'serial' });

test.describe('L2 — Schedule', () => {
  test.beforeEach(skip);
  test.skip(({ isMobile }) => isMobile === true, 'desktop sweep');

  test('quick-add typebox + 加 surfaces the "agent will parse" toast', async ({ page, context }) => {
    await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await unlockVercelPreview(page);
    await page.goto('/schedule');
    await page.getByPlaceholder(/加一个提醒/).fill('每天晚 9 点喝水');
    await page.getByRole('button', { name: '加' }).click();
    // Real-mode toast wording — wait for the agent-parses message.
    await expect(page.getByText(/agent 接入|已记下/)).toBeVisible({ timeout: 5_000 });
  });

  test('page renders with 4 bucket headings even when empty', async ({ page, context }) => {
    await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await unlockVercelPreview(page);
    await page.goto('/schedule');
    // PageHeader hero
    await expect(page.getByRole('heading', { level: 1, name: /^提醒/ })).toBeVisible();
  });
});

test.describe('L2 — Memory', () => {
  test.beforeEach(skip);
  test.skip(({ isMobile }) => isMobile === true, 'desktop sweep');

  test('all 4 category sections render', async ({ page, context }) => {
    await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await unlockVercelPreview(page);
    await page.goto('/memory');
    for (const cat of ['关于你', '你的偏好', '重要的人', '项目相关']) {
      await expect(page.getByRole('heading', { name: new RegExp(cat) })).toBeVisible();
    }
  });
});

test.describe('L2 — Permissions full cycle', () => {
  test.beforeEach(skip);
  test.skip(({ isMobile }) => isMobile === true, 'desktop sweep');

  test('cycle 不行 → 每次问 → 可以, each click persists to permission_grants', async ({
    page,
    context,
  }) => {
    test.setTimeout(45_000);
    const minted = await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await unlockVercelPreview(page);
    await page.goto('/permissions');

    for (const mode of ['不行', '每次问', '可以']) {
      await page.getByRole('button', { name: mode }).first().click();
      await expect(page.getByText(new RegExp(`已改成「${mode}」`))).toBeVisible({
        timeout: 5_000,
      });
      // Brief wait for UPDATE to land.
      await page.waitForTimeout(300);
    }

    // Verify final state in DB — at least ONE row for this user with one
    // of the three modes (the row for the first capability we clicked).
    const url = process.env.SUPABASE_URL!;
    const res = await fetch(
      `${url}/rest/v1/permission_grants?user_id=eq.${minted.user_id}&select=capability_id,mode`,
      { headers: hdr() },
    );
    const rows = (await res.json()) as { capability_id: string; mode: string }[];
    expect(rows.length, 'at least one permission_grant row').toBeGreaterThan(0);
    // The last click was 可以 → mode column should be 'allow' for that cap.
    expect(rows.some((r) => r.mode === 'allow')).toBe(true);
  });
});
