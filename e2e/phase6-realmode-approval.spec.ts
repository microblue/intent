import { test, expect } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * Phase 6 — real-mode approval-flow smoke.
 *
 * Trust loop ("敏感的事默认会先问你一下") is the product's anchor — if
 * approvals don't actually surface in the UI and clicking them doesn't
 * resolve them server-side, the whole permission model is theatre.
 *
 * This spec drives the in-app domain-approval path:
 *   1. service-role INSERT a pending approval into public.approvals
 *      tied to a throwaway intent for the test user
 *   2. inject a real Supabase session + open /now
 *   3. assert the approval card surfaces (Supabase Realtime + initial fetch)
 *   4. click the primary option (approves it)
 *   5. assert the card disappears from /now (Realtime UPDATE → cache drops it)
 *   6. confirm Supabase row flipped to status='approved'
 *   7. cleanup
 *
 * OpenClaw system-level `exec.approval.request` events are a separate
 * channel — when the canonical source for domain approvals moves from
 * Supabase to gateway-resident state, the same UI surface should keep
 * working via the gateway-event invalidation already wired in
 * useApprovals.ts. That migration is a follow-up.
 */

const TEST_INTENT_TITLE = 'aios-approval-smoke';

interface IntentRow { id: string }
interface ApprovalRow { id: string; status: string }

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
  const intentId = `aios-appr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const res = await fetch(`${url}/rest/v1/intents`, {
    method: 'POST',
    headers: {
      ...supabaseHeaders(),
      'content-type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      id: intentId,
      user_id: userId,
      claw_id: claws[0].id,
      title: TEST_INTENT_TITLE,
      emoji: '🛎',
    }),
  });
  if (!res.ok) throw new Error(`intent create failed: ${await res.text()}`);
  return (await res.json() as IntentRow[])[0];
}

async function createApproval(intentId: string, userId: string): Promise<ApprovalRow> {
  const url = process.env.SUPABASE_URL!;
  const res = await fetch(`${url}/rest/v1/approvals`, {
    method: 'POST',
    headers: {
      ...supabaseHeaders(),
      'content-type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      intent_id: intentId,
      user_id: userId,
      prompt: '帮你下单买这张机票?',
      detail: 'JFK → 成都  4 月 5 日  ¥3,842',
      options: [
        { label: '买', kind: 'primary' },
        { label: '再等等', kind: 'secondary' },
      ],
      status: 'pending',
    }),
  });
  if (!res.ok) throw new Error(`approval create failed: ${await res.text()}`);
  return (await res.json() as ApprovalRow[])[0];
}

async function fetchApproval(id: string): Promise<ApprovalRow | null> {
  const url = process.env.SUPABASE_URL!;
  const res = await fetch(`${url}/rest/v1/approvals?id=eq.${id}&select=*`, {
    headers: supabaseHeaders(),
  });
  const rows = (await res.json()) as ApprovalRow[];
  return rows[0] ?? null;
}

async function deleteIntent(id: string): Promise<void> {
  const url = process.env.SUPABASE_URL!;
  // Approvals cascade on intent delete (intent_id FK has ON DELETE CASCADE).
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
    test.skip(true, 'real-mode approval smoke needs all four env vars');
  }
};

test.describe.configure({ mode: 'serial' });

test.describe('Phase 6 — real-mode approval flow smoke', () => {
  test.beforeEach(skipUnlessRealMode);
  test.skip(({ isMobile }) => isMobile === true, 'desktop-only smoke for now');

  test('seed approval → /now shows card → click 买 → row flips to approved', async ({
    page,
    context,
  }) => {
    test.setTimeout(60_000);
    const email = process.env.REAL_TEST_EMAIL!;
    const minted = await injectRealSession(context, email);

    let intent: IntentRow | null = null;
    let approval: ApprovalRow | null = null;
    try {
      intent = await createIntent(minted.user_id);
      approval = await createApproval(intent.id, minted.user_id);

      await unlockVercelPreview(page);
      await page.goto('/now');

      // The approval card surfaces under the 等你点头 section. Match by
      // the prompt text (specific to this seed) so we don't grab any
      // pre-existing approval for this user.
      const card = page.locator('article', { hasText: '帮你下单买这张机票?' });
      await expect(card).toBeVisible({ timeout: 10_000 });

      // Click the primary action (买). useResolveApproval → Supabase
      // UPDATE → Realtime UPDATE event → cache drops the row.
      await card.getByRole('button', { name: '买' }).click();

      // The toast confirming choice + the card disappearing.
      await expect(page.getByText(/已选:买/)).toBeVisible({ timeout: 5_000 });
      await expect(card).toHaveCount(0, { timeout: 8_000 });

      // Server-side: row must be flipped to 'approved'.
      const final = await fetchApproval(approval.id);
      expect(final?.status).toBe('approved');
    } finally {
      if (intent) await deleteIntent(intent.id);
    }
  });
});
