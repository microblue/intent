import { test, expect } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * Phase 6 — mobile real-mode chat smoke.
 *
 * Desktop chat is covered by phase6-realmode-chat. Mobile has its own
 * code path (no sidebar, BottomDock instead, full-bleed composer) and
 * uses the same useChatThread → useGatewayChat plumbing. This spec
 * proves the gateway connection + send + assistant-reply loop also
 * works in the mobile viewport.
 *
 * No ClawStatus indicator on mobile (it lives in the sidebar
 * AccountFooter which is desktop-only). The assistant reply itself
 * is the proof that the gateway came up.
 */

const TEST_INTENT_TITLE = 'aios-mobile-chat-smoke';

interface IntentRow { id: string }

async function createTestIntent(userId: string): Promise<IntentRow> {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY!;
  const clawRes = await fetch(
    `${url}/rest/v1/claws?user_id=eq.${userId}&plan_id=neq.aios-prototype&select=id&limit=1`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } },
  );
  const claws = (await clawRes.json()) as { id: string }[];
  if (!claws.length) throw new Error('test user has no real claw');
  const intentId = `aios-mob-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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
      emoji: '📱',
    }),
  });
  if (!res.ok) throw new Error(`intent create failed: ${await res.text()}`);
  return (await res.json() as IntentRow[])[0];
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
    !process.env.SUPABASE_URL
  ) {
    test.skip(true, 'real-mode mobile chat smoke needs all four env vars');
  }
};

test.describe.configure({ mode: 'serial' });

test.describe('Phase 6 — real-mode mobile chat smoke', () => {
  test.beforeEach(skipUnlessRealMode);
  // Inverse of the desktop guard — only run on the mobile project.
  test.skip(({ isMobile }) => isMobile !== true, 'mobile-only smoke');

  test('mobile composer → gateway → assistant reply lands', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    const email = process.env.REAL_TEST_EMAIL!;
    const minted = await injectRealSession(context, email);

    let intent: IntentRow | null = null;
    try {
      intent = await createTestIntent(minted.user_id);
      await unlockVercelPreview(page);
      await page.goto(`/intent/${intent.id}`);

      // AppShell mounts ClawStatus sr-only on mobile so the gateway
      // singleton stays up and tests can probe data-status. Wait for
      // connected before sending so the send hits the gateway rather
      // than throwing.
      await expect(page.getByTestId('claw-status')).toHaveAttribute(
        'data-status',
        'connected',
        { timeout: 20_000 },
      );

      const composer = page.getByPlaceholder(/想到什么直接说就好/);
      await expect(composer).toBeVisible();
      await composer.fill('短句回我:你叫什么。');
      await page.getByRole('button', { name: '发送' }).click();

      // User bubble first.
      const userBubble = page
        .locator('[data-testid="chat-message"][data-role="user"]')
        .filter({ hasText: '短句回我:你叫什么。' });
      await expect(userBubble).toBeVisible({ timeout: 5_000 });

      // Assistant turn — generous timeout for cold LLM + WS.
      const assistantTurn = page
        .locator('[data-testid="chat-message"][data-role="assistant"]')
        .first();
      await expect(assistantTurn).toBeVisible({ timeout: 45_000 });
      await expect(assistantTurn).not.toHaveText('');
    } finally {
      if (intent) await deleteTestIntent(intent.id);
    }
  });
});
