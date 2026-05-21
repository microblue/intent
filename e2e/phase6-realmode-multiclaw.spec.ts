import { test, expect } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';
import { createTestUser, deleteTestUser } from './helpers/test-user';

/**
 * Phase 6 — multi-claw flow for `intent → claw → session` per
 * `aios-design.md §6`.
 *
 * Sentinel-only and single-real-claw cases are covered by
 * `phase6-realmode-sentinel.spec.ts` and `phase6-realmode-smoke.spec.ts`.
 * This spec covers the third leg of the A2 audit: a user who owns
 * MULTIPLE real (non-sentinel) claws.
 *
 * Today's contract (single-claw UI; multi-claw picker dropdown is TBD):
 *   - `useClaws.realClaws` returns every non-sentinel row.
 *   - `defaultClaw` = the oldest real claw (created_at ASC).
 *   - ClawPicker collapses to a label row showing that oldest claw.
 *   - Sentinel banner stays hidden — they have real claws.
 *   - `useGateway` targets `defaultClaw.id` (not a per-intent override).
 *
 * If the multi-claw selector lands later, this spec's assertions
 * become the regression guard for the old fallback (oldest-claw wins
 * when no explicit selection is made).
 *
 * We synthesize two real claws by direct service-role INSERT — the
 * subdomains aren't backed by a real gateway, so we don't assert on
 * WS connection state (status will sit at connecting/error). The
 * picker-label + sentinel-hidden + DB-FK behaviors are what §6 calls
 * for and what this spec verifies.
 */

const skipUnlessRealMode = () => {
  if (!process.env.PLAYWRIGHT_BASE_URL || !process.env.SUPABASE_URL) {
    test.skip(
      true,
      'multi-claw smoke needs PLAYWRIGHT_BASE_URL + SUPABASE_URL (+ SUPABASE_SERVICE_ROLE_KEY)',
    );
  }
};

function hdr() {
  const k =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY!;
  return { apikey: k, authorization: `Bearer ${k}`, 'content-type': 'application/json' };
}

interface InsertClaw {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

async function insertRealClaw(c: InsertClaw): Promise<void> {
  const url = process.env.SUPABASE_URL!;
  const res = await fetch(`${url}/rest/v1/claws`, {
    method: 'POST',
    headers: { ...hdr(), Prefer: 'return=minimal' },
    // plan_id must NOT be 'aios-prototype' (that's the sentinel marker).
    // Use a realistic VM-tier plan so realClaws filtering picks it up.
    body: JSON.stringify({
      id: c.id,
      user_id: c.user_id,
      name: c.name,
      plan_id: 'aios-vm-90d',
      claw_type: 'aios-vm',
      provider: 'test',
      status: 'active',
      created_at: c.created_at,
    }),
  });
  if (!res.ok) {
    throw new Error(`insertRealClaw failed: ${res.status} ${await res.text()}`);
  }
}

async function deleteClaw(id: string): Promise<void> {
  const url = process.env.SUPABASE_URL!;
  await fetch(`${url}/rest/v1/claws?id=eq.${id}`, {
    method: 'DELETE',
    headers: hdr(),
  });
}

async function fetchIntentClawId(intentId: string): Promise<string | null> {
  const url = process.env.SUPABASE_URL!;
  const res = await fetch(
    `${url}/rest/v1/intents?id=eq.${intentId}&select=claw_id`,
    { headers: hdr() },
  );
  const rows = (await res.json()) as { claw_id: string }[];
  return rows[0]?.claw_id ?? null;
}

test.describe.configure({ mode: 'serial' });

test.describe('Phase 6 — multi-real-claw flow (A2 audit, §6)', () => {
  test.beforeEach(skipUnlessRealMode);
  test.skip(({ isMobile }) => isMobile === true, 'desktop-only smoke');

  test('two real claws: picker shows oldest + sentinel banner hidden + new intent FK targets oldest', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    const user = await createTestUser();
    const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const olderId = `aios-e2e-older-${stamp}`;
    const newerId = `aios-e2e-newer-${stamp}`;
    // Insert clearly-separated created_at so ordering is deterministic.
    // The sentinel claw inserted by handle_new_auth_user() lands at
    // ~now(), so we pin the synthetic real claws far in the past to
    // guarantee they win the `ORDER BY created_at ASC` race against
    // any future re-runs that might see clock skew.
    const olderTs = '2020-01-01T00:00:00Z';
    const newerTs = '2020-06-01T00:00:00Z';
    try {
      await insertRealClaw({
        id: olderId,
        user_id: user.id,
        name: 'older-test-claw',
        created_at: olderTs,
      });
      await insertRealClaw({
        id: newerId,
        user_id: user.id,
        name: 'newer-test-claw',
        created_at: newerTs,
      });

      await injectRealSession(context, user.email);
      await unlockVercelPreview(page);
      await page.goto('/');

      // 1) Sentinel banner stays hidden — user owns real claws.
      await expect(page.getByTestId('sentinel-claw-banner')).toHaveCount(0);

      // 2) ClawPicker shows the oldest real claw's name.
      const picker = page.getByTestId('claw-picker');
      await expect(picker).toBeVisible({ timeout: 10_000 });
      await expect(picker).toContainText('older-test-claw');
      await expect(picker).not.toContainText('newer-test-claw');

      // 3) Creating an intent from /new should bind to the oldest claw's id.
      // Drive the wizard end-to-end so we exercise the same code path a
      // user would hit, not just useCreateIntent in isolation.
      await page.goto('/new');
      await page.getByRole('textbox').first().fill('帮我准备一次去日本看樱花的旅行');
      await page.getByRole('button', { name: /继续/ }).click();
      // Skip the 3-question interview — we only care about the persisted FK.
      await page.getByRole('button', { name: /先这样,直接开始/ }).click();
      await page.getByRole('button', { name: /开始这件事/ }).click();
      // Wait for navigation away from /new to /intent/<id>.
      await page.waitForURL(/\/intent\/[^/]+$/, { timeout: 15_000 });
      const intentId = page.url().split('/intent/')[1];
      // Verify the FK landed on the oldest claw, not the newer one.
      const clawIdOnIntent = await fetchIntentClawId(intentId);
      expect(clawIdOnIntent).toBe(olderId);
    } finally {
      // Order: intents first (FK to claws), then both real claws, then user.
      // CASCADE on auth.users → public.users → public.claws/intents would
      // catch everything, but cleaning explicitly avoids leftover rows if
      // the user delete somehow fails partway through.
      await deleteClaw(olderId).catch(() => {});
      await deleteClaw(newerId).catch(() => {});
      await deleteTestUser(user.id);
    }
  });
});
