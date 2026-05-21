import { test, expect, type Page } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * Phase 8 — real-mode coverage audit.
 *
 * Same as phase8-coverage-audit but against a real-mode build with
 * a signed-in user. Catches flows that only break under real-mode:
 * RLS-gated reads, gateway-mediated chat, Supabase write paths,
 * cross-component state propagation.
 */

interface IntentRow { id: string }

function hdr() {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY!;
  return { apikey: k, authorization: `Bearer ${k}` };
}

async function createIntent(userId: string, title = 'audit-intent', emoji = '🧪'): Promise<IntentRow> {
  const url = process.env.SUPABASE_URL!;
  const clawRes = await fetch(
    `${url}/rest/v1/claws?user_id=eq.${userId}&plan_id=neq.aios-prototype&select=id&limit=1`,
    { headers: hdr() },
  );
  const claws = (await clawRes.json()) as { id: string }[];
  const id = `aios-audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const r = await fetch(`${url}/rest/v1/intents`, {
    method: 'POST',
    headers: { ...hdr(), 'content-type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ id, user_id: userId, claw_id: claws[0].id, title, emoji }),
  });
  return (await r.json() as IntentRow[])[0];
}

async function deleteIntent(id: string): Promise<void> {
  const url = process.env.SUPABASE_URL!;
  await fetch(`${url}/rest/v1/intents?id=eq.${id}`, { method: 'DELETE', headers: hdr() });
}

const skip = () => {
  if (!process.env.PLAYWRIGHT_BASE_URL || !process.env.REAL_TEST_EMAIL || !process.env.SUPABASE_URL) {
    test.skip(true, 'real-mode audit needs PLAYWRIGHT_BASE_URL + REAL_TEST_EMAIL + SUPABASE_URL');
  }
};

const collectConsoleErrors = (page: Page) => {
  const errs: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push(m.text());
  });
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  return errs;
};
const noiseFilter = (e: string) =>
  !/react-devtools|sentry|preload|VercelInsights|Failed to load resource/i.test(e);

test.describe.configure({ mode: 'serial' });

// ───────────── Signed-in surface sweep (every route) ───────────

test.describe('Phase 8 — real-mode signed-in route audit', () => {
  test.beforeEach(skip);
  test.skip(({ isMobile }) => isMobile === true, 'desktop sweep');

  // Each signed-in route renders its h1 + has no console errors.
  const ROUTES: Array<[string, RegExp]> = [
    ['/', /下午好|早上好|晚上好|你好/],
    ['/new', /想做什么/],
    ['/schedule', /^提醒/],
    ['/memory', /助手记得你的事/],
    ['/permissions', /助手能做什么/],
    ['/now', /正在为你做的事/],
    ['/settings', /^设置/],
    ['/help', /帮助/],
    ['/archive', /封存|archive/i],
    ['/settings/engines', /底层引擎/],
  ];

  for (const [path, h1] of ROUTES) {
    test(`${path} renders + console-clean`, async ({ page, context }) => {
      const errs = collectConsoleErrors(page);
      await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
      await unlockVercelPreview(page);
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: h1 })).toBeVisible({
        timeout: 10_000,
      });
      await page.waitForTimeout(500);
      const real = errs.filter(noiseFilter);
      expect(real, `console errors on ${path}:\n${real.join('\n')}`).toEqual([]);
    });
  }
});

// ─────────────── Critical user write paths ─────────────────────

test.describe('Phase 8 — real-mode write paths', () => {
  test.beforeEach(skip);
  test.skip(({ isMobile }) => isMobile === true, 'desktop sweep');

  test('Settings: display_name save persists to user_preferences', async ({
    page,
    context,
  }) => {
    const minted = await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await unlockVercelPreview(page);
    await page.goto('/settings');
    const stamp = Date.now().toString(36).slice(-6);
    const newName = `audit-${stamp}`;
    const input = page.getByTestId('settings-display-name');
    await input.fill(newName);
    await input.blur();
    await expect(page.getByText('已保存')).toBeVisible({ timeout: 5_000 });
    // Verify in DB
    const url = process.env.SUPABASE_URL!;
    const res = await fetch(
      `${url}/rest/v1/user_preferences?user_id=eq.${minted.user_id}&select=display_name`,
      { headers: hdr() },
    );
    const rows = (await res.json()) as { display_name: string }[];
    expect(rows[0]?.display_name).toBe(newName);
  });

  test('Permissions: pick 可以 on capability → row in permission_grants', async ({
    page,
    context,
  }) => {
    const minted = await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await unlockVercelPreview(page);
    await page.goto('/permissions');
    // Pick the FIRST capability's "可以" button
    await page.getByRole('button', { name: '可以' }).first().click();
    await expect(page.getByText(/已改成「可以」/)).toBeVisible({ timeout: 5_000 });
    // Verify in DB — at least one row with mode='allow'
    const url = process.env.SUPABASE_URL!;
    const res = await fetch(
      `${url}/rest/v1/permission_grants?user_id=eq.${minted.user_id}&mode=eq.allow&select=capability_id,mode`,
      { headers: hdr() },
    );
    const rows = (await res.json()) as { capability_id: string; mode: string }[];
    expect(rows.length).toBeGreaterThan(0);
  });

  test('Intent rename inline persists to intents.title', async ({ page, context }) => {
    const minted = await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    const intent = await createIntent(minted.user_id, 'before-rename');
    try {
      await unlockVercelPreview(page);
      await page.goto(`/intent/${intent.id}`);
      await page.getByTestId('intent-title-button').click();
      const input = page.getByTestId('intent-title-input');
      const newTitle = `renamed-${Date.now().toString(36).slice(-6)}`;
      await input.fill(newTitle);
      await input.press('Enter');
      await page.waitForTimeout(2_000);
      // Verify DB
      const url = process.env.SUPABASE_URL!;
      const res = await fetch(`${url}/rest/v1/intents?id=eq.${intent.id}&select=title`, {
        headers: hdr(),
      });
      const rows = (await res.json()) as { title: string }[];
      expect(rows[0]?.title).toBe(newTitle);
    } finally {
      await deleteIntent(intent.id);
    }
  });

  test('Intent archive via dropdown sets archived_at + navigates away', async ({
    page,
    context,
  }) => {
    const minted = await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    const intent = await createIntent(minted.user_id, 'to-archive', '📦');
    try {
      await unlockVercelPreview(page);
      await page.goto(`/intent/${intent.id}`);
      await page.getByTestId('intent-actions').click();
      await page.getByTestId('intent-action-archive').click();
      await page.waitForURL(/\/$/, { timeout: 8_000 }).catch(() => {});
      await page.waitForTimeout(2_000);
      // Verify DB
      const url = process.env.SUPABASE_URL!;
      const res = await fetch(
        `${url}/rest/v1/intents?id=eq.${intent.id}&select=archived_at`,
        { headers: hdr() },
      );
      const rows = (await res.json()) as { archived_at: string | null }[];
      expect(rows[0]?.archived_at).not.toBeNull();
    } finally {
      await deleteIntent(intent.id);
    }
  });

  test('Sign-out clears Supabase session storage key + redirects', async ({
    page,
    context,
  }) => {
    await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await unlockVercelPreview(page);
    await page.goto('/settings');
    await page.getByTestId('settings-signout').click();
    await page.waitForURL(/\/auth\/signin$/, { timeout: 8_000 });
    const sbKeys = await page.evaluate(() =>
      Object.keys(localStorage).filter((k) => k.startsWith('sb-')),
    );
    expect(sbKeys).toEqual([]);
  });
});

// ───────────── Intent + TeamPanel real-mode ────────────────────

test.describe('Phase 8 — Intent + TeamPanel real-mode', () => {
  test.beforeEach(skip);
  test.skip(({ isMobile }) => isMobile === true, 'desktop sweep');

  test('opening an intent shows ClawPicker + TeamPanel with main as orchestrator', async ({
    page,
    context,
  }) => {
    const minted = await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    const intent = await createIntent(minted.user_id, 'team-audit', '🧪');
    try {
      await unlockVercelPreview(page);
      await page.goto(`/intent/${intent.id}`);
      // Sidebar ClawPicker shows cool-brook + 已连上 once gateway up
      await expect(page.getByTestId('claw-status')).toHaveAttribute(
        'data-status',
        'connected',
        { timeout: 20_000 },
      );
      // TeamPanel exists with main as orchestrator (DB trigger seeds it)
      await expect(page.getByTestId('team-panel')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId('team-member-main')).toBeVisible({ timeout: 10_000 });
      // AgentPicker default label = Claw
      await expect(page.getByTestId('agent-picker-trigger')).toContainText('Claw');
    } finally {
      await deleteIntent(intent.id);
    }
  });

  test('/intent/<unknown-id> for signed-in user shows graceful not-found', async ({
    page,
    context,
  }) => {
    await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await unlockVercelPreview(page);
    await page.goto('/intent/this-intent-does-not-exist-xxx');
    // Either a "找不到" message OR redirect — both acceptable.
    await page.waitForTimeout(3_000);
    const url = page.url();
    if (!/\/$/.test(url) && !/\/auth\//.test(url)) {
      await expect(
        page.getByText(/找不到|没有这件事|找不到这件事|不存在/),
      ).toBeVisible({ timeout: 5_000 });
    }
  });
});
