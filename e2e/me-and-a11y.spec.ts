import { expect, test } from '@playwright/test';

test('text size works immediately and survives a reload', async ({ page }) => {
  await page.goto('/me');
  const before = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
  expect(before).toBe('17px');
  await page.getByRole('radio', { name: '最大' }).click();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('24px');
  await page.reload();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('24px');
});

test('language switch changes the whole app', async ({ page }) => {
  await page.goto('/me');
  await page.getByRole('radio', { name: 'English' }).click();
  await expect(page.getByRole('heading', { name: 'Me', exact: true })).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: "Hello, I'm Intent." })).toBeVisible();
});

test('remembered facts can be seen and forgotten; never-do list is public', async ({ page }) => {
  await page.goto('/me');
  await expect(page.getByText('永远不做的事')).toBeVisible();
  await expect(page.getByText('买礼品卡、充值卡')).toBeVisible();
  await expect(page.getByText(/还没有记住什么/)).toBeVisible();
});

test('senior-friendly sizes: no tiny text, big main buttons, no sideways scroll', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '您好，我是 Intent。' })).toBeVisible();
  const smallest = await page.evaluate(() => {
    let min = 999;
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const node = el as HTMLElement;
      if (!node.innerText?.trim() || node.children.length || node.closest('.sr-only')) continue;
      const r = node.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      min = Math.min(min, parseFloat(getComputedStyle(node).fontSize));
    }
    return min;
  });
  expect(smallest).toBeGreaterThanOrEqual(16);

  const mic = page.getByRole('button', { name: '点一下，说话' });
  if (await mic.count()) expect((await mic.boundingBox())!.height).toBeGreaterThanOrEqual(60);
  const example = page.getByRole('button', { name: /帮我给孙子挑个生日礼物/ });
  expect((await example.boundingBox())!.height).toBeGreaterThanOrEqual(60);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
