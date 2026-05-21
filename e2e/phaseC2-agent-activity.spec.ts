import { test, expect } from '@playwright/test';
import { skipIfRealMode } from './helpers/build-mode';

/**
 * C2 — inline 🗺️ 规划员 正在拆步骤… badge during in-flight
 * delegation, driven by gateway `agent.start` / `agent.done`
 * lifecycle events.
 *
 * Mock-mode only: real-mode would need OpenClaw to emit the
 * lifecycle events end-to-end, which is a cross-repo concern.
 * Here we drive the event via `window.__aios.emitGatewayEvent`
 * (the test escape hatch wired in `src/main.tsx`) and assert the
 * TypingIndicator renders with the specialist's emoji + name +
 * the phase verb from `lib/agents:phaseVerbFor`.
 */

test.beforeEach(async ({ page }) => {
  await skipIfRealMode(page);
});

test.describe.configure({ mode: 'serial' });

test.describe('C2 — TypingIndicator reflects in-flight agent', () => {
  test.skip(({ isMobile }) => isMobile === true, 'desktop sweep');

  test('agent.start(planner) renders 🗺️ 规划员 正在拆步骤…; agent.done clears it', async ({
    page,
  }) => {
    // Use a stable mock intent so the page renders the chat shell.
    await page.goto('/intent/birthday');
    await expect(page.getByText('老婆 Lisa 的生日').first()).toBeVisible({
      timeout: 10_000,
    });

    // Wait for the escape hatch to mount.
    await page.waitForFunction(
      () => typeof (window as unknown as { __aios?: { emitGatewayEvent?: unknown } }).__aios?.emitGatewayEvent === 'function',
      undefined,
      { timeout: 5_000 },
    );

    // Fire agent.start scoped to this intent.
    await page.evaluate(() => {
      (window as unknown as { __aios: { emitGatewayEvent: (e: string, p: unknown) => void } }).__aios.emitGatewayEvent(
        'agent.start',
        { intentId: 'birthday', agentKey: 'planner', phase: 'planning' },
      );
    });

    // Indicator should appear with planner attribution.
    const indicator = page.getByTestId('typing-indicator');
    await expect(indicator).toBeVisible({ timeout: 5_000 });
    await expect(indicator).toHaveAttribute('data-agent-key', 'planner');
    await expect(indicator).toContainText('规划员');
    await expect(indicator).toContainText('正在拆步骤');
    await expect(indicator).toContainText('🗺');

    // agent.done clears it.
    await page.evaluate(() => {
      (window as unknown as { __aios: { emitGatewayEvent: (e: string, p: unknown) => void } }).__aios.emitGatewayEvent(
        'agent.done',
        { intentId: 'birthday', agentKey: 'planner' },
      );
    });
    await expect(indicator).toHaveCount(0, { timeout: 5_000 });
  });

  test('unknown agent key falls back to ✦ 助手 正在想…', async ({ page }) => {
    await page.goto('/intent/birthday');
    await expect(page.getByText('老婆 Lisa 的生日').first()).toBeVisible({
      timeout: 10_000,
    });
    await page.waitForFunction(
      () => typeof (window as unknown as { __aios?: { emitGatewayEvent?: unknown } }).__aios?.emitGatewayEvent === 'function',
      undefined,
      { timeout: 5_000 },
    );

    await page.evaluate(() => {
      (window as unknown as { __aios: { emitGatewayEvent: (e: string, p: unknown) => void } }).__aios.emitGatewayEvent(
        'agent.start',
        { intentId: 'birthday', agentKey: 'some-future-agent-not-in-catalog' },
      );
    });

    const indicator = page.getByTestId('typing-indicator');
    await expect(indicator).toBeVisible({ timeout: 5_000 });
    await expect(indicator).toContainText('助手');
    await expect(indicator).toContainText('正在想');
  });

  test('agent.start for a different intent does NOT show on this intent', async ({
    page,
  }) => {
    await page.goto('/intent/birthday');
    await expect(page.getByText('老婆 Lisa 的生日').first()).toBeVisible({
      timeout: 10_000,
    });
    await page.waitForFunction(
      () => typeof (window as unknown as { __aios?: { emitGatewayEvent?: unknown } }).__aios?.emitGatewayEvent === 'function',
      undefined,
      { timeout: 5_000 },
    );

    await page.evaluate(() => {
      (window as unknown as { __aios: { emitGatewayEvent: (e: string, p: unknown) => void } }).__aios.emitGatewayEvent(
        'agent.start',
        { intentId: 'some-other-intent', agentKey: 'planner' },
      );
    });

    // Indicator should NOT show for this intent.
    await expect(page.getByTestId('typing-indicator')).toHaveCount(0);
  });
});
