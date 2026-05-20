import { test, expect } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * Phase 7 — multi-agent: picker UI + per-agent persona routing.
 *
 * The 12 specialized agents (researcher / planner / writer / …) live
 * as OpenClaw agents on the user's claw. Choosing one in the composer
 * routes the next sessions.send to that agentId so the persona's
 * IDENTITY.md system prompt shapes the reply.
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
  const id = `aios-agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const r = await fetch(`${url}/rest/v1/intents`, {
    method: 'POST',
    headers: { ...hdr(), 'content-type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ id, user_id: userId, claw_id: claws[0].id, title: 'agent-picker', emoji: '🧪' }),
  });
  return (await r.json() as IntentRow[])[0];
}

async function deleteIntent(id: string): Promise<void> {
  const url = process.env.SUPABASE_URL!;
  await fetch(`${url}/rest/v1/intents?id=eq.${id}`, { method: 'DELETE', headers: hdr() });
}

const skip = () => {
  if (!process.env.PLAYWRIGHT_BASE_URL || !process.env.REAL_TEST_EMAIL || !process.env.SUPABASE_URL) {
    test.skip(true, 'agent-picker needs PLAYWRIGHT_BASE_URL + REAL_TEST_EMAIL + SUPABASE_URL');
  }
};

test.describe.configure({ mode: 'serial' });

test.describe('Phase 7 — AgentPicker UI', () => {
  test.beforeEach(skip);
  test.skip(({ isMobile }) => isMobile === true, 'desktop-only');

  test('picker trigger surfaces 12 options + switching changes the active agent label', async ({
    page,
    context,
  }) => {
    test.setTimeout(45_000);
    const minted = await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    let intent: IntentRow | null = null;
    try {
      intent = await createIntent(minted.user_id);
      await unlockVercelPreview(page);
      await page.goto(`/intent/${intent.id}`);

      // Composer mount
      await expect(page.getByPlaceholder(/想到什么直接说就好/)).toBeVisible();
      const trigger = page.getByTestId('agent-picker-trigger');
      await expect(trigger).toBeVisible();
      // Default is Claw (main)
      await expect(trigger).toContainText('Claw');

      await trigger.click();
      const menu = page.getByTestId('agent-picker-menu');
      await expect(menu).toBeVisible();

      // Spot-check the major personas surface in the menu.
      for (const name of ['研究员', '规划员', '写手', '机票助手']) {
        await expect(menu.getByText(name)).toBeVisible();
      }

      // Pick writer → trigger label updates.
      await page.getByTestId('agent-option-writer').click();
      await expect(trigger).toContainText('写手');
    } finally {
      if (intent) await deleteIntent(intent.id);
    }
  });

  test('writer persona shapes the reply when selected before sending', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    const minted = await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    let intent: IntentRow | null = null;
    try {
      intent = await createIntent(minted.user_id);
      await unlockVercelPreview(page);
      await page.goto(`/intent/${intent.id}`);

      // Wait for gateway connected (status sr-only on mobile, visible
      // on desktop — either way we wait for the attribute).
      await expect(page.getByTestId('claw-status')).toHaveAttribute(
        'data-status',
        'connected',
        { timeout: 25_000 },
      );

      // Switch to writer.
      await page.getByTestId('agent-picker-trigger').click();
      await page.getByTestId('agent-option-writer').click();

      // Send a tiny self-identify probe.
      await page.getByPlaceholder(/想到什么直接说就好/).fill('一句话:你是谁,擅长做什么。');
      await page.getByRole('button', { name: '发送' }).click();

      // Assistant turn should mention 写手 (the writer persona's IDENTITY).
      const assistant = page
        .locator('[data-testid="chat-message"][data-role="assistant"]')
        .first();
      await expect(assistant).toBeVisible({ timeout: 45_000 });
      await expect(assistant).toContainText(/写手|writer|文档/);
    } finally {
      if (intent) await deleteIntent(intent.id);
    }
  });
});
