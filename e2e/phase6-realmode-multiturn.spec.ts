import { test, expect } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * Phase 6 — multi-turn chat smoke.
 *
 * Single-turn is covered. This one proves the same Intent → OpenClaw
 * session keeps state across multiple sends: aios's
 * `agent:main:aios:<intentId>` key is stable per intent, so the second
 * `sessions.send` should land in the SAME server-side session and the
 * agent should see turn 1 in its context when answering turn 2.
 *
 * We don't strictly assert "agent remembered" because that depends on
 * model behavior — instead we assert two distinct assistant turns
 * arrive in DOM order after two sends.
 */

const TEST_INTENT_TITLE = 'aios-multiturn-smoke';

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
  const id = `aios-mt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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
      title: TEST_INTENT_TITLE,
      emoji: '🔁',
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
    !process.env.SUPABASE_URL
  ) {
    test.skip(true, 'real-mode multi-turn smoke needs all four env vars');
  }
};

test.describe.configure({ mode: 'serial' });

test.describe('Phase 6 — real-mode multi-turn chat smoke', () => {
  test.beforeEach(skipUnlessRealMode);
  test.skip(({ isMobile }) => isMobile === true, 'desktop-only smoke');

  test('two sends in the same intent produce two distinct assistant turns', async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
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

      const composer = page.getByPlaceholder(/想到什么直接说就好/);
      const sendBtn = page.getByRole('button', { name: '发送' });
      const assistantTurns = page.locator(
        '[data-testid="chat-message"][data-role="assistant"]',
      );

      // Turn 1
      await composer.fill('一句话:我喜欢蓝色。');
      await sendBtn.click();
      await expect(assistantTurns).toHaveCount(1, { timeout: 45_000 });

      // Turn 2 — same intent ⇒ same session key on the claw side
      await composer.fill('一句话:我刚说了什么颜色?');
      await sendBtn.click();
      await expect(assistantTurns).toHaveCount(2, { timeout: 45_000 });

      // Both turns must be non-empty.
      const allText = await assistantTurns.allInnerTexts();
      expect(allText.filter((t) => t.trim().length > 0)).toHaveLength(2);
    } finally {
      if (intent) await deleteIntent(intent.id);
    }
  });
});
