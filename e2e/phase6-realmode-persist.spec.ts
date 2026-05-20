import { test, expect } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * Phase 6 — assistant turn persists across reloads (Task F slice).
 *
 * Plan §"数据边界" wants agent messages out of central DB long-term,
 * but until aios can fetch history via gateway methods directly,
 * Supabase remains a cross-device cache. The send/receive flow stays
 * gateway-driven; on `chat` state='final' we INSERT the assistant
 * turn so a refresh / second device still sees the conversation.
 *
 * Cleanup deletes the throwaway intent (CASCADE drops the messages).
 */

interface IntentRow { id: string }

function supabaseHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY!;
  return { apikey: key, authorization: `Bearer ${key}` };
}

async function createIntent(userId: string): Promise<IntentRow> {
  const url = process.env.SUPABASE_URL!;
  const clawRes = await fetch(
    `${url}/rest/v1/claws?user_id=eq.${userId}&plan_id=neq.aios-prototype&select=id&limit=1`,
    { headers: supabaseHeaders() },
  );
  const claws = (await clawRes.json()) as { id: string }[];
  if (!claws.length) throw new Error('test user has no real claw');
  const id = `aios-persist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const res = await fetch(`${url}/rest/v1/intents`, {
    method: 'POST',
    headers: {
      ...supabaseHeaders(),
      'content-type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      id,
      user_id: userId,
      claw_id: claws[0].id,
      title: 'aios-persist-smoke',
      emoji: '💾',
    }),
  });
  if (!res.ok) throw new Error(`intent create failed: ${await res.text()}`);
  return (await res.json() as IntentRow[])[0];
}

async function deleteIntent(id: string): Promise<void> {
  const url = process.env.SUPABASE_URL!;
  await fetch(`${url}/rest/v1/intents?id=eq.${id}`, {
    method: 'DELETE',
    headers: supabaseHeaders(),
  });
}

const skipUnlessRealMode = () => {
  if (
    !process.env.PLAYWRIGHT_BASE_URL ||
    !process.env.REAL_TEST_EMAIL ||
    !process.env.VERCEL_AUTOMATION_BYPASS ||
    !process.env.SUPABASE_URL
  ) {
    test.skip(true, 'real-mode persist smoke needs all four env vars');
  }
};

test.describe.configure({ mode: 'serial' });

test.describe('Phase 6 — assistant turn persists across reload', () => {
  test.beforeEach(skipUnlessRealMode);
  test.skip(({ isMobile }) => isMobile === true, 'desktop-only smoke');

  test('send → reply → reload → reply still in DOM', async ({ page, context }) => {
    test.setTimeout(90_000);
    const email = process.env.REAL_TEST_EMAIL!;
    const minted = await injectRealSession(context, email);

    let intent: IntentRow | null = null;
    try {
      intent = await createIntent(minted.user_id);
      await unlockVercelPreview(page);
      await page.goto(`/intent/${intent.id}`);
      await expect(page.getByTestId('claw-status')).toHaveAttribute(
        'data-status',
        'connected',
        { timeout: 20_000 },
      );

      // Send + wait for assistant turn (streaming → final → persisted).
      await page.getByPlaceholder(/想到什么直接说就好/).fill('一句话:我喜欢黄色。');
      await page.getByRole('button', { name: '发送' }).click();
      const turn = page
        .locator('[data-testid="chat-message"][data-role="assistant"]')
        .first();
      await expect(turn).toBeVisible({ timeout: 45_000 });
      // Tiny pause so the persistence INSERT lands before we reload.
      await page.waitForTimeout(2_000);

      // Reload: cache wipes, useMessages refetches from Supabase. The
      // assistant turn must still be there.
      await page.reload();
      await expect(
        page.locator('[data-testid="chat-message"][data-role="assistant"]'),
      ).toHaveCount(1, { timeout: 15_000 });
      // And the user message also survives.
      await expect(
        page.locator('[data-testid="chat-message"][data-role="user"]'),
      ).toHaveCount(1);
    } finally {
      if (intent) await deleteIntent(intent.id);
    }
  });
});
