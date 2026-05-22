import { test, expect } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * G2 — /schedule NL composer write-path verification.
 *
 * Creates a throwaway intent, types a reminder phrase into the composer,
 * submits, asserts a row in `schedule_events` exists and is visible in
 * the feed. Cleans up after.
 */

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
  return rows[0].id;
}

test.describe.configure({ mode: 'serial' });

test.describe('G2 — /schedule composer real-mode write', () => {
  test.skip(
    () =>
      !process.env.PLAYWRIGHT_BASE_URL ||
      !process.env.REAL_TEST_EMAIL ||
      !process.env.SUPABASE_URL,
    'needs PLAYWRIGHT_BASE_URL + REAL_TEST_EMAIL + SUPABASE_URL',
  );

  test('parse + insert + render', async ({ page, context }) => {
    const minted = await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    const url = process.env.SUPABASE_URL!;
    const clawId = await getRealClawId(minted.user_id);
    // Throwaway intent: ID-prefixed so we can clean up reliably.
    const intentId = `aios-sched-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    await fetch(`${url}/rest/v1/intents`, {
      method: 'POST',
      headers: {
        ...hdr(),
        'content-type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        id: intentId,
        user_id: minted.user_id,
        claw_id: clawId,
        title: 'sched-composer-fixture',
        emoji: '⏰',
      }),
    });

    try {
      await unlockVercelPreview(page);
      await page.goto('/schedule');
      await expect(page.getByTestId('schedule-composer')).toBeVisible({
        timeout: 10_000,
      });

      // Pick our throwaway intent.
      await page.getByTestId('schedule-composer-intent').selectOption(intentId);

      // Type a phrase the parser should handle.
      const phrase = '明天 早上 9 点 跑步';
      await page.getByTestId('schedule-composer-input').fill(phrase);

      // Live preview shows what we parsed.
      await expect(page.getByTestId('schedule-composer-preview')).toContainText(
        /跑步/,
      );

      // Submit and wait for toast.
      await page.getByTestId('schedule-composer-submit').click();
      await expect(page.getByText(/我会提醒你「跑步」|提醒「跑步」/)).toBeVisible(
        { timeout: 8_000 },
      );

      // Verify the row landed in schedule_events.
      const rows = await fetch(
        `${url}/rest/v1/schedule_events?intent_id=eq.${intentId}&select=title,fire_at`,
        { headers: hdr() },
      ).then((r) => r.json() as Promise<{ title: string; fire_at: string }[]>);
      expect(rows.length).toBe(1);
      expect(rows[0].title).toBe('跑步');
    } finally {
      // Clean up: schedule_events first (no cascade guaranteed), then intent.
      await fetch(
        `${url}/rest/v1/schedule_events?intent_id=eq.${intentId}`,
        { method: 'DELETE', headers: hdr() },
      );
      await fetch(`${url}/rest/v1/intents?id=eq.${intentId}`, {
        method: 'DELETE',
        headers: hdr(),
      });
    }
  });
});
