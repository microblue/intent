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

  test('opens menu with 12 options and switches active label', async ({ page }) => {
    // Mock intents include 'birthday' → IntentHome renders, useChatThread
    // mounts, StickyComposer mounts → AgentPicker present.
    await page.goto('/intent/birthday');
    const trigger = page.getByTestId('agent-picker-trigger');
    await expect(trigger).toBeVisible();
    await expect(trigger).toContainText('Claw');

    await trigger.click();
    const menu = page.getByTestId('agent-picker-menu');
    await expect(menu).toBeVisible();

    // All 12 personas present.
    for (const name of ['研究员', '规划员', '写手', '机票助手', '住宿助手', '吃饭助手', '陪练', '比价员', '提醒员', '邮件助手', '购物员', '家人联络员']) {
      await expect(menu.getByText(name).first()).toBeVisible();
    }

    await page.getByTestId('agent-option-writer').click();
    await expect(trigger).toContainText('写手');
    // Menu closes after selection.
    await expect(menu).toHaveCount(0);
  });
});
