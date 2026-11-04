import { expect, test, type Page } from '@playwright/test';

/** Wait until Intent has finished its turn (the "thinking" bubble is gone). */
async function idle(page: Page) {
  await expect(page).toHaveURL(/\/t\//);
  await expect(page.getByRole('textbox')).toBeVisible();
  await expect(page.getByLabel('我想想…')).toHaveCount(0, { timeout: 15_000 });
}

test('first use: one sentence → question → plan → result → approve → paid → done', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '您好，我是 Intent。' })).toBeVisible();

  await page.getByRole('button', { name: /帮我给孙子挑个生日礼物/ }).click();
  await expect(page).toHaveURL(/\/t\//);
  await idle(page);

  // One question, answered with a button.
  await expect(page.getByText('小宝今年几岁？').first()).toBeVisible();
  await page.getByRole('button', { name: '4–6 岁' }).click();
  await idle(page);

  // The answer is kept and not asked again; the plan waits for OK.
  await expect(page.getByText('✓ 4–6 岁')).toBeVisible();
  await expect(page.getByRole('heading', { name: '我打算这样做' })).toBeVisible();
  await page.getByRole('button', { name: '好，开始' }).click();
  await idle(page);

  // Result + approval card with the five facts.
  await expect(page.getByRole('heading', { name: '3 个合适的礼物' })).toBeVisible();
  const card = page.getByRole('region', { name: '等您点头' });
  await expect(card.getByTestId('approval-amount')).toHaveText('US$49.99');
  await expect(card.getByText('Target')).toBeVisible();
  await expect(card.getByText('第一次在这家买')).toBeVisible();
  await expect(card.getByText('90 天内可以退')).toBeVisible();
  await expect(card.getByRole('button', { name: '不买了' })).toBeVisible();

  await card.getByRole('button', { name: '好，买这个' }).click();
  await idle(page);
  await expect(card.getByRole('link', { name: /去付款/ })).toHaveAttribute('href', 'https://www.target.com/');
  await expect(page.getByRole('status').first()).toHaveText('等您付款');
  await card.getByRole('button', { name: '我付好了' }).click();
  await idle(page);
  await expect(card.getByText('您已经付好了。')).toBeVisible();
  await expect(page.getByRole('status').first()).toHaveText('您已确认付款');

  // Home shows it as done; nothing is waiting.
  await page.getByRole('link', { name: '← 今天' }).click();
  await expect(page.getByText('您已确认付款')).toBeVisible();
  await expect(page.getByRole('heading', { name: /等您点头/ })).toHaveCount(0);

  // Spending was counted against the monthly limit.
  await page.goto('/me');
  await expect(page.getByText('这个月已经花了: $50')).toBeVisible();
});

test('waiting things go to the top of Today with a badge', async ({ page }) => {
  await page.goto('/new');
  await page.getByRole('textbox').fill('帮我挑个礼物');
  await page.getByRole('button', { name: '开始' }).click();
  await idle(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '等您点头 (1)' })).toBeVisible();
  await expect(page.getByText('小宝今年几岁？')).toBeVisible();
});

test('typing while a question is open answers that question', async ({ page }) => {
  await page.goto('/new');
  await page.getByRole('textbox').fill('帮我挑个礼物');
  await page.getByRole('button', { name: '开始' }).click();
  await idle(page);
  await page.getByRole('textbox').fill('他 5 岁');
  await page.getByRole('button', { name: '发送' }).click();
  await idle(page);
  await expect(page.getByText('✓ 他 5 岁')).toBeVisible();
  await expect(page.getByRole('heading', { name: '我打算这样做' })).toBeVisible();
});

test('scam check answers right away, no plan needed', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /这是不是骗子/ }).click();
  await idle(page);
  await expect(page.getByRole('heading', { name: '很可能是骗子' })).toBeVisible();
  await expect(page.getByRole('status').first()).toHaveText('看过了：很可能是骗子');
});

test('never-do list: gift cards are refused by the server', async ({ page }) => {
  await page.goto('/new');
  await page.getByRole('textbox').fill('帮我买一张礼品卡');
  await page.getByRole('button', { name: '开始' }).click();
  await idle(page);
  await page.getByRole('button', { name: '4–6 岁' }).click();
  await idle(page);
  await page.getByRole('button', { name: '好，开始' }).click();
  await idle(page);
  await expect(page.getByRole('alert')).toContainText('永远不做');
  await expect(page.getByRole('region', { name: '等您点头' })).toHaveCount(0);
});

test('spending limit: "none" blocks purchases', async ({ page }) => {
  await page.goto('/me');
  await page.getByRole('radiogroup', { name: '每笔最多花' }).getByRole('radio', { name: '不让花' }).click();
  await expect(page.getByRole('radiogroup', { name: '每笔最多花' }).getByRole('radio', { name: '不让花' })).toHaveAttribute('aria-checked', 'true');
  await page.goto('/new');
  await page.getByRole('textbox').fill('帮我挑个礼物');
  await page.getByRole('button', { name: '开始' }).click();
  await idle(page);
  await page.getByRole('button', { name: '4–6 岁' }).click();
  await idle(page);
  await page.getByRole('button', { name: '好，开始' }).click();
  await idle(page);
  await expect(page.getByRole('alert')).toContainText('每笔上限');
  await expect(page.getByRole('region', { name: '等您点头' })).toHaveCount(0);
});
