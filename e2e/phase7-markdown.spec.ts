import { test, expect } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * Phase 7 — assistant messages render markdown.
 *
 * Injects an assistant message into Supabase with a representative
 * markdown payload (headings + lists + bold + emojis) and verifies
 * the chat surface renders structured DOM (not plain text).
 */

interface IntentRow { id: string }

function hdr() {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY!;
  return { apikey: k, authorization: `Bearer ${k}` };
}

async function seedIntent(userId: string, markdown: string): Promise<IntentRow> {
  const url = process.env.SUPABASE_URL!;
  const clawRes = await fetch(
    `${url}/rest/v1/claws?user_id=eq.${userId}&plan_id=neq.aios-prototype&select=id&limit=1`,
    { headers: hdr() },
  );
  const claws = (await clawRes.json()) as { id: string }[];
  const id = `aios-md-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const r = await fetch(`${url}/rest/v1/intents`, {
    method: 'POST',
    headers: { ...hdr(), 'content-type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ id, user_id: userId, claw_id: claws[0].id, title: 'md-render', emoji: '📝' }),
  });
  const intent = (await r.json() as IntentRow[])[0];
  // Seed one assistant message with markdown so we don't depend on the
  // LLM emitting specific shapes.
  await fetch(`${url}/rest/v1/messages`, {
    method: 'POST',
    headers: { ...hdr(), 'content-type': 'application/json' },
    body: JSON.stringify({
      intent_id: intent.id,
      user_id: userId,
      role: 'assistant',
      content: [{ type: 'text', text: markdown }],
    }),
  });
  return intent;
}

async function deleteIntent(id: string): Promise<void> {
  const url = process.env.SUPABASE_URL!;
  await fetch(`${url}/rest/v1/intents?id=eq.${id}`, { method: 'DELETE', headers: hdr() });
}

const skip = () => {
  if (!process.env.PLAYWRIGHT_BASE_URL || !process.env.REAL_TEST_EMAIL || !process.env.SUPABASE_URL) {
    test.skip(true, 'markdown smoke needs PLAYWRIGHT_BASE_URL + REAL_TEST_EMAIL + SUPABASE_URL');
  }
};

test.describe.configure({ mode: 'serial' });

test.describe('Phase 7 — assistant messages render markdown', () => {
  test.beforeEach(skip);
  test.skip(({ isMobile }) => isMobile === true, 'desktop sweep');

  const SAMPLE = `好问题!这里有几个推荐:

### 🏕️ 开车 1-2 小时

1. **Malibu Creek State Park**
   - 离市区 45 分钟
   - 有 \`Rock Pool\` 游泳

2. **Leo Carrillo State Park**
   - 海滩露营,潮汐池

> *五月底很舒服*

链接:[官网](https://www.parks.ca.gov)
`;

  test('GFM headings, lists, bold, code, blockquote, link all render as DOM', async ({ page, context }) => {
    test.setTimeout(45_000);
    const minted = await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    let intent: IntentRow | null = null;
    try {
      intent = await seedIntent(minted.user_id, SAMPLE);
      await unlockVercelPreview(page);
      await page.goto(`/intent/${intent.id}`);

      const assistant = page
        .locator('[data-testid="chat-message"][data-role="assistant"]')
        .first();
      await expect(assistant).toBeVisible({ timeout: 15_000 });

      // Headings — should be an h3 not raw "###" text.
      await expect(assistant.locator('h3')).toHaveCount(1);
      await expect(assistant.locator('h3')).toContainText('开车 1-2 小时');

      // Ordered list with 2 items + nested bullets.
      await expect(assistant.locator('ol > li')).toHaveCount(2);
      await expect(assistant.locator('ul')).not.toHaveCount(0);

      // Bold text rendered as <strong>.
      await expect(assistant.locator('strong').first()).toContainText('Malibu Creek');

      // Inline code as <code>.
      await expect(assistant.locator('code').first()).toContainText('Rock Pool');

      // Blockquote.
      await expect(assistant.locator('blockquote')).toHaveCount(1);

      // Link with target=_blank (markdown autolinks open externally).
      const link = assistant.locator('a').first();
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toContainText('官网');

      // Make sure the raw markdown chars are NOT in the rendered text.
      const text = await assistant.innerText();
      expect(text).not.toContain('###');
      expect(text).not.toContain('**Malibu');
    } finally {
      if (intent) await deleteIntent(intent.id);
    }
  });
});
