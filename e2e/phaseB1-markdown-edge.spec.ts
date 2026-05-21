import { test, expect } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * Phase B1 — markdown edge cases beyond the GFM-basics smoke in
 * `phase7-markdown.spec.ts`. Covers:
 *
 *   1. Fenced `js` code block — fence with a language hint renders as
 *      `<pre><code>` with the actual code (not raw backticks).
 *   2. GFM table — pipe table renders as `<table>` with header row +
 *      body rows containing the cell text.
 *   3. Long-line wrap — an unbreakable URL inside paragraph text does
 *      not push the chat-message bubble wider than its allotted width
 *      (no horizontal scroll on the message container).
 *   4. Mid-stream reload persistence — an assistant message persisted
 *      to Supabase (i.e. what a stream-interrupted message looks like
 *      from the server's POV) is still rendered after a fresh page
 *      load. Proxy for "user reloads mid-stream and doesn't lose the
 *      partial text the gateway already pushed".
 */

interface IntentRow { id: string }

function hdr() {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY!;
  return { apikey: k, authorization: `Bearer ${k}`, 'content-type': 'application/json' };
}

async function seedIntent(userId: string, markdown: string, title = 'md-edge'): Promise<IntentRow> {
  const url = process.env.SUPABASE_URL!;
  const clawRes = await fetch(
    `${url}/rest/v1/claws?user_id=eq.${userId}&plan_id=neq.aios-prototype&select=id&limit=1`,
    { headers: hdr() },
  );
  const claws = (await clawRes.json()) as { id: string }[];
  const id = `aios-mdedge-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const r = await fetch(`${url}/rest/v1/intents`, {
    method: 'POST',
    headers: { ...hdr(), Prefer: 'return=representation' },
    body: JSON.stringify({ id, user_id: userId, claw_id: claws[0].id, title, emoji: '📝' }),
  });
  const intent = (await r.json() as IntentRow[])[0];
  await fetch(`${url}/rest/v1/messages`, {
    method: 'POST',
    headers: hdr(),
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
    test.skip(true, 'B1 needs PLAYWRIGHT_BASE_URL + REAL_TEST_EMAIL + SUPABASE_URL');
  }
};

test.describe.configure({ mode: 'serial' });

test.describe('B1 — chat markdown edge cases', () => {
  test.beforeEach(skip);
  test.skip(({ isMobile }) => isMobile === true, 'desktop sweep; mobile spec is B6');

  test('fenced `js` code block renders as <pre><code> with content', async ({ page, context }) => {
    test.setTimeout(45_000);
    const minted = await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    const md = [
      '看一段例子:',
      '',
      '```js',
      'function greet(name) {',
      '  return `hello, ${name}`;',
      '}',
      '```',
      '',
      '上面就是。',
    ].join('\n');
    const intent = await seedIntent(minted.user_id, md, 'md-codeblock');
    try {
      await unlockVercelPreview(page);
      await page.goto(`/intent/${intent.id}`);

      const assistant = page.locator('[data-testid="chat-message"][data-role="assistant"]').first();
      await expect(assistant).toBeVisible({ timeout: 15_000 });

      // Fenced block → <pre><code>. We don't assert on the
      // language-js class because react-markdown's default output may
      // or may not attach one without a syntax-highlighter plugin.
      const pre = assistant.locator('pre');
      await expect(pre).toHaveCount(1);
      await expect(pre.locator('code')).toContainText('function greet');
      await expect(pre.locator('code')).toContainText('return `hello');

      // Raw triple-backticks must not appear in the rendered text.
      const text = await assistant.innerText();
      expect(text).not.toContain('```js');
      expect(text).not.toContain('```\n');
    } finally {
      await deleteIntent(intent.id);
    }
  });

  test('GFM pipe table renders as <table> with headers and body rows', async ({ page, context }) => {
    test.setTimeout(45_000);
    const minted = await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    const md = [
      '机票候选:',
      '',
      '| 日期 | 航司 | 价格 |',
      '| --- | --- | --- |',
      '| 6/10 | 国航 | ¥3,200 |',
      '| 6/12 | 东航 | ¥2,980 |',
      '| 6/15 | 海航 | ¥3,450 |',
    ].join('\n');
    const intent = await seedIntent(minted.user_id, md, 'md-table');
    try {
      await unlockVercelPreview(page);
      await page.goto(`/intent/${intent.id}`);

      const assistant = page.locator('[data-testid="chat-message"][data-role="assistant"]').first();
      await expect(assistant).toBeVisible({ timeout: 15_000 });

      const table = assistant.locator('table');
      await expect(table).toHaveCount(1);
      // Three th headers in the head row.
      await expect(table.locator('thead th')).toHaveCount(3);
      await expect(table.locator('thead th').first()).toContainText('日期');
      // Three tbody rows.
      await expect(table.locator('tbody tr')).toHaveCount(3);
      // Specific cell content.
      await expect(table.locator('tbody tr').nth(1)).toContainText('东航');
      await expect(table.locator('tbody tr').nth(1)).toContainText('¥2,980');

      // Raw pipes must not appear in the rendered text.
      const text = await assistant.innerText();
      expect(text).not.toContain('| 日期 |');
      expect(text).not.toContain('| --- |');
    } finally {
      await deleteIntent(intent.id);
    }
  });

  test('long unbreakable URL in paragraph wraps within the bubble (no horizontal overflow)', async ({
    page,
    context,
  }) => {
    test.setTimeout(45_000);
    const minted = await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    // A 220-character single-token URL with no break opportunities.
    const longUrl =
      'https://example.com/' + 'a'.repeat(200);
    const md = `这是一个很长的链接,看看会不会撑爆消息框: ${longUrl} 后面还有别的内容。`;
    const intent = await seedIntent(minted.user_id, md, 'md-longurl');
    try {
      await unlockVercelPreview(page);
      await page.goto(`/intent/${intent.id}`);

      const assistant = page.locator('[data-testid="chat-message"][data-role="assistant"]').first();
      await expect(assistant).toBeVisible({ timeout: 15_000 });

      // The link must be inside the message as an <a>.
      const link = assistant.locator('a').first();
      await expect(link).toHaveAttribute('href', new RegExp(`^${longUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));

      // The assistant message container must not horizontally
      // overflow: scrollWidth <= clientWidth (with 2px slack for
      // sub-pixel rendering). If a long token caused a horizontal
      // scrollbar, scrollWidth would exceed clientWidth.
      const overflow = await assistant.evaluate((el) => ({
        scrollWidth: (el as HTMLElement).scrollWidth,
        clientWidth: (el as HTMLElement).clientWidth,
      }));
      expect(overflow.scrollWidth, `assistant message overflowed: ${JSON.stringify(overflow)}`)
        .toBeLessThanOrEqual(overflow.clientWidth + 2);
    } finally {
      await deleteIntent(intent.id);
    }
  });

  test('assistant message persisted to Supabase survives a page reload (mid-stream proxy)', async ({
    page,
    context,
  }) => {
    test.setTimeout(45_000);
    const minted = await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    // A partial-looking text (incomplete markdown bold) — what a
    // mid-stream message persisted by the gateway would look like.
    const md = '好的,我帮你查一下这个 **东京樱花';
    const intent = await seedIntent(minted.user_id, md, 'md-reload');
    try {
      await unlockVercelPreview(page);
      await page.goto(`/intent/${intent.id}`);

      const assistant = page.locator('[data-testid="chat-message"][data-role="assistant"]').first();
      await expect(assistant).toBeVisible({ timeout: 15_000 });
      await expect(assistant).toContainText('东京樱花');

      // Force a hard reload — simulating the user refreshing
      // mid-stream. The persisted partial message must come back from
      // Supabase and re-render.
      await page.reload();

      const assistantAfter = page
        .locator('[data-testid="chat-message"][data-role="assistant"]')
        .first();
      await expect(assistantAfter).toBeVisible({ timeout: 15_000 });
      await expect(assistantAfter).toContainText('东京樱花');
      // The partial open `**` should render literally (react-markdown
      // handles partial input gracefully — open bold just stays raw).
      // Either way, the user-visible chars before the open `**` should
      // be present.
      await expect(assistantAfter).toContainText('好的,我帮你查一下这个');
    } finally {
      await deleteIntent(intent.id);
    }
  });
});
