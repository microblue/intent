import { test, expect } from '@playwright/test';

/**
 * E13 — chat thread auto-scrolls to the latest message.
 *
 * Before: Conversation rendered messages top-to-bottom with no
 * scroll-on-mount or scroll-on-new — opening a thread with 20+
 * messages landed the user at the top. Now a sentinel `<div>` at the
 * bottom + `useEffect([messages.length])` keeps the latest in view.
 *
 * Mock-mode test: pick an intent the mocks seed with multiple
 * messages, then verify the sentinel is in the viewport on initial
 * load.
 */

test.describe.configure({ mode: 'serial' });

test.describe('E13 — chat thread auto-scrolls to latest', () => {
  test.skip(({ isMobile }) => isMobile === true, 'desktop layout');

  test('opening a multi-message intent lands with the chat-end sentinel visible', async ({ page }) => {
    await page.goto('/intent/sakura');
    const sentinel = page.getByTestId('chat-end');
    // The sentinel exists for every intent (rendered after the messages list).
    await expect(sentinel).toHaveCount(1, { timeout: 5_000 });
    // ScrollIntoView fires inside useEffect → wait for it to settle.
    await page.waitForTimeout(300);
    // boundingBox().y < viewport height means it's in or near view.
    const box = await sentinel.boundingBox();
    const viewport = page.viewportSize();
    expect(box, 'sentinel should be rendered with a layout box').not.toBeNull();
    expect(viewport, 'viewport size should be defined').not.toBeNull();
    if (box && viewport) {
      expect(
        box.y,
        `sentinel.y=${box.y} should be within viewport height ${viewport.height}`,
      ).toBeLessThan(viewport.height);
    }
  });
});
