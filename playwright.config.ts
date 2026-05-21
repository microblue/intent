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

// Vercel deployment-protection bypass — preview URLs are SSO-protected
// by default. When VERCEL_AUTOMATION_BYPASS is set, append it as a
// query param on the initial page.goto so Vercel sets the bypass
// cookie; subsequent navigations carry the cookie. We can't use
// extraHTTPHeaders for this because that sends the header on every
// fetch (including cross-origin to Supabase, which trips CORS).
// Production custom-domain deploys are open and don't need this.
export const vercelBypass = process.env.VERCEL_AUTOMATION_BYPASS;

// Real-mode runs (against a preview build, signed in as a fixed
// shared test user) share one Supabase account. Supabase's
// admin/generate_link endpoint rate-limits parallel mints to the same
// address, so the smokes need to run serially to avoid flakes. We
// detect this by presence of REAL_TEST_EMAIL.
const realMode = Boolean(process.env.REAL_TEST_EMAIL);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: !realMode,
  forbidOnly: !!process.env.CI,
  // Real-mode runs share one Supabase user; magic-link rotation under
  // serial load occasionally invalidates a cached session mid-run. One
  // retry absorbs that without masking real regressions (the retried
  // run gets a fresh mint).
  retries: process.env.CI ? 2 : realMode ? 1 : 0,
  workers: realMode ? 1 : process.env.CI ? 1 : undefined,
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
      // Most of the suite. B5 cross-browser smoke runs on firefox +
      // webkit only — exclude it here so we don't double-cover.
      testIgnore: ['**/phaseB5-*.spec.ts'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      // iPhone 14 metrics applied to Chromium — keeps the install footprint
      // to one browser while still catching mobile-layout regressions.
      // Swap to `devices['iPhone 14']` (webkit) in CI if needed.
      testIgnore: ['**/phaseB5-*.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      // B5 cross-browser smoke — narrow set of tests on firefox.
      // Restricted via testMatch so we don't run the whole suite on
      // an engine we don't otherwise support; only verifies the load-
      // bearing surfaces work on Gecko.
      name: 'firefox',
      testMatch: ['**/phaseB5-*.spec.ts'],
      use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } },
    },
    {
      // Same idea for webkit — Safari-engine smoke on the same set.
      name: 'webkit',
      testMatch: ['**/phaseB5-*.spec.ts'],
      use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } },
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
