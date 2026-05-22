import { test, expect } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * B4 — `/memory` add-fact composer.
 *
 * Memory facts are usually written by chat-side agents during a
 * conversation, but lay users also want a direct way to tell the
 * assistant "remember this" without first opening a project (e.g.
 * "我是素食", "周二周四在家办公"). The Memory page now exposes a
 * small composer above the category groups that INSERTs into
 * `public.memory_facts` for the signed-in user.
 *
 * Tests:
 *   1. mock-mode — composer renders, category chips work, submit
 *      surfaces the "演示模式不会保存" toast (no DB write).
 *   2. real-mode — composer INSERTs the row, the new fact appears
 *      in its category section, cleanup deletes the row.
 */

function hdr() {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY!;
  return { apikey: k, authorization: `Bearer ${k}`, 'content-type': 'application/json' };
}

async function deleteFactByText(text: string): Promise<void> {
  const url = process.env.SUPABASE_URL;
  if (!url) return;
  await fetch(`${url}/rest/v1/memory_facts?text=eq.${encodeURIComponent(text)}`, {
    method: 'DELETE',
    headers: hdr(),
  });
}

const realSkip = () => {
  if (
    !process.env.PLAYWRIGHT_BASE_URL ||
    !process.env.REAL_TEST_EMAIL ||
    !process.env.SUPABASE_URL
  ) {
    test.skip(true, 'B4 real-mode needs PLAYWRIGHT_BASE_URL + REAL_TEST_EMAIL + SUPABASE_URL');
  }
};

// ─────────── mock-mode (always runs locally) ───────────

test.describe('B4 — Memory composer (mock-mode)', () => {
  test.skip(({ isMobile }) => isMobile === true, 'desktop sweep');

  test('renders composer with category chips + submit shows demo toast', async ({ page }) => {
    await page.goto('/memory');

    const form = page.getByTestId('memory-add-form');
    await expect(form).toBeVisible({ timeout: 10_000 });

    // Default category is "about-you" — chip should be selected.
    await expect(page.getByTestId('memory-add-cat-about-you')).toHaveClass(/bg-primary/);

    // Click a different category and verify it becomes selected.
    await page.getByTestId('memory-add-cat-preferences').click();
    await expect(page.getByTestId('memory-add-cat-preferences')).toHaveClass(/bg-primary/);
    await expect(page.getByTestId('memory-add-cat-about-you')).not.toHaveClass(/bg-primary/);

    // Type + submit → mock-mode toast.
    await page.getByTestId('memory-add-input').fill('演示模式下不会保存');
    await page.getByTestId('memory-add-submit').click();
    // Match a substring that's unique to the failure toast — the
    // sidebar already renders "演示模式 · 数据不保存" as static copy,
    // so we'd hit a strict-mode locator collision on bare "演示模式".
    await expect(page.getByText(/记下的事不会被保存/)).toBeVisible({ timeout: 5_000 });
  });
});

// ─────────── real-mode (skips without env) ───────────

test.describe.configure({ mode: 'serial' });

test.describe('B4 — Memory composer (real-mode INSERT)', () => {
  test.beforeEach(realSkip);
  test.skip(({ isMobile }) => isMobile === true, 'desktop sweep');

  test('submit INSERTs memory_facts row + the fact appears in its category', async ({
    page,
    context,
  }) => {
    test.setTimeout(45_000);
    await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const text = `B4-test-${stamp}`;
    try {
      await unlockVercelPreview(page);
      await page.goto('/memory');

      await expect(page.getByTestId('memory-add-form')).toBeVisible({ timeout: 10_000 });

      // Pick "preferences" so the new fact lands under "你的偏好".
      await page.getByTestId('memory-add-cat-preferences').click();
      await page.getByTestId('memory-add-input').fill(text);
      await page.getByTestId('memory-add-submit').click();

      // Toast confirms the write went through.
      await expect(page.getByText(/记住了/)).toBeVisible({ timeout: 8_000 });

      // The new fact should appear on the page (React-Query
      // invalidation refetches). Wait for the row to mount.
      await expect(page.getByText(text)).toBeVisible({ timeout: 10_000 });

      // The input should clear on success so a second add starts fresh.
      await expect(page.getByTestId('memory-add-input')).toHaveValue('');
    } finally {
      await deleteFactByText(text);
    }
  });
});
