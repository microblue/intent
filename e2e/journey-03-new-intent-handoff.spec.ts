import { test, expect, type Page } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * Journey 03 — /new 澄清回答 → /intent chat 还在.
 *
 * Persona: maker(DZ), high-density power user.
 * Goal: 起一件新事 → 回答 clarifying → 进 chat 看到我的话已经在对话里.
 *
 * Contract: `.ralph/journeys/03-new-intent-handoff.md`.
 *
 * This spec WILL FAIL until L3 ships. Today NewIntent.tsx:452 just
 * navigates without delivering prompt+answers into the chat thread.
 */

interface IntentRow { id: string; title: string }

function hdr() {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY!;
  return { apikey: k, authorization: `Bearer ${k}` };
}

async function listRecentIntents(userId: string, sinceTs: number, titleMatch: RegExp): Promise<IntentRow[]> {
  const url = process.env.SUPABASE_URL!;
  const iso = new Date(sinceTs).toISOString();
  const res = await fetch(
    `${url}/rest/v1/intents?user_id=eq.${userId}&created_at=gte.${iso}&select=id,title&order=created_at.desc&limit=20`,
    { headers: hdr() },
  );
  const rows = (await res.json()) as IntentRow[];
  return rows.filter((r) => titleMatch.test(r.title));
}

async function deleteIntent(id: string): Promise<void> {
  const url = process.env.SUPABASE_URL!;
  await fetch(`${url}/rest/v1/intents?id=eq.${id}`, { method: 'DELETE', headers: hdr() });
}

async function answerCurrent(page: Page, answer: string) {
  // The clarifying stage exposes a focused textarea; type + 进下一题
  // (a primary button). Selectors fall back to placeholder hints.
  const input = page.getByPlaceholder(/简单一句话|说几个字|回答/).first();
  await input.waitFor({ state: 'visible', timeout: 8_000 });
  await input.fill(answer);
  const next = page.getByRole('button', { name: /下一题|继续|完成|往下/ }).first();
  await next.click();
}

const skip = () => {
  if (!process.env.PLAYWRIGHT_BASE_URL || !process.env.REAL_TEST_EMAIL || !process.env.SUPABASE_URL) {
    test.skip(true, 'journey 03 needs PLAYWRIGHT_BASE_URL + REAL_TEST_EMAIL + SUPABASE_URL');
  }
};

test.describe.configure({ mode: 'serial' });

test.describe('Journey 03 — /new prompt+answers reach /intent chat', () => {
  test.beforeEach(skip);
  test.skip(({ isMobile }) => isMobile === true, 'desktop-only for now');

  test('clarifying answers land as the first user message after /new → /intent', async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    const email = process.env.REAL_TEST_EMAIL!;
    const minted = await injectRealSession(context, email);
    const sinceTs = Date.now() - 5_000;
    let createdIntentId: string | null = null;

    try {
      await unlockVercelPreview(page);
      await page.goto('/new');

      const prompt = '帮我策划周末野营';
      const promptInput = page.getByPlaceholder(/想做什么|想到什么|说一句/).first();
      await promptInput.waitFor({ state: 'visible', timeout: 10_000 });
      await promptInput.fill(prompt);
      await page.getByRole('button', { name: /开始|继续|下一步/ }).first().click();

      // Answer three clarifying questions.
      await answerCurrent(page, '4 大 2 小');
      await answerCurrent(page, '怀柔郊外有湖的地方');
      await answerCurrent(page, '下下周末');

      // Preview stage: confirm + 开始这件事.
      const confirm = page.getByRole('button', { name: /开始这件事|开始|创建/ }).first();
      await confirm.waitFor({ state: 'visible', timeout: 10_000 });
      await confirm.click();

      // We should land on /intent/<new-id>.
      await page.waitForURL(/\/intent\/[^/?#]+/, { timeout: 20_000 });
      const url = page.url();
      const idMatch = url.match(/\/intent\/([^/?#]+)/);
      expect(idMatch, `landed URL should be /intent/<id>: ${url}`).not.toBeNull();
      createdIntentId = idMatch?.[1] ?? null;

      // Pass criterion 1: chat has at least one user message at first load.
      const userMessages = page.locator(
        '[data-testid="chat-message"][data-role="user"]',
      );
      await expect(userMessages, '至少一条 user 消息').toHaveCount(1, { timeout: 20_000 });

      const firstUserText = await userMessages.first().innerText();

      // Pass criterion 2: that user message includes the prompt verbatim.
      expect(
        firstUserText,
        'first user message should include the prompt 原文 "周末野营"',
      ).toContain('周末野营');

      // Pass criterion 3: at least 2 clarifying answer fragments are present.
      const fragments = ['4 大 2 小', '怀柔', '下下周末'];
      const hits = fragments.filter((f) => firstUserText.includes(f)).length;
      expect(
        hits,
        `first user message should include >=2 of ${fragments.join(' / ')} — got "${firstUserText.slice(0, 200)}"`,
      ).toBeGreaterThanOrEqual(2);

      // Pass criterion 4: assistant follow-up arrives (not a stuck typing dot).
      const assistants = page.locator(
        '[data-testid="chat-message"][data-role="assistant"]',
      );
      await expect(assistants, '收到一条 assistant 回复').toHaveCount(1, { timeout: 90_000 });

      // Pass criterion 5: persistence — refresh and the user message is still there.
      await page.reload();
      await expect(userMessages).toHaveCount(1, { timeout: 20_000 });
      const persistedText = await userMessages.first().innerText();
      expect(persistedText).toContain('周末野营');
    } finally {
      if (createdIntentId) {
        await deleteIntent(createdIntentId);
      } else {
        // Best-effort cleanup if URL parse failed: nuke recently-created
        // J03 intents under this user.
        const orphans = await listRecentIntents(minted.user_id, sinceTs, /野营|J03/);
        for (const o of orphans) await deleteIntent(o.id);
      }
    }
  });
});
