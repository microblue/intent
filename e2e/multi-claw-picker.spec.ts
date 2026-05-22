import { test, expect } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';
import { createTestUser, deleteTestUser } from './helpers/test-user';

/**
 * H2 — Multi-claw picker UI.
 *
 * For a user with 2+ real claws, ClawPicker becomes a dropdown trigger
 * that lists every real claw. Selecting a non-default claw:
 *   1. Updates the picker label to the chosen claw.
 *   2. Persists `selectedClawId` to the UI store (myclaw-ui-v2).
 *   3. Causes new intents to FK to the selected claw, not the default.
 *
 * The existing phase6-realmode-multiclaw spec covers the default
 * (oldest-wins) behaviour and stays unchanged; this spec is the
 * regression guard for the picker affordance the user can actually
 * use.
 */

const skip = () => {
  if (
    !process.env.PLAYWRIGHT_BASE_URL ||
    !process.env.SUPABASE_URL ||
    !(process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY)
  ) {
    test.skip(
      true,
      'multi-claw picker spec needs PLAYWRIGHT_BASE_URL + SUPABASE_URL + service-role key',
    );
  }
};

function hdr() {
  const k = (process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY)!;
  return {
    apikey: k,
    authorization: `Bearer ${k}`,
    'content-type': 'application/json',
  };
}

interface InsertClaw {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

async function insertRealClaw(c: InsertClaw): Promise<void> {
  const url = process.env.SUPABASE_URL!;
  const res = await fetch(`${url}/rest/v1/claws`, {
    method: 'POST',
    headers: { ...hdr(), Prefer: 'return=minimal' },
    body: JSON.stringify({
      id: c.id,
      user_id: c.user_id,
      name: c.name,
      plan_id: 'aios-vm-90d',
      claw_type: 'aios-vm',
      provider: 'test',
      status: 'active',
      created_at: c.created_at,
    }),
  });
  if (!res.ok) {
    throw new Error(`insertRealClaw failed: ${res.status} ${await res.text()}`);
  }
}

async function deleteClaw(id: string): Promise<void> {
  const url = process.env.SUPABASE_URL!;
  await fetch(`${url}/rest/v1/claws?id=eq.${id}`, {
    method: 'DELETE',
    headers: hdr(),
  });
}

async function fetchIntentClawId(intentId: string): Promise<string | null> {
  const url = process.env.SUPABASE_URL!;
  const res = await fetch(
    `${url}/rest/v1/intents?id=eq.${intentId}&select=claw_id`,
    { headers: hdr() },
  );
  const rows = (await res.json()) as { claw_id: string }[];
  return rows[0]?.claw_id ?? null;
}

test.describe.configure({ mode: 'serial' });

test.describe('H2 — multi-claw picker dropdown', () => {
  test.beforeEach(skip);
  test.skip(({ isMobile }) => isMobile === true, 'desktop-only smoke');

  test('user with two real claws can switch active claw + new intent FKs to selection', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    const user = await createTestUser();
    const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const olderId = `aios-e2e-h2-older-${stamp}`;
    const newerId = `aios-e2e-h2-newer-${stamp}`;
    try {
      await insertRealClaw({
        id: olderId,
        user_id: user.id,
        name: `older-${stamp}`,
        created_at: '2020-01-01T00:00:00Z',
      });
      await insertRealClaw({
        id: newerId,
        user_id: user.id,
        name: `newer-${stamp}`,
        created_at: '2020-06-01T00:00:00Z',
      });

      await injectRealSession(context, user.email);
      await unlockVercelPreview(page);
      await page.goto('/');

      // Picker renders, defaults to oldest claw.
      const picker = page.getByTestId('claw-picker');
      await expect(picker).toBeVisible({ timeout: 10_000 });
      await expect(picker).toContainText(`older-${stamp}`);

      // Click the trigger — menu opens with both claws listed.
      await picker.click();
      const menu = page.getByTestId('claw-picker-menu');
      await expect(menu).toBeVisible();
      await expect(menu).toContainText(`older-${stamp}`);
      await expect(menu).toContainText(`newer-${stamp}`);

      // Switch to the newer claw.
      await page.getByTestId(`claw-picker-option-${newerId}`).click();

      // Menu closes; picker label flips to the newer claw.
      await expect(menu).toBeHidden();
      await expect(picker).toContainText(`newer-${stamp}`);
      await expect(picker).not.toContainText(`older-${stamp}`);

      // Selection persisted into localStorage (myclaw-ui-v2 store).
      const persisted = await page.evaluate(() => {
        const raw = localStorage.getItem('myclaw-ui-v2');
        if (!raw) return null;
        try {
          return (JSON.parse(raw) as { state?: { selectedClawId?: string } })
            .state?.selectedClawId ?? null;
        } catch {
          return null;
        }
      });
      expect(persisted).toBe(newerId);

      // Create an intent — claw_id should land on the selected (newer) claw.
      await page.goto('/new');
      await page
        .getByRole('textbox')
        .first()
        .fill('帮我准备一次去日本看樱花的旅行');
      await page.getByRole('button', { name: /继续/ }).click();
      await page.getByRole('button', { name: /先这样,直接开始/ }).click();
      await page.getByRole('button', { name: /开始这件事/ }).click();
      await page.waitForURL(/\/intent\/[^/]+$/, { timeout: 15_000 });
      const intentId = page.url().split('/intent/')[1];
      const clawIdOnIntent = await fetchIntentClawId(intentId);
      expect(clawIdOnIntent).toBe(newerId);
    } finally {
      await deleteClaw(olderId).catch(() => {});
      await deleteClaw(newerId).catch(() => {});
      await deleteTestUser(user.id);
    }
  });
});
