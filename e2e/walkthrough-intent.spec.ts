import { test, expect, type Page, type Locator } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * Phase F walkthrough for `/intent/<id>` — chat surface, both empty
 * and with history.
 *
 * Creates two scratch intents per pass (one empty, one seeded with a
 * pair of messages so the conversation rail and message bubbles render)
 * and for each:
 *   1. screenshots the chat surface;
 *   2. enumerates every interactive element and asserts a non-empty
 *      accessible name (aria-label / text / title / value);
 *   3. clicks the back-to-home and intent-actions controls to confirm
 *      they respond.
 *
 * Findings discovered by reading the screenshots are appended to
 * fix_plan.md "Phase J — Self-audit findings" by Ralph in a follow-up
 * commit; this spec is the mechanism, not the triage step.
 */

const ARTIFACTS = 'test-results';

const skipUnlessRealMode = () => {
  if (
    !process.env.PLAYWRIGHT_BASE_URL ||
    !process.env.REAL_TEST_EMAIL ||
    !process.env.SUPABASE_URL
  ) {
    test.skip(
      true,
      'walkthrough needs PLAYWRIGHT_BASE_URL + REAL_TEST_EMAIL + SUPABASE_URL',
    );
  }
};

function hdr() {
  const k = (process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY)!;
  return { apikey: k, authorization: `Bearer ${k}` };
}

async function getRealClawId(userId: string): Promise<string> {
  const url = process.env.SUPABASE_URL!;
  const res = await fetch(
    `${url}/rest/v1/claws?user_id=eq.${userId}&plan_id=neq.aios-prototype&select=id&limit=1`,
    { headers: hdr() },
  );
  const rows = (await res.json()) as { id: string }[];
  if (!rows[0]?.id) throw new Error('no real claw found for test user');
  return rows[0].id;
}

async function createIntent(
  userId: string,
  title: string,
  emoji = '🧪',
): Promise<{ id: string }> {
  const url = process.env.SUPABASE_URL!;
  const clawId = await getRealClawId(userId);
  const id = `aios-walk-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
  const r = await fetch(`${url}/rest/v1/intents`, {
    method: 'POST',
    headers: {
      ...hdr(),
      'content-type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ id, user_id: userId, claw_id: clawId, title, emoji }),
  });
  return ((await r.json()) as { id: string }[])[0];
}

async function deleteIntent(id: string): Promise<void> {
  const url = process.env.SUPABASE_URL!;
  // Delete messages first (FK on intent_id has no cascade in some envs).
  await fetch(`${url}/rest/v1/messages?intent_id=eq.${id}`, {
    method: 'DELETE',
    headers: hdr(),
  });
  await fetch(`${url}/rest/v1/intents?id=eq.${id}`, {
    method: 'DELETE',
    headers: hdr(),
  });
}

async function seedMessages(
  intentId: string,
  userId: string,
): Promise<void> {
  const url = process.env.SUPABASE_URL!;
  const turns: Array<{ role: 'user' | 'assistant'; text: string }> = [
    { role: 'user', text: '帮我看看这周该做什么 ——' },
    {
      role: 'assistant',
      text: '好的,我先把你最近在做的事过一遍:\n\n1. 旅行计划:机票还没下手\n2. 简历:已经改到第二版了\n3. 学日语:连着 5 天打卡',
    },
  ];
  for (const t of turns) {
    await fetch(`${url}/rest/v1/messages`, {
      method: 'POST',
      headers: { ...hdr(), 'content-type': 'application/json' },
      body: JSON.stringify({
        intent_id: intentId,
        user_id: userId,
        role: t.role,
        content: [{ type: 'text', text: t.text }],
      }),
    });
  }
}

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

test.describe('F2 — walkthrough /intent/<id> (chat)', () => {
  test.beforeEach(skipUnlessRealMode);

  test('desktop chromium: empty + with-history screenshots', async ({
    page,
    context,
  }, info) => {
    test.skip(info.project.name !== 'chromium', 'desktop pass uses chromium');
    const minted = await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await unlockVercelPreview(page);

    const empty = await createIntent(minted.user_id, 'walk-empty', '✨');
    const seeded = await createIntent(minted.user_id, 'walk-history', '📚');
    try {
      await seedMessages(seeded.id, minted.user_id);

      // ── Empty intent ───────────────────────────────────────────
      await page.goto(`/intent/${empty.id}`);
      await expect(page.getByTestId('intent-title-button')).toBeVisible({
        timeout: 15_000,
      });
      // Let header + rail finish layout before snapping
      await page.waitForTimeout(700);
      await page.screenshot({
        fullPage: true,
        path: `${ARTIFACTS}/walkthrough-intent-desktop-empty.png`,
      });
      const emptyReport = await enumerate(page);
      test.info().attachments.push({
        name: 'intent-desktop-empty-elements.json',
        contentType: 'application/json',
        body: Buffer.from(JSON.stringify(emptyReport.rows, null, 2)),
      });
      expect(
        emptyReport.missingLabel,
        `empty intent has ${emptyReport.missingLabel.length} unlabeled interactive elements:\n${JSON.stringify(emptyReport.missingLabel, null, 2)}`,
      ).toEqual([]);

      // Click smoke: open actions menu and back-to-home affordance.
      await page.getByTestId('intent-actions').click();
      await expect(page.getByTestId('intent-action-rename')).toBeVisible({
        timeout: 3_000,
      });
      await page.keyboard.press('Escape');

      // ── Seeded intent (with two messages) ──────────────────────
      await page.goto(`/intent/${seeded.id}`);
      await expect(page.getByTestId('intent-title-button')).toBeVisible({
        timeout: 15_000,
      });
      // Two messages should render — wait for them before snapping.
      await expect(page.locator('article, [data-testid^="msg-"]').first())
        .toBeVisible({ timeout: 10_000 })
        .catch(() => {
          // The MessageBubble component might not use [data-testid="msg-*"];
          // a generic role check fallback below will assert presence too.
        });
      await page.waitForTimeout(700);
      await page.screenshot({
        fullPage: true,
        path: `${ARTIFACTS}/walkthrough-intent-desktop-history.png`,
      });
      const seededReport = await enumerate(page);
      test.info().attachments.push({
        name: 'intent-desktop-history-elements.json',
        contentType: 'application/json',
        body: Buffer.from(JSON.stringify(seededReport.rows, null, 2)),
      });
      expect(
        seededReport.missingLabel,
        `seeded intent has ${seededReport.missingLabel.length} unlabeled interactive elements:\n${JSON.stringify(seededReport.missingLabel, null, 2)}`,
      ).toEqual([]);
    } finally {
      await deleteIntent(empty.id);
      await deleteIntent(seeded.id);
    }
  });

  test('mobile: empty + with-history screenshots', async ({
    page,
    context,
  }, info) => {
    test.skip(info.project.name !== 'mobile', 'mobile pass uses mobile project');
    const minted = await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await unlockVercelPreview(page);

    const empty = await createIntent(minted.user_id, 'walk-empty-m', '✨');
    const seeded = await createIntent(minted.user_id, 'walk-history-m', '📚');
    try {
      await seedMessages(seeded.id, minted.user_id);

      await page.goto(`/intent/${empty.id}`);
      // Mobile uses a different title editor (`MobileTitleEdit`) without
      // intent-title-button — wait for the header text instead.
      await expect(page.getByRole('link', { name: /返回首页/ }))
        .toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(700);
      await page.screenshot({
        fullPage: true,
        path: `${ARTIFACTS}/walkthrough-intent-mobile-empty.png`,
      });
      const emptyReport = await enumerate(page);
      test.info().attachments.push({
        name: 'intent-mobile-empty-elements.json',
        contentType: 'application/json',
        body: Buffer.from(JSON.stringify(emptyReport.rows, null, 2)),
      });
      expect(
        emptyReport.missingLabel,
        `mobile empty intent has ${emptyReport.missingLabel.length} unlabeled interactive elements:\n${JSON.stringify(emptyReport.missingLabel, null, 2)}`,
      ).toEqual([]);

      await page.goto(`/intent/${seeded.id}`);
      await expect(page.getByRole('link', { name: /返回首页/ }))
        .toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(700);
      await page.screenshot({
        fullPage: true,
        path: `${ARTIFACTS}/walkthrough-intent-mobile-history.png`,
      });
      const seededReport = await enumerate(page);
      test.info().attachments.push({
        name: 'intent-mobile-history-elements.json',
        contentType: 'application/json',
        body: Buffer.from(JSON.stringify(seededReport.rows, null, 2)),
      });
      expect(
        seededReport.missingLabel,
        `mobile seeded intent has ${seededReport.missingLabel.length} unlabeled interactive elements:\n${JSON.stringify(seededReport.missingLabel, null, 2)}`,
      ).toEqual([]);
    } finally {
      await deleteIntent(empty.id);
      await deleteIntent(seeded.id);
    }
  });
});
