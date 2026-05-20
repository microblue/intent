import { test, expect } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * Phase 6 — real-mode chat smoke.
 *
 * The earlier realmode-smoke spec only verified the connection
 * indicator. This one drives the full agent loop:
 *
 *   1. Provision a throwaway Intent for the test user via service-role
 *      INSERT (RLS-safe; intents.user_id = test user's auth.uid).
 *   2. Inject a real Supabase session + open /intent/<id>.
 *   3. Wait for ClawStatus to reach `connected`.
 *   4. Type into the composer and click 发送.
 *   5. Wait for an assistant reply to appear in the chat — this
 *      proves sessions.send → OpenClaw agent → chat event → UI
 *      end-to-end.
 *   6. Tear down the throwaway intent.
 *
 * Same env requirements as the other real-mode spec, plus the
 * Supabase service role for the cleanup INSERT/DELETE.
 */

const TEST_INTENT_TITLE = 'aios-realmode-chat-smoke';

interface IntentRow {
  id: string;
  user_id: string;
  title: string;
}

async function createTestIntent(userId: string): Promise<IntentRow> {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY!;
  // Pick the first non-sentinel claw for the user so the FK lands on
  // something that mints successfully.
  const clawRes = await fetch(
    `${url}/rest/v1/claws?user_id=eq.${userId}&plan_id=neq.aios-prototype&select=id&limit=1`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } },
  );
  const claws = (await clawRes.json()) as { id: string }[];
  if (!claws.length) {
    throw new Error(`test user has no real claw to bind intent to`);
  }
  // intents.id is text PK with no default — generate a stable test id.
  const intentId = `aios-smoke-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const res = await fetch(`${url}/rest/v1/intents`, {
    method: 'POST',
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      id: intentId,
      user_id: userId,
      claw_id: claws[0].id,
      title: TEST_INTENT_TITLE,
      emoji: '🧪',
    }),
  });
  if (!res.ok) throw new Error(`intent create failed: ${res.status} ${await res.text()}`);
  const rows = (await res.json()) as IntentRow[];
  return rows[0];
}

async function deleteTestIntent(id: string): Promise<void> {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY!;
  await fetch(`${url}/rest/v1/intents?id=eq.${id}`, {
    method: 'DELETE',
    headers: { apikey: key, authorization: `Bearer ${key}` },
  });
}

const skipUnlessRealMode = () => {
  if (
    !process.env.PLAYWRIGHT_BASE_URL ||
    !process.env.REAL_TEST_EMAIL ||
    !process.env.VERCEL_AUTOMATION_BYPASS ||
    !process.env.SUPABASE_URL
  ) {
    test.skip(
      true,
      'real-mode chat smoke needs PLAYWRIGHT_BASE_URL + VERCEL_AUTOMATION_BYPASS + REAL_TEST_EMAIL + SUPABASE_URL',
    );
  }
};

test.describe('Phase 6 — real-mode chat smoke', () => {
  test.beforeEach(skipUnlessRealMode);
  test.skip(({ isMobile }) => isMobile === true, 'desktop-only smoke');

  test('typing + 发送 yields an assistant reply via the live agent', async ({
    page,
    context,
  }) => {
    await unlockVercelPreview(page);
    const email = process.env.REAL_TEST_EMAIL!;
    const minted = await injectRealSession(context, email);

    let intent: IntentRow | null = null;
    try {
      intent = await createTestIntent(minted.user_id);

      await page.goto(`/intent/${intent.id}`);

      // Wait for the gateway to come up. ClawStatus is in the sidebar
      // AccountFooter. Use a generous timeout for cold DNS + WS.
      await expect(page.getByTestId('claw-status')).toHaveAttribute(
        'data-status',
        'connected',
        { timeout: 20_000 },
      );

      // Send a tiny prompt and wait for the assistant turn to land.
      // The agent on cool-brook runs against deepseek-v4-flash so a
      // short reply usually returns within 6-10s; allow generous slack.
      const composer = page.getByPlaceholder(/想到什么直接说就好/);
      await composer.fill('一句话回我:你是谁。');
      await page.getByRole('button', { name: '发送' }).click();

      // The user's own message shows up first (Supabase persistence).
      const userBubble = page
        .locator('[data-testid="chat-message"][data-role="user"]')
        .filter({ hasText: '一句话回我:你是谁。' });
      await expect(userBubble).toBeVisible({ timeout: 5_000 });

      // Then the assistant turn — anchored on data-role so we can't be
      // fooled by the brand chrome ("myclaw" appears in headers, etc).
      // Wait up to 45s for the LLM round-trip on cool-brook.
      const assistantTurn = page
        .locator('[data-testid="chat-message"][data-role="assistant"]')
        .first();
      await expect(assistantTurn).toBeVisible({ timeout: 45_000 });
      // Sanity: the assistant turn should contain non-empty text.
      await expect(assistantTurn).not.toHaveText('');
    } finally {
      if (intent) await deleteTestIntent(intent.id);
    }
  });
});
