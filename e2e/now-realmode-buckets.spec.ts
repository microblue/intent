import { test, expect } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * G1 — /now real-mode buckets verification.
 *
 * Seeds a recent assistant message on a throwaway intent and asserts
 * the "刚刚做完" (completed) section renders the derived row.
 * Then seeds a recent user message on a second throwaway intent and
 * asserts the "正在做" (running) section renders.
 */

const skip = () => {
  if (
    !process.env.PLAYWRIGHT_BASE_URL ||
    !process.env.REAL_TEST_EMAIL ||
    !process.env.SUPABASE_URL
  ) {
    test.skip(true, 'realmode bucket spec needs PLAYWRIGHT_BASE_URL + REAL_TEST_EMAIL + SUPABASE_URL');
  }
};

function hdr() {
  const k = (process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY)!;
  return { apikey: k, authorization: `Bearer ${k}` };
}

async function getRealClawId(userId: string): Promise<string> {
  const url = process.env.SUPABASE_URL!;
  const res = await fetch(
    `${url}/rest/v1/claws?user_id=eq.${userId}&plan_id=neq.aios-prototype&select=id&limit=1`,
    { headers: hdr() },
  );
  const rows = (await res.json()) as { id: string }[];
  return rows[0].id;
}

async function createIntent(
  userId: string,
  title: string,
): Promise<{ id: string }> {
  const url = process.env.SUPABASE_URL!;
  const clawId = await getRealClawId(userId);
  const id = `aios-now-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
  const r = await fetch(`${url}/rest/v1/intents`, {
    method: 'POST',
    headers: {
      ...hdr(),
      'content-type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      id,
      user_id: userId,
      claw_id: clawId,
      title,
      emoji: '🛎',
    }),
  });
  return ((await r.json()) as { id: string }[])[0];
}

async function deleteIntent(id: string): Promise<void> {
  const url = process.env.SUPABASE_URL!;
  await fetch(`${url}/rest/v1/messages?intent_id=eq.${id}`, {
    method: 'DELETE',
    headers: hdr(),
  });
  await fetch(`${url}/rest/v1/intents?id=eq.${id}`, {
    method: 'DELETE',
    headers: hdr(),
  });
}

async function insertMessage(
  intentId: string,
  userId: string,
  role: 'user' | 'assistant',
  text: string,
): Promise<void> {
  const url = process.env.SUPABASE_URL!;
  await fetch(`${url}/rest/v1/messages`, {
    method: 'POST',
    headers: { ...hdr(), 'content-type': 'application/json' },
    body: JSON.stringify({
      intent_id: intentId,
      user_id: userId,
      role,
      content: [{ type: 'text', text }],
    }),
  });
}

test.describe.configure({ mode: 'serial' });

test.describe('G1 — /now real-mode buckets from messages', () => {
  test.beforeEach(skip);
  test.skip(({ isMobile }) => isMobile === true, 'desktop sweep');

  test('recent assistant reply fills "刚刚做完" bucket', async ({ page, context }) => {
    const minted = await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    const intent = await createIntent(minted.user_id, 'now-done-fixture');
    try {
      await insertMessage(intent.id, minted.user_id, 'assistant', '搞定了!');
      await unlockVercelPreview(page);
      await page.goto('/now');
      // Wait for the derived bucket to render — useNowActivity refetches
      // every 30s and runs the first query on mount.
      await expect(page.getByRole('heading', { name: /刚刚做完/ }))
        .toBeVisible({ timeout: 15_000 });
      // The summary text shows the message preview inside the /now feed
      // row. (The same preview also appears in the sidebar's intent list,
      // so we narrow to the link whose accessible name starts with the
      // preview text, which is only the case for the /now done row.)
      await expect(
        page.getByRole('link', { name: /^搞定了!/ }),
      ).toBeVisible({ timeout: 5_000 });
    } finally {
      await deleteIntent(intent.id);
    }
  });

  test('recent user message fills "正在做" bucket', async ({ page, context }) => {
    const minted = await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    const intent = await createIntent(minted.user_id, 'now-running-fixture');
    try {
      await insertMessage(intent.id, minted.user_id, 'user', '帮我跑一下');
      await unlockVercelPreview(page);
      await page.goto('/now');
      await expect(page.getByRole('heading', { name: /正在做/ }))
        .toBeVisible({ timeout: 15_000 });
      await expect(
        page.getByRole('link', { name: /^帮我跑一下/ }),
      ).toBeVisible({ timeout: 5_000 });
    } finally {
      await deleteIntent(intent.id);
    }
  });
});
