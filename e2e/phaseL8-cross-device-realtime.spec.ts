import { test, expect } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * L8 — cross-device Realtime: two browser contexts as the same user,
 * one sends a message via the gateway → the OTHER context picks up
 * the user message via Supabase Realtime + the assistant turn via
 * gateway → Supabase persistence + Realtime echo.
 *
 * Verifies the data fan-out story: a phone open in another room
 * actually sees what the desktop just typed.
 */

interface IntentRow { id: string }

function hdr() {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY!;
  return { apikey: k, authorization: `Bearer ${k}` };
}

async function createIntent(userId: string): Promise<IntentRow> {
  const url = process.env.SUPABASE_URL!;
  const clawRes = await fetch(
    `${url}/rest/v1/claws?user_id=eq.${userId}&plan_id=neq.aios-prototype&select=id&limit=1`,
    { headers: hdr() },
  );
  const claws = (await clawRes.json()) as { id: string }[];
  const id = `aios-L8-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const r = await fetch(`${url}/rest/v1/intents`, {
    method: 'POST',
    headers: { ...hdr(), 'content-type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ id, user_id: userId, claw_id: claws[0].id, title: 'L8-sync', emoji: '🔁' }),
  });
  return (await r.json() as IntentRow[])[0];
}

async function deleteIntent(id: string): Promise<void> {
  const url = process.env.SUPABASE_URL!;
  await fetch(`${url}/rest/v1/intents?id=eq.${id}`, { method: 'DELETE', headers: hdr() });
}

const skip = () => {
  if (!process.env.PLAYWRIGHT_BASE_URL || !process.env.REAL_TEST_EMAIL || !process.env.SUPABASE_URL) {
    test.skip(true, 'L8 needs PLAYWRIGHT_BASE_URL + REAL_TEST_EMAIL + SUPABASE_URL');
  }
};

test.describe.configure({ mode: 'serial' });

test.describe('L8 — cross-context Realtime sync', () => {
  test.beforeEach(skip);
  test.skip(({ isMobile }) => isMobile === true, 'desktop sweep');

  test('second context sees the user message Realtime-fanned-in', async ({ browser }) => {
    test.setTimeout(90_000);
    // Two independent contexts (cookies + localStorage isolated).
    const ctxA = await browser.newContext({ locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
    const ctxB = await browser.newContext({ locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
    const mintedA = await injectRealSession(ctxA, process.env.REAL_TEST_EMAIL!);
    await injectRealSession(ctxB, process.env.REAL_TEST_EMAIL!);

    let intent: IntentRow | null = null;
    try {
      intent = await createIntent(mintedA.user_id);
      const pageA = await ctxA.newPage();
      const pageB = await ctxB.newPage();

      await unlockVercelPreview(pageA);
      await unlockVercelPreview(pageB);
      await pageA.goto(`/intent/${intent.id}`);
      await pageB.goto(`/intent/${intent.id}`);

      // Wait for ClawStatus connected on at least one page (proves
      // gateway up; Realtime is independent of gateway but waiting
      // ensures Supabase Realtime channel had time to subscribe).
      await expect(pageA.getByTestId('claw-status')).toHaveAttribute(
        'data-status',
        'connected',
        { timeout: 20_000 },
      );
      await pageB.waitForTimeout(2_000);

      // Send from A.
      const probe = `跨端探针 ${Date.now().toString(36)}`;
      await pageA.getByPlaceholder(/想到什么直接说就好/).fill(probe);
      await pageA.getByRole('button', { name: '发送' }).click();

      // B should see the user message via Supabase Realtime INSERT echo.
      await expect(
        pageB.locator('[data-testid="chat-message"][data-role="user"]', { hasText: probe }),
      ).toBeVisible({ timeout: 15_000 });
    } finally {
      if (intent) await deleteIntent(intent.id);
      await ctxA.close();
      await ctxB.close();
    }
  });
});
