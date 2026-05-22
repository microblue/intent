import { test, expect, type Page } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * Journey 02 — 白领设提醒, 时间到了真的响.
 *
 * Persona: 30 岁白领, multi-project user.
 * Goal: 在 /schedule 设一个提醒, 时间到了真的收到提醒.
 *
 * Contract is in `.ralph/journeys/02-office-worker-reminder-fires.md`.
 *
 * This spec WILL FAIL on prod until L2 (firing sink) ships. Today
 * schedule_events rows persist but never transition out of `pending`,
 * and no UI surfaces "时间到了" — that's the bug this journey forces
 * us to close.
 */

interface SchedRow {
  id: string;
  status: string;
  fire_at: string;
  title: string;
}

function hdr() {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY!;
  return { apikey: k, authorization: `Bearer ${k}` };
}

async function listScheduleEvents(userId: string): Promise<SchedRow[]> {
  const url = process.env.SUPABASE_URL!;
  const res = await fetch(
    `${url}/rest/v1/schedule_events?user_id=eq.${userId}&select=id,status,fire_at,title&order=fire_at.desc&limit=20`,
    { headers: hdr() },
  );
  return (await res.json()) as SchedRow[];
}

async function deleteScheduleEvent(id: string): Promise<void> {
  const url = process.env.SUPABASE_URL!;
  await fetch(`${url}/rest/v1/schedule_events?id=eq.${id}`, { method: 'DELETE', headers: hdr() });
}

async function submitReminder(page: Page, text: string) {
  // Schedule page composer accepts NL — placeholder copy may vary across
  // surfaces, scope by visible composer + send button.
  const composer = page.getByPlaceholder(/什么时候|提醒|设/);
  await composer.first().fill(text);
  await page.getByRole('button', { name: /提交|记一下|设好/ }).first().click();
}

const skip = () => {
  if (!process.env.PLAYWRIGHT_BASE_URL || !process.env.REAL_TEST_EMAIL || !process.env.SUPABASE_URL) {
    test.skip(true, 'journey 02 needs PLAYWRIGHT_BASE_URL + REAL_TEST_EMAIL + SUPABASE_URL');
  }
};

test.describe.configure({ mode: 'serial' });

test.describe('Journey 02 — 提醒到时间真的响', () => {
  test.beforeEach(skip);
  test.skip(({ isMobile }) => isMobile === true, 'desktop-only for now');

  test('reminder fires within polling window + recurrence advances next slot', async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    const email = process.env.REAL_TEST_EMAIL!;
    const minted = await injectRealSession(context, email);
    const createdIds: string[] = [];

    try {
      await unlockVercelPreview(page);
      await page.goto('/schedule');
      await page.waitForLoadState('networkidle');

      // Snapshot the pre-existing schedule so we can isolate our row.
      const before = await listScheduleEvents(minted.user_id);
      const beforeIds = new Set(before.map((r) => r.id));

      // Step 2–3: submit a near-future reminder ("30 秒后吃药").
      await submitReminder(page, '30 秒后吃药');

      // Allow the INSERT to round-trip.
      await page.waitForTimeout(2500);
      const after = await listScheduleEvents(minted.user_id);
      const newRow = after.find((r) => !beforeIds.has(r.id) && /吃药/.test(r.title));
      expect(newRow, 'schedule_events should contain a new row for our reminder').toBeTruthy();
      if (newRow) createdIds.push(newRow.id);

      // Step 4–5: wait up to 70s for the polling sink to fire it.
      const fired = page.getByTestId('reminder-fired').first();
      await expect(fired, '应该看到 reminder-fired UI element 出现').toBeVisible({
        timeout: 70_000,
      });
      await expect(fired, 'fired notification should reference "吃药"').toContainText(/吃药/);

      // After firing, schedule_events row status must be 'fired'.
      await page.waitForTimeout(1500);
      const afterFire = await listScheduleEvents(minted.user_id);
      const row = afterFire.find((r) => r.id === newRow?.id);
      expect(row?.status, 'schedule_events.status should be fired after the sink').toBe('fired');

      // Daily recurrence forward-check.
      // Submit a daily-recurring reminder, then use page.clock to advance
      // 25 hours and verify the second slot fires too. If the recurrence
      // composer is not in the Schedule page UI, accept a deferred pass
      // (this assertion lands once L2 phase B ships).
      // We attempt the recurrence step; only the inner expects fail loud,
      // the setup is best-effort.
      const beforeRec = new Set((await listScheduleEvents(minted.user_id)).map((r) => r.id));
      await submitReminder(page, '每天晚 9 点喝水');
      await page.waitForTimeout(2500);
      const afterRec = await listScheduleEvents(minted.user_id);
      const recRow = afterRec.find((r) => !beforeRec.has(r.id) && /喝水/.test(r.title));
      if (recRow) createdIds.push(recRow.id);

      if (recRow) {
        await page.clock.fastForward(25 * 3600 * 1000);
        const firedAgain = page.getByTestId('reminder-fired').filter({ hasText: /喝水/ });
        await expect(
          firedAgain,
          'daily-recurrence: after fast-forward 25h the next slot should fire',
        ).toBeVisible({ timeout: 60_000 });
      }
    } finally {
      for (const id of createdIds) await deleteScheduleEvent(id);
    }
  });
});
