import { test, expect } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * G5 — Settings 导出我的数据.
 *
 * Real-mode: seeds a throwaway intent + a memory fact, signs in, clicks
 * the 导出 button, awaits the browser-download event, then parses the
 * downloaded JSON and asserts the seeded rows appear under the right
 * keys. Cleans up afterwards.
 */

const skip = () => {
  if (
    !process.env.PLAYWRIGHT_BASE_URL ||
    !process.env.REAL_TEST_EMAIL ||
    !process.env.SUPABASE_URL ||
    !(process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY)
  ) {
    test.skip(
      true,
      'export spec needs PLAYWRIGHT_BASE_URL + REAL_TEST_EMAIL + SUPABASE_URL + service-role key',
    );
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
  const id = `aios-export-${Date.now().toString(36)}-${Math.random()
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
      emoji: '📦',
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

async function insertMemoryFact(
  userId: string,
  text: string,
): Promise<{ id: string }> {
  const url = process.env.SUPABASE_URL!;
  const r = await fetch(`${url}/rest/v1/memory_facts`, {
    method: 'POST',
    headers: {
      ...hdr(),
      'content-type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      user_id: userId,
      category: 'about-you',
      text,
    }),
  });
  return ((await r.json()) as { id: string }[])[0];
}

async function deleteMemoryFact(id: string): Promise<void> {
  const url = process.env.SUPABASE_URL!;
  await fetch(`${url}/rest/v1/memory_facts?id=eq.${id}`, {
    method: 'DELETE',
    headers: hdr(),
  });
}

test.describe.configure({ mode: 'serial' });

test.describe('G5 — settings export', () => {
  test.beforeEach(skip);

  test('downloads JSON containing seeded intent + memory fact', async ({
    page,
    context,
  }, info) => {
    test.skip(info.project.name !== 'chromium', 'download test runs on chromium');

    const minted = await injectRealSession(context, process.env.REAL_TEST_EMAIL!);

    const seededIntentTitle = `导出测试 · ${Date.now()}`;
    const seededFactText = `导出测试事实 · ${Date.now()}`;
    const intent = await createIntent(minted.user_id, seededIntentTitle);
    const fact = await insertMemoryFact(minted.user_id, seededFactText);

    try {
      await unlockVercelPreview(page);
      await page.goto('/settings');
      await expect(
        page.getByRole('heading', { level: 1, name: /^设置/ }),
      ).toBeVisible({ timeout: 10_000 });

      const exportBtn = page.getByTestId('settings-export');
      await expect(exportBtn).toBeVisible();
      await expect(exportBtn).toBeEnabled();

      const downloadPromise = page.waitForEvent('download', { timeout: 15_000 });
      await exportBtn.click();
      const download = await downloadPromise;

      const suggested = download.suggestedFilename();
      expect(suggested).toMatch(/^myclaw-export-\d{8}-\d{4}\.json$/);

      const path = await download.path();
      expect(path).toBeTruthy();
      const fs = await import('fs/promises');
      const raw = await fs.readFile(path!, 'utf8');
      const parsed = JSON.parse(raw) as {
        schema_version: number;
        user: { id: string };
        counts: { intents: number; memory_facts: number };
        intents: { id: string; title: string }[];
        memory_facts: { id: string; text: string }[];
      };

      expect(parsed.schema_version).toBe(1);
      expect(parsed.user.id).toBe(minted.user_id);
      expect(parsed.intents.some((i) => i.id === intent.id)).toBe(true);
      expect(parsed.memory_facts.some((f) => f.id === fact.id)).toBe(true);
      expect(parsed.counts.intents).toBeGreaterThanOrEqual(1);
      expect(parsed.counts.memory_facts).toBeGreaterThanOrEqual(1);
    } finally {
      await deleteMemoryFact(fact.id);
      await deleteIntent(intent.id);
    }
  });
});
