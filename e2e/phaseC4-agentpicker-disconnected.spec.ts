import { test, expect } from '@playwright/test';
import { skipIfRealMode } from './helpers/build-mode';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * C4 — AgentPicker behavior when the gateway is disconnected.
 *
 * fix_plan Notes C4: "Today the picker opens and routes even when WS
 * is down. In mock-mode the route never fires. Pick a behavior
 * (disable picker / no-op quietly / friendly toast) and test it."
 *
 * Picked: **disable picker**. In real-mode, when `useGateway().status`
 * is anything but `connected`, the trigger button is disabled +
 * carries `aria-disabled` + a friendly title ("等连上 claw 才能切换助手").
 * Mock-mode keeps the picker enabled because the demo isn't trying to
 * route to a real claw at all — the click is just UI state.
 *
 * Tests:
 *   - mock-mode: open `/intent/birthday`, assert picker trigger is
 *     enabled (no `disabled` attr) — mock has no WS to begin with.
 *   - real-mode: open an intent, block the `mint-claw-token` Edge
 *     Function so the WS never reaches `connected`, assert picker
 *     trigger is disabled + has the friendly title.
 */

interface IntentRow { id: string }

function hdr() {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY!;
  return { apikey: k, authorization: `Bearer ${k}`, 'content-type': 'application/json' };
}

async function seedIntent(userId: string): Promise<IntentRow> {
  const url = process.env.SUPABASE_URL!;
  const clawRes = await fetch(
    `${url}/rest/v1/claws?user_id=eq.${userId}&plan_id=neq.aios-prototype&select=id&limit=1`,
    { headers: hdr() },
  );
  const claws = (await clawRes.json()) as { id: string }[];
  const id = `aios-c4-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const r = await fetch(`${url}/rest/v1/intents`, {
    method: 'POST',
    headers: { ...hdr(), Prefer: 'return=representation' },
    body: JSON.stringify({ id, user_id: userId, claw_id: claws[0].id, title: 'c4-picker-disconnect', emoji: '🔌' }),
  });
  return (await r.json() as IntentRow[])[0];
}

async function deleteIntent(id: string): Promise<void> {
  const url = process.env.SUPABASE_URL!;
  await fetch(`${url}/rest/v1/intents?id=eq.${id}`, { method: 'DELETE', headers: hdr() });
}

// ─────────── mock-mode (always runs locally) ───────────

test.describe('C4 — AgentPicker stays enabled in mock-mode', () => {
  test.skip(({ isMobile }) => isMobile === true, 'desktop sweep');

  test.beforeEach(async ({ page }) => {
    await skipIfRealMode(page);
  });

  test('picker trigger is enabled when there is no gateway to connect to', async ({
    page,
  }) => {
    await page.goto('/intent/birthday');
    await expect(page.getByText('老婆 Lisa 的生日').first()).toBeVisible({
      timeout: 10_000,
    });
    const trigger = page.getByTestId('agent-picker-trigger');
    await expect(trigger).toBeVisible({ timeout: 5_000 });
    await expect(trigger).toBeEnabled();
    // No aria-disabled attribute means the false value isn't asserted.
    await expect(trigger).not.toHaveAttribute('aria-disabled', 'true');
  });
});

// ─────────── real-mode (skips without env) ───────────

const realSkip = () => {
  if (
    !process.env.PLAYWRIGHT_BASE_URL ||
    !process.env.REAL_TEST_EMAIL ||
    !process.env.SUPABASE_URL
  ) {
    test.skip(true, 'C4 real-mode needs PLAYWRIGHT_BASE_URL + REAL_TEST_EMAIL + SUPABASE_URL');
  }
};

test.describe.configure({ mode: 'serial' });

test.describe('C4 — AgentPicker disables when gateway not connected', () => {
  test.beforeEach(realSkip);
  test.skip(({ isMobile }) => isMobile === true, 'desktop sweep');

  test('blocked mint endpoint → picker trigger is disabled with friendly title', async ({
    page,
    context,
  }) => {
    test.setTimeout(45_000);

    // Block every mint call BEFORE navigation so the gateway never
    // reaches `connected`. Returning 503 lands the singleton in
    // `error` / `reconnecting` instead.
    await context.route('**/functions/v1/mint-claw-token', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'mint_blocked_by_test', error: 'C4 e2e' }),
      }),
    );

    const minted = await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    const intent = await seedIntent(minted.user_id);
    try {
      await unlockVercelPreview(page);
      await page.goto(`/intent/${intent.id}`);

      // Wait for ClawStatus to *not* be connected (the gateway will
      // try and fail, landing in `error` / `reconnecting` /
      // `connecting`). data-status attribute exists for any state.
      const status = page.getByTestId('claw-status');
      await expect(status).toBeVisible({ timeout: 15_000 });
      await expect(status).not.toHaveAttribute('data-status', 'connected', {
        timeout: 15_000,
      });

      // The picker trigger should be disabled with the friendly title.
      const trigger = page.getByTestId('agent-picker-trigger');
      await expect(trigger).toBeVisible({ timeout: 10_000 });
      await expect(trigger).toBeDisabled();
      await expect(trigger).toHaveAttribute('aria-disabled', 'true');
      await expect(trigger).toHaveAttribute('title', /等连上 claw 才能切换助手/);

      // Clicking the disabled trigger should NOT open the menu.
      await trigger.click({ force: true }).catch(() => {});
      await expect(page.getByTestId('agent-picker-menu')).toHaveCount(0);
    } finally {
      await deleteIntent(intent.id);
    }
  });
});
