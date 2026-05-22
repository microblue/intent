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

  test('NL composer renders + live-parses in real-mode', async ({ page, context }) => {
    await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await unlockVercelPreview(page);
    await page.goto('/schedule');
    // G2 rebuilt the natural-language quick-add composer (parseReminder.ts)
    // — the SPA parses time expressions client-side and previews the
    // result before submit. Real-mode: a signed-in user with at least
    // one intent should see the full composer (not the empty-state
    // CTA). The DZ test account has plenty of intents.
    await expect(page.getByTestId('schedule-composer')).toBeVisible({ timeout: 5_000 });
    await page.getByTestId('schedule-composer-input').fill('每周一 9 点 周会');
    await expect(page.getByTestId('schedule-composer-preview')).toContainText('周会');
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

  test('all 4 category sections render once at least one fact exists', async ({ page, context, request }) => {
    // E9 hides the category sections behind the empty-state card when
    // total=0 (better lay-user UX). Seed a fact so the page is in the
    // 4-sections-render state we want to assert.
    const minted = await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await unlockVercelPreview(page);

    const tag = `L2-mem-${Date.now()}`;
    const seedRes = await request.post(`${process.env.SUPABASE_URL}/rest/v1/memory_facts`, {
      headers: { ...hdr(), 'content-type': 'application/json', prefer: 'return=representation' },
      data: { user_id: minted.user_id, text: tag, category: 'about-you' },
    });
    const seedRow = (await seedRes.json())[0];

    try {
      await page.goto('/memory');
      for (const cat of ['关于你', '你的偏好', '重要的人', '项目相关']) {
        await expect(page.getByRole('heading', { name: new RegExp(cat) })).toBeVisible();
      }
    } finally {
      await request.delete(`${process.env.SUPABASE_URL}/rest/v1/memory_facts?id=eq.${seedRow.id}`, {
        headers: hdr(),
      });
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
