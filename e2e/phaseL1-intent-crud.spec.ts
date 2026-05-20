import { test, expect } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * L1 — Intent rename + archive real-mode.
 */

interface IntentRow { id: string; title: string; archived_at: string | null }

function hdr() {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY!;
  return { apikey: k, authorization: `Bearer ${k}` };
}

async function createIntent(userId: string, title: string): Promise<IntentRow> {
  const url = process.env.SUPABASE_URL!;
  const clawRes = await fetch(
    `${url}/rest/v1/claws?user_id=eq.${userId}&plan_id=neq.aios-prototype&select=id&limit=1`,
    { headers: hdr() },
  );
  const claws = (await clawRes.json()) as { id: string }[];
  const id = `aios-L1-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const res = await fetch(`${url}/rest/v1/intents`, {
    method: 'POST',
    headers: { ...hdr(), 'content-type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ id, user_id: userId, claw_id: claws[0].id, title, emoji: '🧪' }),
  });
  return (await res.json() as IntentRow[])[0];
}

async function fetchIntent(id: string): Promise<IntentRow | null> {
  const url = process.env.SUPABASE_URL!;
  const res = await fetch(`${url}/rest/v1/intents?id=eq.${id}&select=*`, { headers: hdr() });
  const rows = (await res.json()) as IntentRow[];
  return rows[0] ?? null;
}

async function deleteIntent(id: string): Promise<void> {
  const url = process.env.SUPABASE_URL!;
  await fetch(`${url}/rest/v1/intents?id=eq.${id}`, { method: 'DELETE', headers: hdr() });
}

const skip = () => {
  if (!process.env.PLAYWRIGHT_BASE_URL || !process.env.REAL_TEST_EMAIL || !process.env.SUPABASE_URL) {
    test.skip(true, 'L1 needs PLAYWRIGHT_BASE_URL + REAL_TEST_EMAIL + SUPABASE_URL');
  }
};

test.describe.configure({ mode: 'serial' });

test.describe('L1 — Intent rename real-mode (desktop)', () => {
  test.beforeEach(skip);
  test.skip(({ isMobile }) => isMobile === true, 'desktop dropdown');

  test('rename via inline title input persists to Supabase', async ({ page, context }) => {
    test.setTimeout(60_000);
    const minted = await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    let intent = await createIntent(minted.user_id, `L1-orig-${Date.now().toString(36)}`);
    try {
      await unlockVercelPreview(page);
      await page.goto(`/intent/${intent.id}`);
      await page.getByTestId('intent-title-button').click();
      const input = page.getByTestId('intent-title-input');
      await input.fill('L1 改后标题');
      await input.press('Enter');
      // Wait for the title to persist (network + cache invalidation).
      await page.waitForTimeout(2_000);
      const after = await fetchIntent(intent.id);
      expect(after?.title).toBe('L1 改后标题');
    } finally {
      await deleteIntent(intent.id);
    }
  });
});

test.describe('L1 — Intent archive real-mode (desktop)', () => {
  test.beforeEach(skip);
  test.skip(({ isMobile }) => isMobile === true, 'desktop dropdown');

  test('archive via header actions dropdown persists archived_at', async ({ page, context }) => {
    test.setTimeout(60_000);
    const minted = await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    let intent = await createIntent(minted.user_id, `L1-archive-${Date.now().toString(36)}`);
    try {
      await unlockVercelPreview(page);
      await page.goto(`/intent/${intent.id}`);
      await page.getByTestId('intent-actions').click();
      await page.getByTestId('intent-action-archive').click();
      // Real-mode UPDATE → archived_at set, page navigates back to /.
      await page.waitForURL(/\/$/, { timeout: 8_000 }).catch(() => {});
      await page.waitForTimeout(2_000);
      const after = await fetchIntent(intent.id);
      expect(after?.archived_at, 'archived_at should be set').not.toBeNull();
    } finally {
      await deleteIntent(intent.id);
    }
  });
});
