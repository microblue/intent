import { test, expect, type Page } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * Journey 01 — 妈妈 / 跨意图回忆过敏.
 *
 * Persona: 妈妈, 55, AI naive, uses myclaw for household tasks.
 * Goal: 告诉助手女儿对花生过敏, 让它以后买零食时帮我避开.
 *
 * Contract is in `.ralph/journeys/01-mom-remember-allergy.md`.
 * Each `pass_criteria` line in that file maps to a separate expect()
 * below — do NOT bundle them.
 *
 * This spec WILL FAIL on prod until L1 (memory auto-record) ships:
 *   - chat user-messages don't extract memory candidates today
 *   - cross-intent recall doesn't fold memory_facts into the
 *     gateway system prompt
 *
 * The failure is the contract — the v3 protocol is: write the
 * acceptance spec FIRST, then make the product honest.
 */

interface IntentRow { id: string }

function hdr() {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY!;
  return { apikey: k, authorization: `Bearer ${k}` };
}

async function getClawId(userId: string): Promise<string> {
  const url = process.env.SUPABASE_URL!;
  const res = await fetch(
    `${url}/rest/v1/claws?user_id=eq.${userId}&plan_id=neq.aios-prototype&select=id&limit=1`,
    { headers: hdr() },
  );
  const rows = (await res.json()) as { id: string }[];
  if (!rows[0]) throw new Error('test user has no real claw');
  return rows[0].id;
}

async function createIntent(userId: string, title: string, emoji: string): Promise<IntentRow> {
  const url = process.env.SUPABASE_URL!;
  const clawId = await getClawId(userId);
  const id = `aios-j01-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const res = await fetch(`${url}/rest/v1/intents`, {
    method: 'POST',
    headers: { ...hdr(), 'content-type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ id, user_id: userId, claw_id: clawId, title, emoji }),
  });
  if (!res.ok) throw new Error(`create intent: ${res.status} ${await res.text()}`);
  return (await res.json() as IntentRow[])[0];
}

async function deleteIntent(id: string): Promise<void> {
  const url = process.env.SUPABASE_URL!;
  await fetch(`${url}/rest/v1/intents?id=eq.${id}`, { method: 'DELETE', headers: hdr() });
}

async function listMemoryFacts(userId: string): Promise<Array<{ id: string; text: string; category: string }>> {
  const url = process.env.SUPABASE_URL!;
  const res = await fetch(
    `${url}/rest/v1/memory_facts?user_id=eq.${userId}&select=id,text,category`,
    { headers: hdr() },
  );
  return (await res.json()) as Array<{ id: string; text: string; category: string }>;
}

async function sendInChat(page: Page, text: string) {
  const composer = page.getByPlaceholder(/想到什么直接说就好/);
  await composer.fill(text);
  await page.getByRole('button', { name: '发送' }).click();
}

const skip = () => {
  if (!process.env.PLAYWRIGHT_BASE_URL || !process.env.REAL_TEST_EMAIL || !process.env.SUPABASE_URL) {
    test.skip(true, 'journey 01 needs PLAYWRIGHT_BASE_URL + REAL_TEST_EMAIL + SUPABASE_URL');
  }
};

test.describe.configure({ mode: 'serial' });

test.describe('Journey 01 — 妈妈记住女儿花生过敏', () => {
  test.beforeEach(skip);
  test.skip(({ isMobile }) => isMobile === true, 'desktop-driven journey for now');

  test('cross-intent allergy recall + memory page count consistency', async ({ page, context }) => {
    test.setTimeout(240_000);
    const email = process.env.REAL_TEST_EMAIL!;
    const minted = await injectRealSession(context, email);

    const intentA = await createIntent(minted.user_id, 'J01-生日礼物', '🎁');
    const intentB = await createIntent(minted.user_id, 'J01-野营零食', '🏕️');

    try {
      await unlockVercelPreview(page);

      // Step 1–3: intent A — declare the peanut allergy.
      await page.goto(`/intent/${intentA.id}`);
      await expect(page.getByTestId('claw-status')).toHaveAttribute(
        'data-status',
        'connected',
        { timeout: 30_000 },
      );
      await sendInChat(
        page,
        '提醒一下,小雨对花生过敏,不能买含花生的东西',
      );
      const assistantsA = page.locator(
        '[data-testid="chat-message"][data-role="assistant"]',
      );
      await expect(assistantsA).toHaveCount(1, { timeout: 60_000 });

      // Step 4–6: intent B — ask for snacks for 女儿 小雨.
      await page.goto(`/intent/${intentB.id}`);
      await expect(page.getByTestId('claw-status')).toHaveAttribute(
        'data-status',
        'connected',
        { timeout: 30_000 },
      );
      await sendInChat(page, '我女儿小雨,给她带点零食路上吃');
      const assistantsB = page.locator(
        '[data-testid="chat-message"][data-role="assistant"]',
      );
      await expect(assistantsB).toHaveCount(1, { timeout: 60_000 });
      const replyText = (await assistantsB.last().innerText()).toLowerCase();

      // Pass criterion 1: assistant either mentions 花生 OR proactively
      // asks about allergies/dietary restrictions (graceful degradation).
      const mentionsPeanut = replyText.includes('花生');
      const asksAllergy = /过敏|忌口/.test(replyText);
      expect(
        mentionsPeanut || asksAllergy,
        `intent B 助手回复未提到花生 / 未询问过敏忌口: ${replyText.slice(0, 200)}`,
      ).toBeTruthy();

      // Pass criterion 2: memory_facts contains a 小雨 + 花生 record.
      const facts = await listMemoryFacts(minted.user_id);
      const factText = facts.map((f) => f.text).join('\n');
      expect(
        /小雨/.test(factText) && /花生/.test(factText),
        `memory_facts should contain a row referencing 小雨 + 花生 (got ${facts.length} rows: ${factText.slice(0, 300)})`,
      ).toBeTruthy();

      // Pass criterion 3: /memory total count matches memory_facts row count.
      await page.goto('/memory');
      await page.waitForLoadState('networkidle');
      // The Memory page header subtitle includes "我记得你的 N 件事".
      const subtitle = await page.locator('text=/我记得你的\\s*\\d+\\s*件事/').first().innerText();
      const match = subtitle.match(/(\d+)\s*件事/);
      expect(match, `Memory subtitle should expose a number — got "${subtitle}"`).not.toBeNull();
      const uiCount = match ? Number(match[1]) : -1;
      expect(uiCount, `Memory UI count (${uiCount}) must match memory_facts row count (${facts.length})`).toBe(facts.length);
    } finally {
      await deleteIntent(intentA.id);
      await deleteIntent(intentB.id);
    }
  });
});
