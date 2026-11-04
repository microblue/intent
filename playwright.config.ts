import { defineConfig, devices } from '@playwright/test';

/**
 * E2E for Intent. The local server runs the real API with the scripted fake
 * model (INTENT_PROVIDER=fake), so runs are free and deterministic.
 * Every test gets a fresh browser context = a fresh anonymous user.
 */
const externalUrl = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externalUrl ?? 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    locale: 'zh-CN',
    timezoneId: 'America/Los_Angeles',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } } },
    {
      name: 'mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    },
  ],
  webServer: externalUrl
    ? undefined
    : {
        command: './node_modules/.bin/vite build && ./node_modules/.bin/vite preview --port 4173 --strictPort',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: false,
        timeout: 120_000,
        env: { INTENT_PROVIDER: 'fake', INTENT_DATA_FILE: '.data/e2e.json' },
        stdout: 'ignore',
        stderr: 'pipe',
      },
});
