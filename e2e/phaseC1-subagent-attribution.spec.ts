import { test, expect } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * C1 — subagent attribution in chat.
 *
 * The session key is named for the user-selected agent (typically
 * `main`), but a chat frame may carry a per-turn `agentKey` for a
 * specialist that main delegated to. Before C1 the SPA inherited
 * the session-owner agent on every turn, so a planner's reply
 * showed as 🦾 "Claw" instead of 🗺️ "规划员". Now we read the
 * per-turn attribution from the gateway payload (or, for messages
 * persisted to Supabase, from `messages.agent_id`) and the chat
 * header reflects the actual producer.
 *
 * This spec seeds an assistant message with `agent_id='planner'`
 * directly into Supabase (service-role) and verifies the chat
 * header renders 规划员 + the planner emoji + the message's
 * `data-agent-id` attribute matches.
 */

interface IntentRow { id: string }

function hdr() {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY!;
  return { apikey: k, authorization: `Bearer ${k}`, 'content-type': 'application/json' };
}

async function seedIntent(userId: string, title = 'planner-attribution'): Promise<IntentRow> {
  const url = process.env.SUPABASE_URL!;
  const clawRes = await fetch(
    `${url}/rest/v1/claws?user_id=eq.${userId}&plan_id=neq.aios-prototype&select=id&limit=1`,
    { headers: hdr() },
  );
  const claws = (await clawRes.json()) as { id: string }[];
  const id = `aios-c1-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const r = await fetch(`${url}/rest/v1/intents`, {
    method: 'POST',
    headers: { ...hdr(), Prefer: 'return=representation' },
    body: JSON.stringify({ id, user_id: userId, claw_id: claws[0].id, title, emoji: '🗺' }),
  });
  return (await r.json() as IntentRow[])[0];
}

async function seedAssistantMessage(
  intentId: string,
  userId: string,
  agentId: string,
  text: string,
): Promise<void> {
  const url = process.env.SUPABASE_URL!;
  await fetch(`${url}/rest/v1/messages`, {
    method: 'POST',
    headers: hdr(),
    body: JSON.stringify({
      intent_id: intentId,
      user_id: userId,
      role: 'assistant',
      agent_id: agentId,
      content: [{ type: 'text', text }],
    }),
  });
}

async function deleteIntent(id: string): Promise<void> {
  const url = process.env.SUPABASE_URL!;
  await fetch(`${url}/rest/v1/intents?id=eq.${id}`, { method: 'DELETE', headers: hdr() });
}

const skip = () => {
  if (!process.env.PLAYWRIGHT_BASE_URL || !process.env.REAL_TEST_EMAIL || !process.env.SUPABASE_URL) {
    test.skip(true, 'C1 needs PLAYWRIGHT_BASE_URL + REAL_TEST_EMAIL + SUPABASE_URL');
  }
};

test.describe.configure({ mode: 'serial' });

test.describe('C1 — subagent attribution renders per-message agent', () => {
  test.beforeEach(skip);
  test.skip(({ isMobile }) => isMobile === true, 'desktop sweep');

  test('planner-attributed assistant message shows 🗺️ 规划员 + data-agent-id=planner', async ({
    page,
    context,
  }) => {
    test.setTimeout(45_000);
    const minted = await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    const intent = await seedIntent(minted.user_id);
    try {
      // Two assistant turns: first from main (the session owner),
      // then from planner (the subagent main delegated to). The
      // chat surface should attribute them independently.
      await seedAssistantMessage(intent.id, minted.user_id, 'main', '好,我让规划员来帮你拆步骤。');
      await seedAssistantMessage(
        intent.id,
        minted.user_id,
        'planner',
        '收到。我把这件事拆成 3 步:1) 定方向 2) 拆细节 3) 排时间。',
      );

      await unlockVercelPreview(page);
      await page.goto(`/intent/${intent.id}`);

      // Two assistant messages render.
      const assistantMessages = page.locator('[data-testid="chat-message"][data-role="assistant"]');
      await expect(assistantMessages).toHaveCount(2, { timeout: 15_000 });

      // First message — main attribution (Claw is the display name
      // for the main agent in the builtin catalog).
      const first = assistantMessages.first();
      await expect(first).toHaveAttribute('data-agent-id', 'main');

      // Second message — planner attribution. This is the bug C1
      // fixes: subagent reply must show 🗺️ 规划员, not 🦾 Claw.
      const second = assistantMessages.nth(1);
      await expect(second).toHaveAttribute('data-agent-id', 'planner');
      // Header text contains the planner's display name.
      await expect(second).toContainText('规划员');
      // The avatar slot carries the planner's emoji.
      await expect(second).toContainText('🗺');
    } finally {
      await deleteIntent(intent.id);
    }
  });
});
