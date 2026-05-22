import { test, expect, type Page, type Locator } from '@playwright/test';
import { skipIfRealMode } from './helpers/build-mode';

/**
 * H3 — AgentPicker trigger + menu walkthrough.
 *
 * H3 spec: "AgentPicker icon-only buttons need names. Audit every
 * trigger and ensure the agent name + emoji are both visible."
 *
 * Mock-mode walkthrough — same AgentPicker component is rendered in
 * both modes, but mock-mode skips the "disabled until gateway
 * connects" gate, so we can reliably open the menu without flakiness
 * from a real WS handshake. The trigger + every option row must show
 * the agent emoji AND the agent name; pure icon rows would fail.
 */

const ARTIFACTS = 'test-results';

test.describe.configure({ mode: 'serial' });

type ElementReport = {
  tag: string;
  role: string;
  label: string;
  testId: string;
  visible: boolean;
};

async function enumerate(scope: Page | Locator): Promise<{
  rows: ElementReport[];
  missingLabel: ElementReport[];
}> {
  const handles: Locator[] = await scope
    .locator(
      'button:not([disabled]), a[href], input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [role="button"]:not([disabled])',
    )
    .all();
  const rows: ElementReport[] = [];
  for (const h of handles) {
    const info = await h
      .evaluate((el) => {
        const isVisible = !!(
          el.getBoundingClientRect().width &&
          el.getBoundingClientRect().height &&
          getComputedStyle(el).visibility !== 'hidden' &&
          getComputedStyle(el).display !== 'none'
        );
        const aria =
          el.getAttribute('aria-label') ||
          el.getAttribute('aria-labelledby') ||
          '';
        const text = (el.textContent || '').trim().replace(/\s+/g, ' ');
        const title = el.getAttribute('title') || '';
        const value = (el as HTMLInputElement).value || '';
        const placeholder = (el as HTMLInputElement).placeholder || '';
        return {
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute('role') || '',
          label: (aria || text || title || value || placeholder).slice(0, 120),
          testId: el.getAttribute('data-testid') || '',
          visible: isVisible,
        };
      })
      .catch(() => null);
    if (!info) continue;
    rows.push(info);
  }
  const missingLabel = rows.filter((r) => r.visible && !r.label);
  return { rows, missingLabel };
}

test.beforeEach(async ({ page }) => {
  await skipIfRealMode(page);
});

test.describe('H3 — AgentPicker name + emoji audit (mock mode)', () => {
  test.skip(({ isMobile }) => isMobile === true, 'desktop walkthrough; chat composer is the surface');

  test('trigger + menu show name + emoji on every row', async ({ page }) => {
    // Mock data includes 'birthday' intent → IntentHome mounts the
    // StickyComposer → AgentPicker is present.
    await page.goto('/intent/birthday');

    const trigger = page.getByTestId('agent-picker-trigger');
    await expect(trigger).toBeVisible({ timeout: 10_000 });

    // The trigger must contain BOTH the active agent's emoji
    // (🦞 by default — Claw) AND its name.
    const triggerText = (await trigger.textContent())?.trim() ?? '';
    expect(triggerText, 'trigger should contain "Claw" name').toContain('Claw');
    expect(triggerText, 'trigger should contain 🦞 emoji').toContain('🦞');

    // Snap closed — Ralph reads this to confirm the trigger isn't
    // collapsed to an icon-only puck.
    await page.screenshot({
      fullPage: true,
      path: `${ARTIFACTS}/walkthrough-agent-picker-closed.png`,
    });

    // Open the menu.
    await trigger.click();
    const menu = page.getByTestId('agent-picker-menu');
    await expect(menu).toBeVisible();
    await page.waitForTimeout(200);

    // Snap open.
    await page.screenshot({
      fullPage: true,
      path: `${ARTIFACTS}/walkthrough-agent-picker-open.png`,
    });

    // Every menu option must contain its agent's name. We assert
    // against the canonical 12-agent name set so we catch the case
    // where a future regression removes the name span and leaves
    // only the emoji avatar.
    const optionLabels = await menu
      .locator('button[data-testid^="agent-option-"]')
      .evaluateAll((els) =>
        els.map((el) => ({
          testId: el.getAttribute('data-testid') ?? '',
          text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
        })),
      );
    expect(
      optionLabels.length,
      'every built-in agent should render an option row',
    ).toBeGreaterThanOrEqual(13);
    const expectedNames = [
      'Claw',
      '研究员',
      '规划员',
      '写手',
      '机票助手',
      '住宿助手',
      '吃饭助手',
      '陪练',
      '比价员',
      '提醒员',
      '邮件助手',
      '购物员',
      '家人联络员',
    ];
    for (const name of expectedNames) {
      const row = optionLabels.find((o) => o.text.includes(name));
      expect(row, `option for ${name} should be present`).toBeTruthy();
      // Each row must be more than just whitespace + emoji — i.e.
      // contain the agent name string itself, not just an icon.
      expect(
        row!.text.length,
        `${name} row should have visible label, not icon-only`,
      ).toBeGreaterThan(name.length);
    }

    // Full enumeration: nothing in the menu may be label-less.
    const report = await enumerate(menu);
    test.info().attachments.push({
      name: 'agent-picker-menu-elements.json',
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify(report.rows, null, 2)),
    });
    expect(
      report.missingLabel,
      `agent picker menu has ${report.missingLabel.length} unlabeled elements:\n${JSON.stringify(report.missingLabel, null, 2)}`,
    ).toEqual([]);
  });
});
