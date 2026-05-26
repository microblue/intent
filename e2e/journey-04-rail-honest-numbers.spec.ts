import { test, expect } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * Journey 04 — intent 右栏数字必须是真的, 跨组件一致.
 *
 * Persona: 任何用户. Data-integrity baseline.
 * Goal: intent 详情右栏 (大纲/进度/文件/助手) 全是真数字, 跨组件一致.
 *
 * Contract: `.ralph/journeys/04-team-and-rail-honest-numbers.md`.
 *
 * This spec WILL FAIL until L4–L7 land:
 *   - L4 — AgentPicker filtered to team
 *   - L5 — TeamPanel rows clickable → switch active agent
 *   - L6 — rail "助手 N 位" reads real intent_agents count
 *   - L7 — useIntentArtifacts replaces outlineFor/filesFor in real mode
 *
 * Also asserts [mock-in-real-mode] console.error count == 0 across
 * the whole flow — any guarded mock firing in real mode is a bug.
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
  const id = `aios-j04-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const res = await fetch(`${url}/rest/v1/intents`, {
    method: 'POST',
    headers: { ...hdr(), 'content-type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({
      id,
      user_id: userId,
      claw_id: clawId,
      title: `J04-honest-${Date.now().toString(36)}`,
      emoji: '🔢',
    }),
  });
  if (!res.ok) throw new Error(`create intent: ${res.status} ${await res.text()}`);
  return (await res.json() as IntentRow[])[0];
}

async function deleteIntent(id: string): Promise<void> {
  const url = process.env.SUPABASE_URL!;
  await fetch(`${url}/rest/v1/intents?id=eq.${id}`, { method: 'DELETE', headers: hdr() });
}

async function countAgents(intentId: string): Promise<number> {
  const url = process.env.SUPABASE_URL!;
  const res = await fetch(
    `${url}/rest/v1/intent_agents?intent_id=eq.${intentId}&select=agent_key`,
    { headers: hdr() },
  );
  return ((await res.json()) as unknown[]).length;
}

async function listAgentKeys(intentId: string): Promise<string[]> {
  const url = process.env.SUPABASE_URL!;
  const res = await fetch(
    `${url}/rest/v1/intent_agents?intent_id=eq.${intentId}&select=agent_key`,
    { headers: hdr() },
  );
  return ((await res.json()) as Array<{ agent_key: string }>).map((r) => r.agent_key);
}

async function countArtifacts(intentId: string, kind: string): Promise<number> {
  const url = process.env.SUPABASE_URL!;
  const res = await fetch(
    `${url}/rest/v1/intent_artifacts?intent_id=eq.${intentId}&kind=eq.${kind}&select=id`,
    { headers: hdr() },
  );
  // intent_artifacts may not exist yet (Phase 6 hand-off); treat 4xx as 0
  // so the count-consistency check doesn't false-fail before the table
  // ships.
  if (!res.ok) return 0;
  return ((await res.json()) as unknown[]).length;
}

const skip = () => {
  if (!process.env.PLAYWRIGHT_BASE_URL || !process.env.REAL_TEST_EMAIL || !process.env.SUPABASE_URL) {
    test.skip(true, 'journey 04 needs PLAYWRIGHT_BASE_URL + REAL_TEST_EMAIL + SUPABASE_URL');
  }
};

test.describe.configure({ mode: 'serial' });

test.describe('Journey 04 — rail honest numbers + cross-component consistency', () => {
  test.beforeEach(skip);
  test.skip(({ isMobile }) => isMobile === true, 'desktop rail surface');

  test('TeamPanel == AgentPicker == rail meta == intent_agents truth', async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    const email = process.env.REAL_TEST_EMAIL!;
    const minted = await injectRealSession(context, email);

    // Collect any [mock-in-real-mode] console.errors as we navigate.
    const mockGuardFirings: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().includes('[mock-in-real-mode]')) {
        mockGuardFirings.push(msg.text());
      }
    });

    const intent = await createIntent(minted.user_id);
    try {
      await unlockVercelPreview(page);
      await page.goto(`/intent/${intent.id}`);
      await expect(page.getByTestId('claw-status')).toHaveAttribute(
        'data-status',
        'connected',
        { timeout: 30_000 },
      );

      // Seed-only test data depends on trigger that adds `main`. Verify.
      const truthCount = await countAgents(intent.id);
      expect(truthCount, 'seed trigger should insert at least `main`').toBeGreaterThanOrEqual(1);
      const truthKeys = await listAgentKeys(intent.id);

      // Pass criterion 1: TeamPanel row count == intent_agents row count.
      const teamPanel = page.getByTestId('team-panel');
      await expect(teamPanel).toBeVisible({ timeout: 10_000 });
      const memberRows = teamPanel.locator('li[data-testid^="team-member-"]');
      await expect(memberRows, `TeamPanel should show ${truthCount} members`).toHaveCount(
        truthCount,
      );

      // Pass criterion 2: AgentPicker list ⊆ TeamPanel list, equal in size.
      await page.getByTestId('agent-picker-trigger').click();
      const menu = page.getByTestId('agent-picker-menu');
      await expect(menu).toBeVisible({ timeout: 5_000 });
      const pickerOptions = menu.locator('[data-testid^="agent-option-"]');
      await expect(
        pickerOptions,
        'AgentPicker should expose exactly the team members, no more, no less',
      ).toHaveCount(truthCount);
      // Each picker option's agent-id must be a member of truthKeys.
      const pickerIds = await pickerOptions.evaluateAll((nodes) =>
        nodes.map((n) => (n.getAttribute('data-testid') ?? '').replace('agent-option-', '')),
      );
      for (const id of pickerIds) {
        expect(truthKeys, `picker shows agent ${id} not in team`).toContain(id);
      }
      // close picker
      await page.keyboard.press('Escape');

      // Pass criterion 3: rail header meta "助手 N 位" matches truth.
      // The rail window is a `<section>` whose direct child `<header>` is
      // the drag-handle title bar — TeamPanel inside has its own
      // `<header>`, so `.first()` keeps us on the outer rail window header.
      const teamWindow = page.locator('section', { hasText: '助手团队' }).first();
      await expect(teamWindow).toBeVisible({ timeout: 5_000 });
      const teamMeta = await teamWindow.locator('header').first().innerText();
      const metaMatch = teamMeta.match(/(\d+)\s*位/);
      expect(metaMatch, `team window header should expose "N 位": "${teamMeta}"`).not.toBeNull();
      expect(Number(metaMatch![1]), '助手 N 位 must equal intent_agents truth').toBe(truthCount);

      // Pass criterion 4 + 5: outline/files counts match intent_artifacts.
      const outlineTruth = await countArtifacts(intent.id, 'outline_node');
      const fileTruth = await countArtifacts(intent.id, 'file');
      // Outline meta — find rail "计划" section meta "X/Y".
      const planWindow = page.locator('section', { hasText: '计划' }).first();
      if (await planWindow.isVisible().catch(() => false)) {
        const planMeta = await planWindow.locator('header').first().innerText();
        const planMatch = planMeta.match(/(\d+)\/(\d+)/);
        if (planMatch) {
          expect(
            Number(planMatch[2]),
            `outline total in UI (${planMatch[2]}) must equal intent_artifacts(kind=outline_node) (${outlineTruth})`,
          ).toBe(outlineTruth);
        }
      }
      const filesWindow = page.locator('section', { hasText: '产出文件' }).first();
      if (await filesWindow.isVisible().catch(() => false)) {
        const filesMeta = await filesWindow.locator('header').first().innerText();
        const filesMatch = filesMeta.match(/(\d+)\s*个/);
        if (filesMatch) {
          expect(Number(filesMatch[1]), 'files count must equal intent_artifacts(kind=file)').toBe(fileTruth);
        }
      }

      // Pass criterion 6: TeamPanel row click switches active agent.
      // Pick a non-main row (or main itself if main is the only one) and
      // assert the AgentPicker trigger label updates.
      const triggerLabelBefore = await page.getByTestId('agent-picker-trigger').innerText();
      const targetKey = truthKeys.find((k) => k !== 'main') ?? truthKeys[0];
      await page.getByTestId(`team-member-${targetKey}`).click();
      await page.waitForTimeout(500);
      const triggerLabelAfter = await page.getByTestId('agent-picker-trigger').innerText();
      // If the team has only main, clicking it is a no-op but still must
      // be a valid handler; otherwise the label should have flipped.
      if (truthKeys.length > 1) {
        expect(
          triggerLabelBefore,
          'clicking TeamPanel row should change AgentPicker active label',
        ).not.toBe(triggerLabelAfter);
      }

      // Pass criterion 7: zero mock-guard firings across the whole journey.
      expect(
        mockGuardFirings,
        `mock-guard fired ${mockGuardFirings.length} times in real mode:\n${mockGuardFirings.slice(0, 5).join('\n')}`,
      ).toEqual([]);
    } finally {
      await deleteIntent(intent.id);
    }
  });
});
