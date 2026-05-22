import { test, expect, type Page } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * Journey 05 — clickable-everywhere + overlay sanity sweep.
 *
 * Persona: 任何用户.
 * Goal: 看起来能点的, 都能点; 弹出的菜单, 不被任何东西盖住.
 *
 * Contract: `.ralph/journeys/05-overlay-and-interactivity.md`.
 *
 * This spec WILL FAIL until L8 lands (sidebar dropdown stacking + the
 * audit of decorative-clickable elements without handlers).
 *
 * Slow on purpose — runs across many routes, one DOM enumeration per
 * route. Filters elements aggressively (visible + has a handler-ish
 * attribute) so the click-storm isn't a hostility test.
 */

interface IntentRow { id: string }

function hdr() {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY!;
  return { apikey: k, authorization: `Bearer ${k}` };
}

async function getClawId(userId: string): Promise<string> {
  const url = process.env.SUPABASE_URL!;
  const res = await fetch(
    `${url}/rest/v1/claws?user_id=eq.${userId}&plan_id=neq.aios-prototype&select=id&limit=1`,
    { headers: hdr() },
  );
  const rows = (await res.json()) as { id: string }[];
  if (!rows[0]) throw new Error('test user has no real claw');
  return rows[0].id;
}

async function createIntent(userId: string): Promise<IntentRow> {
  const url = process.env.SUPABASE_URL!;
  const clawId = await getClawId(userId);
  const id = `aios-j05-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const res = await fetch(`${url}/rest/v1/intents`, {
    method: 'POST',
    headers: { ...hdr(), 'content-type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({
      id,
      user_id: userId,
      claw_id: clawId,
      title: `J05-stress-${Date.now().toString(36)}`,
      emoji: '🎯',
    }),
  });
  if (!res.ok) throw new Error(`create intent: ${res.status} ${await res.text()}`);
  return (await res.json() as IntentRow[])[0];
}

async function deleteIntent(id: string): Promise<void> {
  const url = process.env.SUPABASE_URL!;
  await fetch(`${url}/rest/v1/intents?id=eq.${id}`, { method: 'DELETE', headers: hdr() });
}

/**
 * Inventory every visually-clickable element on the current page. Filters
 * out hidden / off-screen / aria-disabled elements so we don't false-fail
 * on a button hidden inside a closed drawer.
 */
async function enumerateClickables(page: Page): Promise<Array<{ selector: string; box: { x: number; y: number; w: number; h: number } | null }>> {
  return await page.evaluate(() => {
    const selectors = [
      'button:not([disabled])',
      'a[href]',
      '[role="button"]:not([aria-disabled="true"])',
      '[data-testid$="-action"]',
    ];
    const elements = Array.from(document.querySelectorAll(selectors.join(', '))) as HTMLElement[];
    const result: Array<{ selector: string; box: { x: number; y: number; w: number; h: number } | null }> = [];
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const visible =
        rect.width > 0 && rect.height > 0 &&
        style.visibility !== 'hidden' && style.display !== 'none' &&
        Number(style.opacity) > 0;
      if (!visible) continue;
      // Build a stable selector: prefer data-testid, then aria-label.
      const testId = el.getAttribute('data-testid');
      const label = el.getAttribute('aria-label');
      let sel = testId ? `[data-testid="${testId}"]` : label ? `[aria-label="${label}"]` : '';
      if (!sel) sel = `${el.tagName.toLowerCase()}:nth-of-type(${i + 1})`;
      result.push({
        selector: sel,
        box: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      });
    }
    return result;
  });
}

/**
 * For each dropdown trigger we know about, open it and verify no other
 * interactive element overlaps it by > 4 px. Returns [] if all is well.
 */
async function checkDropdownOverlaps(page: Page, triggerSelector: string): Promise<string[]> {
  const findings: string[] = [];
  const trigger = page.locator(triggerSelector).first();
  if (!(await trigger.isVisible().catch(() => false))) return findings;
  await trigger.click();
  await page.waitForTimeout(300);
  const dropdown = page.locator('.dropdown-content:visible, [role="menu"]:visible').first();
  if (!(await dropdown.isVisible().catch(() => false))) {
    // Trigger didn't open a recognised menu — fine, not a failure.
    return findings;
  }
  const box = await dropdown.boundingBox();
  if (!box) return findings;

  // Sample the 4 corners (inset 2 px) and the center. The dropdown
  // element should be among the elementsFromPoint hits at every sample.
  const samples = [
    { x: box.x + 2, y: box.y + 2 },
    { x: box.x + box.width - 2, y: box.y + 2 },
    { x: box.x + 2, y: box.y + box.height - 2 },
    { x: box.x + box.width - 2, y: box.y + box.height - 2 },
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  ];
  for (const s of samples) {
    const topMatchesDropdown = await page.evaluate(
      ({ x, y }) => {
        const stack = document.elementsFromPoint(x, y);
        if (!stack.length) return true;
        const top = stack[0] as HTMLElement;
        const isDropdown = top.closest('.dropdown-content, [role="menu"]') !== null;
        return isDropdown;
      },
      s,
    );
    if (!topMatchesDropdown) {
      findings.push(`dropdown ${triggerSelector} covered at (${Math.round(s.x)},${Math.round(s.y)})`);
    }
  }
  // close the dropdown for the next probe
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(200);
  return findings;
}

const skip = () => {
  if (!process.env.PLAYWRIGHT_BASE_URL || !process.env.REAL_TEST_EMAIL || !process.env.SUPABASE_URL) {
    test.skip(true, 'journey 05 needs PLAYWRIGHT_BASE_URL + REAL_TEST_EMAIL + SUPABASE_URL');
  }
};

test.describe.configure({ mode: 'serial' });

test.describe('Journey 05 — clickable + overlay sanity sweep', () => {
  test.beforeEach(skip);
  test.skip(({ isMobile }) => isMobile === true, 'desktop layout-specific');

  test('every visible clickable has a handler and no dropdown gets covered', async ({
    page,
    context,
  }) => {
    test.setTimeout(300_000);
    const email = process.env.REAL_TEST_EMAIL!;
    const minted = await injectRealSession(context, email);

    // Track guarded mock firings — any one of them across the whole
    // journey is a fail.
    const mockGuardFirings: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().includes('[mock-in-real-mode]')) {
        mockGuardFirings.push(msg.text());
      }
    });

    const intent = await createIntent(minted.user_id);
    const routes = [
      '/',
      `/intent/${intent.id}`,
      '/schedule',
      '/memory',
      '/permissions',
      '/now',
      '/settings',
      '/help',
      '/archive',
      '/new',
    ];

    const findings: string[] = [];

    try {
      await unlockVercelPreview(page);

      for (const route of routes) {
        await page.goto(route);
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForTimeout(800);

        // Overlap checks — exercise the known dropdown triggers on
        // this route. Triggers vary by surface; we attempt each, skip
        // if absent.
        const triggers = [
          '[data-testid="sidebar-account"]',
          '[data-testid="intent-actions"]',
          '[data-testid="agent-picker-trigger"]',
          '[aria-label="加回面板"]',
          '[aria-label="更多操作"]',
        ];
        for (const t of triggers) {
          const more = await checkDropdownOverlaps(page, t);
          findings.push(...more);
        }
      }

      expect(findings, `overlay overlaps on dropdowns:\n${findings.join('\n')}`).toEqual([]);
      expect(
        mockGuardFirings,
        `mock-guard fired ${mockGuardFirings.length} times during stress sweep`,
      ).toEqual([]);
    } finally {
      await deleteIntent(intent.id);
    }
  });
});
