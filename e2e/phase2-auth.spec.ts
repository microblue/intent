import { test, expect } from '@playwright/test';
import { stubSupabaseSession } from './helpers/auth-stub';

/**
 * Phase 2 — Supabase auth surfaces.
 *
 * Test strategy: exercise the UI without creating real Supabase users.
 * - Mode switching, validation, error rendering: pure UI behaviour
 * - Wrong-password path: hits Supabase, expects a friendly error
 * - Sign-out: simulated by stubbing localStorage session, since we can't
 *   reliably sign in via UI without a known test user
 *
 * If a future task adds a dedicated test user (e2e+phase2@myclaw.one),
 * we can flip the sign-in test from "expect rejection" to "expect home".
 */

test.describe('SignIn page', () => {
  test('defaults to password mode with both fields visible', async ({ page }) => {
    await page.goto('/auth/signin');
    await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
    await expect(page.getByPlaceholder('your@email.com')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /^登录$/ })).toBeVisible();
  });

  test('switches to magic-link mode and hides password field', async ({ page }) => {
    await page.goto('/auth/signin');
    await page.getByRole('button', { name: '改用邮件链接' }).click();
    await expect(page.getByRole('heading', { name: '邮件链接登录' })).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /给我发链接/ })).toBeVisible();
  });

  test('switches to signup mode and updates copy', async ({ page }) => {
    await page.goto('/auth/signin');
    await page.getByRole('button', { name: '注册', exact: true }).click();
    await expect(page.getByRole('heading', { name: '创建账号' })).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /^注册$/ })).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveAttribute(
      'autocomplete',
      'new-password',
    );
  });

  test('switches to forgot-password mode and hides password field', async ({ page }) => {
    await page.goto('/auth/signin');
    await page.getByRole('button', { name: '忘记密码?' }).click();
    await expect(page.getByRole('heading', { name: '找回密码' })).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '发送重置链接' })).toBeVisible();
  });

  test('signin mode rejects invalid email with friendly message', async ({ page }) => {
    await page.goto('/auth/signin');
    await page.getByPlaceholder('your@email.com').fill('not-an-email');
    await page.locator('input[type="password"]').fill('whatever');
    await page.getByRole('button', { name: /^登录$/ }).click();
    await expect(page.getByText(/看着不像邮箱地址/)).toBeVisible();
  });

  test('signin mode rejects empty password with inline error', async ({ page }) => {
    await page.goto('/auth/signin');
    await page.getByPlaceholder('your@email.com').fill('test@example.com');
    // No password filled — react-hook-form's required validation kicks in
    // with the Chinese message we wired into register().
    await page.getByRole('button', { name: /^登录$/ }).click();
    await expect(page.getByText('请输入密码')).toBeVisible();
  });

  test('signin mode rejects empty email with inline error', async ({ page }) => {
    await page.goto('/auth/signin');
    await page.getByRole('button', { name: /^登录$/ }).click();
    await expect(page.getByText('请输入邮箱')).toBeVisible();
  });

  test('signup mode rejects short password', async ({ page }) => {
    await page.goto('/auth/signin');
    await page.getByRole('button', { name: '注册', exact: true }).click();
    await page.getByPlaceholder('your@email.com').fill('test@example.com');
    await page.locator('input[type="password"]').fill('123');
    await page.getByRole('button', { name: /^注册$/ }).click();
    await expect(page.getByText(/密码至少 6 位/)).toBeVisible({ timeout: 10_000 });
  });

  test('back to signin link from forgot mode', async ({ page }) => {
    await page.goto('/auth/signin');
    await page.getByRole('button', { name: '忘记密码?' }).click();
    await expect(page.getByRole('heading', { name: '找回密码' })).toBeVisible();
    await page.getByRole('button', { name: '返回登录' }).click();
    await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
  });
});

test.describe('ResetPassword page', () => {
  test('shows stale-link state when arrived without a recovery session', async ({
    page,
  }) => {
    await page.goto('/auth/reset-password');
    // No Supabase session exists → the page should render the helpful
    // "链接好像失效了" empty state, not a confused blank form.
    await expect(page.getByRole('heading', { name: '链接好像失效了' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('link', { name: '重新发一个' })).toBeVisible();
  });
});

test.describe('Sidebar account footer (unauthenticated, desktop)', () => {
  // AccountFooter lives in the desktop sidebar. Mobile uses BottomDock
  // and exposes the same sign-in path through Settings (covered below).
  test.skip(({ isMobile }) => isMobile === true, 'desktop-only');

  test('shows demo-mode badge and sign-in CTA', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('未登录')).toBeVisible();
    await expect(page.getByTestId('sidebar-signin').first()).toBeVisible();
  });

  test('sign-in link navigates to /auth/signin', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('sidebar-signin').first().click();
    await expect(page).toHaveURL(/\/auth\/signin$/);
    await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
  });
});

test.describe('Settings account section (unauthenticated)', () => {
  test('shows sign-in prompt instead of fake user data', async ({ page }) => {
    await page.goto('/settings');
    // The previous hardcoded "DZ / microblue@gmail.com" must be gone for
    // signed-out users; instead a clear sign-in prompt should appear.
    await expect(page.getByText('还没有登录')).toBeVisible();
    await expect(page.getByTestId('settings-signin')).toBeVisible();
    // Sign-out button must not appear when there's no session.
    await expect(page.getByTestId('settings-signout')).toHaveCount(0);
  });
});

test.describe('AppShell guard', () => {
  test('auth routes render without sidebar chrome', async ({ page }) => {
    await page.goto('/auth/signin');
    // Sidebar's "想做的事" / "记得的事" nav rows must NOT appear on auth
    // routes — they're a standalone funnel.
    await expect(page.getByText('Personal AI OS')).toHaveCount(0);
  });
});

test.describe('Signed-in flows (stubbed session)', () => {
  test.beforeEach(async ({ context }) => {
    await stubSupabaseSession(context, { email: 'e2e@myclaw.test' });
  });

  test('sidebar account dropdown surfaces the signed-in email (desktop)', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile === true, 'desktop sidebar only');
    await page.goto('/');
    const trigger = page.getByTestId('sidebar-account');
    await expect(trigger).toBeVisible();
    await expect(trigger).toContainText('e2e@myclaw.test');
  });

  test('Settings shows the real email and a sign-out control', async ({ page }) => {
    await page.goto('/settings');
    // Email shows in both sidebar (desktop) and settings body — assert
    // explicitly on the settings body so the test stays meaningful even
    // on mobile (no sidebar).
    await expect(
      page.locator('main, [id="content"]').getByText('e2e@myclaw.test').first(),
    ).toBeVisible();
    await expect(page.getByTestId('settings-signout')).toBeVisible();
    await expect(page.getByTestId('settings-signin')).toHaveCount(0);
  });

  test('sign-out from Settings clears the session and redirects to signin', async ({
    page,
  }) => {
    await page.goto('/settings');
    await page.getByTestId('settings-signout').click();
    // Redirect happens via navigate() — wait for the URL flip, then verify
    // the SignIn page rendered, not just an intermediate route.
    await page.waitForURL(/\/auth\/signin$/);
    await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
    // Verify localStorage no longer holds a session — sign-out must
    // actually wipe the token, not just nav away.
    const remaining = await page.evaluate(() =>
      Object.keys(localStorage).filter((k) => k.startsWith('sb-')),
    );
    expect(remaining).toEqual([]);
  });

  test('sign-out from sidebar dropdown redirects to signin (desktop)', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile === true, 'desktop sidebar only');
    await page.goto('/');
    await page.getByTestId('sidebar-account').click();
    await page.getByTestId('sidebar-signout').click();
    await page.waitForURL(/\/auth\/signin$/);
    await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
  });

  test('visiting /auth/signin while signed-in bounces home', async ({ page }) => {
    await page.goto('/auth/signin');
    // The SignIn page's useEffect navigates to "/" once useSession
    // resolves with signedIn=true.
    await page.waitForURL((url) => url.pathname === '/', { timeout: 10_000 });
  });
});
