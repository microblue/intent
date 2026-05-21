import { test, expect } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * B2 — `/now` in real-mode hides the mock running/done activity feed.
 *
 * Spec (aios-design.md §6 / aios-ui-spec.md "正在做的事") calls for
 * `agent_calls` / `agent_traces` tables to back the running + done
 * buckets. Those tables don't exist in the shipped DB yet; until the
 * cross-repo schema lands in `~/myclaw`, real-mode collapses those
 * sections so signed-in users don't see fabricated activity. The
 * approvals bucket is real and stays visible.
 *
 * This spec locks in the collapse: when the page renders for a
 * signed-in user, "正在做" / "刚刚做完" headings must NOT appear (they
 * are mock-mode only now). The "等你点头" section may or may not show
 * depending on whether a real approval is pending, and the empty-state
 * card "现在很安静" should be reachable when both buckets are empty.
 */

const skip = () => {
  if (!process.env.PLAYWRIGHT_BASE_URL || !process.env.REAL_TEST_EMAIL || !process.env.SUPABASE_URL) {
    test.skip(true, 'B2 needs PLAYWRIGHT_BASE_URL + REAL_TEST_EMAIL + SUPABASE_URL');
  }
};

test.describe.configure({ mode: 'serial' });

test.describe('B2 — /now real-mode collapses mock running/done buckets', () => {
  test.beforeEach(skip);
  test.skip(({ isMobile }) => isMobile === true, 'desktop sweep');

  test('signed-in user does not see "正在做" or "刚刚做完" headings (mock-only)', async ({
    page,
    context,
  }) => {
    test.setTimeout(45_000);
    await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await unlockVercelPreview(page);
    await page.goto('/now');

    await expect(page.getByRole('heading', { level: 1, name: /正在为你做的事/ })).toBeVisible({
      timeout: 10_000,
    });

    // The running and done bucket headings render from mocks via
    // `nowSorted()` in mock-mode. In real-mode they must collapse,
    // because the underlying agent_calls / agent_traces tables aren't
    // wired up. Use `<h2>` since both bucket headings are h2 in Now.tsx.
    await expect(page.getByRole('heading', { level: 2, name: '正在做' })).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 2, name: '刚刚做完' })).toHaveCount(0);

    // Either the approvals section ("等你点头") is visible (real
    // pending decision) OR the empty-state card is shown. If neither,
    // something on the data path regressed.
    const approvals = page.getByRole('heading', { level: 2, name: '等你点头' });
    const empty = page.getByText(/现在很安静/);
    await Promise.race([
      approvals.first().waitFor({ state: 'visible', timeout: 8_000 }).then(() => 'approvals'),
      empty.first().waitFor({ state: 'visible', timeout: 8_000 }).then(() => 'empty'),
    ]).catch(() => {
      throw new Error('/now real-mode showed neither approvals nor empty-state');
    });
  });

  test('subtitle in real-mode omits running/done counts (only "等你点头")', async ({
    page,
    context,
  }) => {
    test.setTimeout(45_000);
    await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await unlockVercelPreview(page);
    await page.goto('/now');

    // PageHeader renders the subtitle text as a sibling under the h1.
    // In mock-mode it's "N 件等你点头 · N 件在跑 · N 件刚做完". In
    // real-mode it should collapse to "N 件等你点头" only — the "件在跑"
    // / "件刚做完" suffixes shouldn't appear when running/done are
    // mock-only.
    const h1 = page.getByRole('heading', { level: 1, name: /正在为你做的事/ });
    await expect(h1).toBeVisible({ timeout: 10_000 });

    // The header copy lives in the same PageHeader container; check
    // the full page body text for the absence of the mock-only labels.
    const bodyText = await page.locator('body').innerText();
    // "件等你点头" is fine — that's the real bucket.
    expect(bodyText).toContain('件等你点头');
    // The running/done count labels should NOT be in the subtitle
    // strip (they may appear elsewhere as section headings, but
    // those are gated out in real-mode by the h2 assertion above).
    // We assert by checking that "件在跑" and "件刚做完" do not appear
    // anywhere on the page in real-mode.
    expect(bodyText).not.toContain('件在跑');
    expect(bodyText).not.toContain('件刚做完');
  });
});
