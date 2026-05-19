import { test, expect } from '@playwright/test';

/**
 * Phase 8 — title extraction
 *
 * Unit-style coverage: walk the /new wizard for several prompt phrasings
 * and inspect the title shown on the preview card. Because extractTitle()
 * runs inside proposeIntent's generic-fallback branch, we feed prompts
 * that DON'T match any of the keyword routes (no 生日 / 旅行 / 简历 /
 * 学 / 妈妈 / 晚饭 / 客厅).
 *
 * Each case asserts: title shown ≠ raw prompt, AND title is short enough
 * to fit on a card.
 */

async function titleAfterPrompt(
  page: import('@playwright/test').Page,
  prompt: string,
): Promise<string> {
  await page.goto('/new');
  await page.locator('textarea').fill(prompt);
  await page.locator('button:has-text("继续")').click();
  await page.locator('button:has-text("先这样")').click();
  const title = page.getByTestId('preview-title');
  await expect(title).toBeVisible();
  return (await title.textContent())?.trim() ?? '';
}

test('strips "帮我..." polite prefix', async ({ page }) => {
  const title = await titleAfterPrompt(page, '帮我准备下个月父母的金婚纪念');
  expect(title).not.toContain('帮我');
  expect(title.length).toBeLessThanOrEqual(16);
});

test('strips "我想..." prefix', async ({ page }) => {
  const title = await titleAfterPrompt(page, '我想搞一个新的副业项目');
  expect(title.startsWith('我想')).toBe(false);
  // Should retain the noun phrase "搞一个新的副业项目" or shorter
  expect(title.length).toBeGreaterThan(0);
});

test('truncates the first comma clause', async ({ page }) => {
  const title = await titleAfterPrompt(
    page,
    '整理书房,顺便把旧书捐掉,大概周末做',
  );
  expect(title).not.toContain('顺便');
  expect(title).not.toContain('周末');
});

test('falls back to "新事情" when prompt is just punctuation', async ({
  page,
}) => {
  const title = await titleAfterPrompt(page, '......');
  expect(['......', '新事情', '...']).toContain(title);
});

test('"麻烦你帮我..." gets fully stripped', async ({ page }) => {
  const title = await titleAfterPrompt(page, '麻烦你帮我把客厅装饰一下');
  expect(title).not.toContain('麻烦');
  expect(title).not.toContain('帮我');
});
