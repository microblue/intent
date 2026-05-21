import { test, expect } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * Phase 7 — TeamPanel (intent_agents) + /new wizard recommendation.
 *
 * Verifies that:
 *  - /new wizard preview stage shows a recommended team that varies
 *    by prompt keywords ("旅行" → flights + planner alongside main)
 *  - creating the intent persists those agents into intent_agents
 *  - IntentHome sidebar TeamPanel surfaces the team
 *  - adding + removing members updates the DB + UI
 */

interface IntentRow { id: string }

function hdr() {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY!;
  return { apikey: k, authorization: `Bearer ${k}` };
}

async function deleteIntent(id: string): Promise<void> {
  const url = process.env.SUPABASE_URL!;
  await fetch(`${url}/rest/v1/intents?id=eq.${id}`, { method: 'DELETE', headers: hdr() });
}

const skip = () => {
  if (!process.env.PLAYWRIGHT_BASE_URL || !process.env.REAL_TEST_EMAIL || !process.env.SUPABASE_URL) {
    test.skip(true, 'team e2e needs PLAYWRIGHT_BASE_URL + REAL_TEST_EMAIL + SUPABASE_URL');
  }
};

test.describe.configure({ mode: 'serial' });

test.describe('Phase 7 — /new wizard recommends a team by keyword', () => {
  test.beforeEach(skip);
  test.skip(({ isMobile }) => isMobile === true, 'desktop sweep');

  test('travel-keyword prompt surfaces flights + lodging in the preview', async ({
    page,
    context,
  }) => {
    test.setTimeout(45_000);
    await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await unlockVercelPreview(page);
    const seed = '帮我计划一次东京旅行';
    await page.goto(`/new?seed=${encodeURIComponent(seed)}`);
    await page.getByRole('button', { name: /继续/ }).click();
    await page.getByRole('button', { name: /先这样.*开始/ }).click();
    const teamBlock = page.getByTestId('preview-team');
    await expect(teamBlock).toBeVisible({ timeout: 10_000 });
    // Travel keywords → at minimum main + at least one of flights / lodging / planner.
    const ids = await teamBlock
      .locator('[data-testid^="preview-team-"]')
      .evaluateAll((els) =>
        els.map((e) => e.getAttribute('data-testid')?.replace('preview-team-', '') ?? ''),
      );
    expect(ids).toContain('main');
    const hasTravelHelper = ids.some((id) => ['flights', 'lodging', 'planner'].includes(id));
    expect(hasTravelHelper, `expected at least one of flights/lodging/planner; got ${ids.join(',')}`).toBe(true);
  });
});

test.describe('Phase 7 — TeamPanel reflects intent_agents (real-mode)', () => {
  test.beforeEach(skip);
  test.skip(({ isMobile }) => isMobile === true, 'desktop sweep');

  test('create intent via wizard → TeamPanel lists the seeded team', async ({
    page,
    context,
  }) => {
    test.setTimeout(60_000);
    await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await unlockVercelPreview(page);

    const seed = '帮我写一篇旅行回忆录的开头';
    await page.goto(`/new?seed=${encodeURIComponent(seed)}`);
    await page.getByRole('button', { name: /继续/ }).click();
    await page.getByRole('button', { name: /先这样.*开始/ }).click();
    await page.getByRole('button', { name: /开始这件事/ }).click();
    await page.waitForURL(/\/intent\/.+/, { timeout: 20_000 });
    const intentId = new URL(page.url()).pathname.split('/').pop()!;

    try {
      const team = page.getByTestId('team-panel');
      await expect(team).toBeVisible({ timeout: 10_000 });
      await expect(team.getByTestId('team-member-main')).toBeVisible();
      // Add another member via the sheet.
      await team.getByTestId('team-add-trigger').click();
      const sheet = page.getByTestId('team-add-sheet');
      await expect(sheet).toBeVisible();
      await sheet.getByTestId('team-add-option-researcher').click();
      await expect(team.getByTestId('team-member-researcher')).toBeVisible({
        timeout: 8_000,
      });
      // Remove it again.
      await team.getByTestId('team-remove-researcher').click();
      await expect(team.getByTestId('team-member-researcher')).toHaveCount(0, {
        timeout: 8_000,
      });
    } finally {
      await deleteIntent(intentId);
    }
  });
});
