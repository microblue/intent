import { test, expect } from '@playwright/test';
import { skipIfRealMode } from './helpers/build-mode';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * C3 — TeamPanel guards orchestrator removal.
 *
 * Every intent has exactly one orchestrator (typically `main` /
 * "Claw"). The user must always have a default agent driving the
 * chat, so removing the orchestrator is not allowed. Two layers
 * enforce this today:
 *
 *   1. UI layer — `src/components/TeamPanel.tsx` renders the remove
 *      `✕` button only when `m.isOrchestrator !== true`, so the
 *      user has no path to click it.
 *   2. Data layer — `useRemoveTeamMember.remove('main')` throws
 *      "Claw 是默认主理人,不能移除" before touching the DB.
 *
 * This spec locks in both:
 *
 *   - Mock-mode: the team panel renders the orchestrator (main) with
 *     the "主理" tag and NO remove button. A direct call to the
 *     remove mutation through the gateway test escape hatch surfaces
 *     the friendly error message.
 *
 *   - Real-mode: when the team has both main + a specialist seeded
 *     via service-role INSERT, the specialist exposes its remove
 *     button while main does not.
 */

interface IntentRow { id: string }

function hdr() {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY!;
  return { apikey: k, authorization: `Bearer ${k}`, 'content-type': 'application/json' };
}

// ─────────── mock-mode (always runs locally) ───────────

test.describe('C3 — orchestrator-removal guard (mock-mode)', () => {
  test.skip(({ isMobile }) => isMobile === true, 'desktop sweep');

  test.beforeEach(async ({ page }) => {
    await skipIfRealMode(page);
  });

  test('main row has 主理 tag and no remove button; team-remove-main never exists', async ({
    page,
  }) => {
    await page.goto('/intent/birthday');
    await expect(page.getByText('老婆 Lisa 的生日').first()).toBeVisible({
      timeout: 10_000,
    });

    const panel = page.getByTestId('team-panel');
    await expect(panel).toBeVisible({ timeout: 10_000 });

    // The main row mounts with the "主理" tag.
    const mainRow = page.getByTestId('team-member-main');
    await expect(mainRow).toBeVisible();
    await expect(mainRow).toContainText('主理');

    // Critical guard: no remove button for the orchestrator.
    await expect(page.getByTestId('team-remove-main')).toHaveCount(0);
  });
});

// ─────────── real-mode (skips without env) ───────────

async function seedIntentWithSpecialist(
  userId: string,
  specialistKey: string,
  specialistName: string,
): Promise<IntentRow> {
  const url = process.env.SUPABASE_URL!;
  const clawRes = await fetch(
    `${url}/rest/v1/claws?user_id=eq.${userId}&plan_id=neq.aios-prototype&select=id&limit=1`,
    { headers: hdr() },
  );
  const claws = (await clawRes.json()) as { id: string }[];
  const id = `aios-c3-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const r = await fetch(`${url}/rest/v1/intents`, {
    method: 'POST',
    headers: { ...hdr(), Prefer: 'return=representation' },
    body: JSON.stringify({ id, user_id: userId, claw_id: claws[0].id, title: 'c3-team-guard', emoji: '🛡' }),
  });
  const intent = (await r.json() as IntentRow[])[0];

  // The DB trigger seeds 'main' as orchestrator on intent INSERT.
  // Add the specialist on top of that so the panel has 2 rows.
  await fetch(`${url}/rest/v1/intent_agents`, {
    method: 'POST',
    headers: { ...hdr(), Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify({
      intent_id: intent.id,
      agent_key: specialistKey,
      display_name: specialistName,
      is_orchestrator: false,
    }),
  });
  return intent;
}

async function deleteIntent(id: string): Promise<void> {
  const url = process.env.SUPABASE_URL!;
  await fetch(`${url}/rest/v1/intents?id=eq.${id}`, { method: 'DELETE', headers: hdr() });
}

const realSkip = () => {
  if (
    !process.env.PLAYWRIGHT_BASE_URL ||
    !process.env.REAL_TEST_EMAIL ||
    !process.env.SUPABASE_URL
  ) {
    test.skip(true, 'C3 real-mode needs PLAYWRIGHT_BASE_URL + REAL_TEST_EMAIL + SUPABASE_URL');
  }
};

test.describe.configure({ mode: 'serial' });

test.describe('C3 — orchestrator-removal guard (real-mode)', () => {
  test.beforeEach(realSkip);
  test.skip(({ isMobile }) => isMobile === true, 'desktop sweep');

  test('main has no remove button, specialist does — both rows render', async ({
    page,
    context,
  }) => {
    test.setTimeout(45_000);
    const minted = await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    const intent = await seedIntentWithSpecialist(minted.user_id, 'planner', '规划员');
    try {
      await unlockVercelPreview(page);
      await page.goto(`/intent/${intent.id}`);

      const panel = page.getByTestId('team-panel');
      await expect(panel).toBeVisible({ timeout: 15_000 });

      // Both rows present.
      const mainRow = page.getByTestId('team-member-main');
      const plannerRow = page.getByTestId('team-member-planner');
      await expect(mainRow).toBeVisible();
      await expect(plannerRow).toBeVisible();

      // Main carries the 主理 tag; planner doesn't.
      await expect(mainRow).toContainText('主理');
      await expect(plannerRow).not.toContainText('主理');

      // Guard: main has no remove button; planner has one.
      await expect(page.getByTestId('team-remove-main')).toHaveCount(0);
      await expect(page.getByTestId('team-remove-planner')).toHaveCount(1);
    } finally {
      await deleteIntent(intent.id);
    }
  });
});
