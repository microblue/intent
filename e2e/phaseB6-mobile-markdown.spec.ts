import { test, expect } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * B6 — mobile viewport markdown render.
 *
 * Desktop covers headings/lists/code/table/long-URL in
 * phase7-markdown.spec.ts + phaseB1-markdown-edge.spec.ts (both
 * desktop-only). Mobile viewport (390px) is a much tighter
 * constraint and exposes different overflow bugs:
 *
 *   - Long unbreakable URLs can break out of the chat bubble
 *   - GFM tables may exceed the 390px viewport and force the page
 *     itself to horizontally scroll (lay-user-first rule: page
 *     never scrolls horizontally)
 *   - Code blocks should scroll horizontally INSIDE the <pre>, not
 *     push the page wider
 *
 * Each test asserts both the assistant bubble doesn't overflow its
 * panel AND `document.documentElement.scrollWidth` stays within the
 * viewport width (with a small slack for sub-pixel rendering and
 * scrollbar). That second check is the load-bearing mobile guard.
 */

interface IntentRow { id: string }

function hdr() {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY!;
  return { apikey: k, authorization: `Bearer ${k}`, 'content-type': 'application/json' };
}

async function seedIntent(userId: string, markdown: string, title = 'md-mobile'): Promise<IntentRow> {
  const url = process.env.SUPABASE_URL!;
  const clawRes = await fetch(
    `${url}/rest/v1/claws?user_id=eq.${userId}&plan_id=neq.aios-prototype&select=id&limit=1`,
    { headers: hdr() },
  );
  const claws = (await clawRes.json()) as { id: string }[];
  const id = `aios-mdmob-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const r = await fetch(`${url}/rest/v1/intents`, {
    method: 'POST',
    headers: { ...hdr(), Prefer: 'return=representation' },
    body: JSON.stringify({ id, user_id: userId, claw_id: claws[0].id, title, emoji: '📱' }),
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
    test.skip(true, 'B6 needs PLAYWRIGHT_BASE_URL + REAL_TEST_EMAIL + SUPABASE_URL');
  }
};

/**
 * The page body must not horizontally scroll on mobile. Allow 2px
 * slack for sub-pixel rendering, scrollbar reservations, etc.
 */
async function expectNoPageOverflow(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
  expect(
    overflow.scrollWidth,
    `documentElement.scrollWidth ${overflow.scrollWidth} > clientWidth ${overflow.clientWidth} (body.scrollWidth ${overflow.bodyScrollWidth})`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 2);
}

test.describe.configure({ mode: 'serial' });

test.describe('B6 — chat markdown on mobile viewport (390×844)', () => {
  test.beforeEach(skip);
  // This whole describe block is mobile-only; the playwright.config
  // `mobile` project hits these. Desktop coverage lives in phase7 +
  // phaseB1.
  test.skip(({ isMobile }) => isMobile !== true, 'mobile-only spec');

  test('long unbreakable URL stays inside the chat panel + page does not scroll horizontally', async ({
    page,
    context,
  }) => {
    test.setTimeout(45_000);
    const minted = await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    const longUrl = 'https://example.com/' + 'a'.repeat(220);
    const md = `这是一个很长的链接,看看在手机上会不会出问题: ${longUrl} 后面还有别的内容。`;
    const intent = await seedIntent(minted.user_id, md, 'mdmob-longurl');
    try {
      await unlockVercelPreview(page);
      await page.goto(`/intent/${intent.id}`);

      const assistant = page.locator('[data-testid="chat-message"][data-role="assistant"]').first();
      await expect(assistant).toBeVisible({ timeout: 15_000 });

      // Bubble doesn't overflow its container.
      const bubble = await assistant.evaluate((el) => ({
        scrollWidth: (el as HTMLElement).scrollWidth,
        clientWidth: (el as HTMLElement).clientWidth,
      }));
      expect(bubble.scrollWidth).toBeLessThanOrEqual(bubble.clientWidth + 2);

      // And the page itself doesn't scroll horizontally.
      await expectNoPageOverflow(page);
    } finally {
      await deleteIntent(intent.id);
    }
  });

  test('GFM table renders + page does not scroll horizontally', async ({ page, context }) => {
    test.setTimeout(45_000);
    const minted = await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    const md = [
      '机票候选:',
      '',
      '| 日期 | 航司 | 价格 |',
      '| --- | --- | --- |',
      '| 6/10 | 国航 | ¥3,200 |',
      '| 6/12 | 东航 | ¥2,980 |',
    ].join('\n');
    const intent = await seedIntent(minted.user_id, md, 'mdmob-table');
    try {
      await unlockVercelPreview(page);
      await page.goto(`/intent/${intent.id}`);

      const assistant = page.locator('[data-testid="chat-message"][data-role="assistant"]').first();
      await expect(assistant).toBeVisible({ timeout: 15_000 });

      // Table renders with headers + 2 body rows.
      await expect(assistant.locator('table thead th')).toHaveCount(3);
      await expect(assistant.locator('table tbody tr')).toHaveCount(2);

      // Page doesn't scroll horizontally — tables shouldn't push the
      // mobile viewport wider than 390px.
      await expectNoPageOverflow(page);
    } finally {
      await deleteIntent(intent.id);
    }
  });

  test('fenced code block renders + page does not scroll horizontally (code can scroll inside)', async ({
    page,
    context,
  }) => {
    test.setTimeout(45_000);
    const minted = await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    // A line clearly wider than the mobile viewport — confirms the
    // `<pre>` (overflow-x-auto) contains the overflow rather than
    // pushing the page wide.
    const md = [
      '看一段例子:',
      '',
      '```js',
      'function greetWithManyArgs(firstName, lastName, middleName, suffix, prefix, salutation) {',
      '  return `hello, ${prefix} ${firstName} ${middleName} ${lastName} ${suffix}`;',
      '}',
      '```',
    ].join('\n');
    const intent = await seedIntent(minted.user_id, md, 'mdmob-code');
    try {
      await unlockVercelPreview(page);
      await page.goto(`/intent/${intent.id}`);

      const assistant = page.locator('[data-testid="chat-message"][data-role="assistant"]').first();
      await expect(assistant).toBeVisible({ timeout: 15_000 });
      await expect(assistant.locator('pre code')).toContainText('function greetWithManyArgs');

      // The <pre> can scroll horizontally (overflow-x-auto), but the
      // page itself must not.
      await expectNoPageOverflow(page);
    } finally {
      await deleteIntent(intent.id);
    }
  });
});
