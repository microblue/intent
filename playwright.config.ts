import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for AIOS e2e.
 *
 * Default target: a local `vite preview` server that Playwright manages
 * itself (so `pnpm test:e2e` is one command, no manual server-up step).
 *
 * Override target: set PLAYWRIGHT_BASE_URL to point at a deployed URL
 * (e.g. https://myclaw-aios.vercel.app). When PLAYWRIGHT_BASE_URL is set
 * the local webServer is skipped — we test the deployed bundle.
 *
 * Browsers: chromium only by default. Multi-browser is overkill for a
 * Phase-2 prototype on a single dev machine; flip on `firefox`/`webkit`
 * in CI when needed.
 */

const externalUrl = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externalUrl ?? 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      // iPhone 14 metrics applied to Chromium — keeps the install footprint
      // to one browser while still catching mobile-layout regressions.
      // Swap to `devices['iPhone 14']` (webkit) in CI if needed.
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  // Build + preview locally unless we're hitting a deployed URL.
  webServer: externalUrl
    ? undefined
    : {
        command: 'pnpm build && pnpm preview --port 4173 --strictPort',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: 'ignore',
        stderr: 'pipe',
      },
});
