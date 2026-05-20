import type { Page } from '@playwright/test';

/**
 * Vercel preview deployments are SSO-protected (the
 * `ssoProtection.deploymentType=all_except_custom_domains` project
 * setting). To let Playwright in, we use the automation-bypass secret
 * provisioned on the project:
 *
 *   curl https://api.vercel.com/v9/projects/<id> -H 'Authorization: Bearer <token>'
 *     → protectionBypass.<secret>.scope='automation-bypass'
 *
 * Pattern: hit any URL with `?x-vercel-protection-bypass=<secret>
 * &x-vercel-set-bypass-cookie=true`. Vercel responds 307 + Set-Cookie,
 * and every subsequent request from the same browsing context carries
 * the cookie. We can't use Playwright's `extraHTTPHeaders` for this
 * because it would inject the header on cross-origin fetches to
 * Supabase, which fails the CORS preflight.
 *
 * Call once at the start of each test (or in `beforeEach`) before
 * navigating to a real page.
 */
export async function unlockVercelPreview(page: Page): Promise<void> {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS;
  if (!secret) return;
  // Hit `/__bypass` (any path — Vercel processes the bypass headers at
  // the edge before routing). The trailing slash isn't required.
  await page.goto(`/?x-vercel-protection-bypass=${secret}&x-vercel-set-bypass-cookie=true`, {
    waitUntil: 'domcontentloaded',
  });
}
