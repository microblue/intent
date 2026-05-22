import { test, expect, type Page } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * G3 — voice button (Web Speech API) verification.
 *
 * Real-mode chromium pass. We install a mock `SpeechRecognition` on
 * `window` before the SPA loads via `addInitScript`, then verify the
 * voice button appears in /new's prompt stage and that clicking it
 * delivers a fake transcription into the composer.
 *
 * We also assert the button is HIDDEN when the global is absent (so
 * lay users on Firefox don't see a broken control).
 */

const skip = () => {
  if (!process.env.PLAYWRIGHT_BASE_URL || !process.env.REAL_TEST_EMAIL) {
    test.skip(true, 'voice-button spec needs PLAYWRIGHT_BASE_URL + REAL_TEST_EMAIL');
  }
};

/**
 * Install a deterministic SpeechRecognition shim. Calling `.start()`
 * fires `onstart`, then on the next tick fires a single final result
 * "明天 早上 9 点 跑步" and ends. `.stop()` and `.abort()` end the
 * session immediately.
 */
async function installMockSpeechRecognition(page: Page, transcript: string): Promise<void> {
  await page.addInitScript((text: string) => {
    class MockSR {
      lang = 'zh-CN';
      continuous = true;
      interimResults = true;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onstart: (() => void) | null = null;
      _ended = false;
      start() {
        setTimeout(() => this.onstart?.(), 0);
        setTimeout(() => {
          if (this._ended) return;
          // Fire a final result, then end.
          this.onresult?.({
            resultIndex: 0,
            results: {
              length: 1,
              0: {
                isFinal: true,
                length: 1,
                0: { transcript: text, confidence: 0.95 },
              },
            },
          });
          this._ended = true;
          this.onend?.();
        }, 30);
      }
      stop() {
        if (this._ended) return;
        this._ended = true;
        setTimeout(() => this.onend?.(), 0);
      }
      abort() {
        this._ended = true;
      }
    }
    (window as unknown as { SpeechRecognition?: typeof MockSR }).SpeechRecognition = MockSR;
    (window as unknown as { webkitSpeechRecognition?: typeof MockSR }).webkitSpeechRecognition = MockSR;
  }, transcript);
}

test.describe.configure({ mode: 'serial' });

test.describe('G3 — voice button', () => {
  test.beforeEach(skip);

  test('renders in /new prompt stage when SpeechRecognition is available', async ({ page, context }, info) => {
    test.skip(info.project.name !== 'chromium', 'desktop only');
    await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    await installMockSpeechRecognition(page, '帮我规划一次东京樱花季旅行');
    await unlockVercelPreview(page);
    await page.goto('/new');
    await expect(
      page.getByRole('heading', { level: 1, name: /想做什么/ }),
    ).toBeVisible({ timeout: 10_000 });
    // The voice button is visible.
    const btn = page.getByTestId('voice-button').first();
    await expect(btn).toBeVisible();
    // Click it — the mock fires "transcript" → onTranscript → setPrompt
    await btn.click();
    // The textarea should now contain the transcript.
    const textarea = page.locator('textarea').first();
    await expect(textarea).toHaveValue(/东京樱花季旅行/, { timeout: 5_000 });
  });

  test('hidden when SpeechRecognition is absent', async ({ page, context }, info) => {
    test.skip(info.project.name !== 'chromium', 'desktop only');
    await injectRealSession(context, process.env.REAL_TEST_EMAIL!);
    // Explicitly nuke the API if a real browser provides it (Chromium does).
    await page.addInitScript(() => {
      delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
      delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    });
    await unlockVercelPreview(page);
    await page.goto('/new');
    await expect(
      page.getByRole('heading', { level: 1, name: /想做什么/ }),
    ).toBeVisible({ timeout: 10_000 });
    // The voice button must not be rendered.
    await expect(page.getByTestId('voice-button')).toHaveCount(0);
  });
});
