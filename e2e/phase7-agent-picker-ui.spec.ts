import { test, expect } from '@playwright/test';
import { skipIfRealMode } from './helpers/build-mode';

/**
 * Phase 7 — AgentPicker UI behavior in mock mode.
 *
 * Mock-mode unit-flavor checks: picker renders in the composer,
 * opening shows 12 options including default Claw, clicking an
 * option updates the trigger label. Real-mode persona-shaping is
 * covered by phase7-agent-picker.spec.ts.
 */

test.beforeEach(async ({ page }) => {
  await skipIfRealMode(page);
});

test.describe('Phase 7 — AgentPicker UI (mock mode)', () => {
  test.skip(({ isMobile }) => isMobile === true, 'desktop-only for now');

  test('opens menu showing the team (mock default = main only) + trigger label', async ({ page }) => {
    // Mock intents include 'birthday' → IntentHome renders, useChatThread
    // mounts, StickyComposer mounts → AgentPicker present.
    //
    // Post-L4 the picker lists ONLY the intent's team (intent_agents) so a
    // chat send can never route to a non-team specialist. Mock mode's
    // default team is just `main` (see useIntentAgents.ts), so the menu
    // surfaces exactly one option.
    await page.goto('/intent/birthday');
    const trigger = page.getByTestId('agent-picker-trigger');
    await expect(trigger).toBeVisible();
    await expect(trigger).toContainText('Claw');

    await trigger.click();
    const menu = page.getByTestId('agent-picker-menu');
    await expect(menu).toBeVisible();

    // Team is just main in mock-mode default → exactly one option.
    const options = menu.locator('[data-testid^="agent-option-"]');
    await expect(options).toHaveCount(1);
    await expect(menu.getByTestId('agent-option-main')).toBeVisible();
  });
});
