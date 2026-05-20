import { test, expect } from '@playwright/test';
import { unlockVercelPreview } from './helpers/vercel-bypass';
import { injectRealSession } from './helpers/real-session';

/**
 * Phase 6 end-to-end smoke against a real-mode Vercel preview deploy.
 *
 * Prerequisites:
 *   PLAYWRIGHT_BASE_URL=https://<preview>.vercel.app
 *   VERCEL_AUTOMATION_BYPASS=<project automation-bypass secret>
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env
 *   REAL_TEST_EMAIL=<a user with at least one real (non-sentinel) claw>
 *
 * The preview build has VITE_USE_REAL_DATA=true so every data hook
 * resolves against Supabase + (for gateway events) the OpenClaw WS.
 * This spec injects a real Supabase session for REAL_TEST_EMAIL, then
 * verifies the chrome chain that depends on real-mode being live:
 *
 *   1. Sentinel banner stays HIDDEN (user has cool-brook, not just
 *      a sentinel placeholder).
 *   2. ClawStatus indicator surfaces and reaches `connected` within a
 *      reasonable window (mint → WS open → connect handshake).
 *   3. Sidebar AccountFooter shows the real email.
 *
 * This is a smoke spec — it doesn't write anything (no message send,
 * no permission flip, no rename). Write-path verification belongs in a
 * separate spec against a throwaway test account once we have one.
 */

const skipUnlessRealMode = () => {
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL;
  const email = process.env.REAL_TEST_EMAIL;
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS;
  if (!baseUrl || !email || !bypass) {
    test.skip(
      true,
      'real-mode smoke needs PLAYWRIGHT_BASE_URL + VERCEL_AUTOMATION_BYPASS + REAL_TEST_EMAIL',
    );
  }
};

// Serialize real-mode specs: they share one test user, and the
// Supabase admin/generate_link endpoint rate-limits two parallel
// magic-link mints for the same email.
test.describe.configure({ mode: 'serial' });

test.describe('Phase 6 — real-mode preview smoke', () => {
  test.beforeEach(skipUnlessRealMode);

  // Desktop-only; ClawStatus + sidebar AccountFooter both live in the
  // desktop chrome. Mobile coverage rides on a follow-up surfaces test.
  test.skip(({ isMobile }) => isMobile === true, 'desktop-only smoke');

  test('signed-in user with a real claw sees connected ClawStatus', async ({
    page,
    context,
  }) => {
    await unlockVercelPreview(page);
    const email = process.env.REAL_TEST_EMAIL!;
    const minted = await injectRealSession(context, email);
    expect(minted.email).toBe(email);

    await page.goto('/');

    // Anonymous sentinel banner must stay hidden — this user owns a
    // real claw, not just the placeholder.
    await expect(page.getByTestId('sentinel-claw-banner')).toHaveCount(0);

    // Account footer reflects the real session.
    await expect(page.getByTestId('sidebar-account')).toContainText(email);

    // ClawStatus surfaces because env.useRealData is true at build time
    // and the user has a real claw to connect to. The status starts at
    // "正在连…" then flips to "已连上 claw" after the mint → WS connect
    // handshake completes. Allow 15s — DNS + TLS + Edge Function mint
    // + WS open + connect frame round-trip can add up on cold cache.
    const status = page.getByTestId('claw-status');
    await expect(status).toBeVisible();
    await expect(status).toHaveAttribute('data-status', 'connected', {
      timeout: 15_000,
    });
  });
});
