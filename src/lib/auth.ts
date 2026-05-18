import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

/**
 * useSession — subscribe to the Supabase auth session.
 *
 * Returns:
 *   session   the current session (null when signed out, undefined while loading)
 *   user      convenience pointer to session.user
 *   loading   true on first render until getSession() resolves
 *
 * Phase 1 → Phase 2 transition note: the prototype is fully accessible
 * without auth (mock data). Once we flip individual data sources to real,
 * those hooks check session and return mocks-or-empty when signed out.
 */
export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    // Initial fetch
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setSession(data.session ?? null);
    });

    // Subscribe to future changes (sign-in, sign-out, token refresh)
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s ?? null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return {
    session: session === undefined ? null : session,
    user: (session?.user ?? null) as User | null,
    loading: session === undefined,
    signedIn: !!session,
  };
}

/** Sign out and clear local session. */
export async function signOut() {
  await supabase.auth.signOut();
}

/**
 * Send a magic link to the user's email. Returns success/error so the
 * caller can render an inline confirmation. Uses PKCE flow under the
 * hood (configured in `supabase.ts`).
 */
export async function sendMagicLink(email: string, redirectTo?: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
  });
  if (error) {
    return { ok: false as const, error: friendlyAuthError(error.message) };
  }
  return { ok: true as const };
}

/** Email + password sign-in. */
export async function signInWithPassword(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { ok: false as const, error: friendlyAuthError(error.message) };
  }
  return { ok: true as const };
}

/**
 * Email + password sign-up. With email confirmation disabled on the project
 * (current Phase 2 setting), this auto-logs the user in. If confirmations
 * are later enabled, Supabase returns success but no session — caller should
 * still show a "check your email" state.
 */
export async function signUpWithPassword(
  email: string,
  password: string,
  redirectTo?: string,
) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
  });
  if (error) {
    return { ok: false as const, error: friendlyAuthError(error.message) };
  }
  // session present → auto-logged-in (confirmations off)
  // session null   → user needs to verify email first
  return { ok: true as const, needsConfirmation: !data.session };
}

/**
 * Send a password-reset email. The link lands the user on `redirectTo`
 * with an active recovery session — that page collects the new password
 * and calls `updatePassword`.
 */
export async function resetPasswordForEmail(email: string, redirectTo?: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
  if (error) {
    return { ok: false as const, error: friendlyAuthError(error.message) };
  }
  return { ok: true as const };
}

/** Update the current user's password (used during recovery flow). */
export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { ok: false as const, error: friendlyAuthError(error.message) };
  }
  return { ok: true as const };
}

// Map Supabase's English error strings to lay-user-friendly Chinese copy.
// Anything we don't recognise falls through to the raw message — better
// than swallowing diagnostic info.
function friendlyAuthError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return '邮箱或密码不对,再试试?';
  if (m.includes('user already registered')) return '这个邮箱已经注册过了,直接登录就行';
  if (m.includes('password should be at least')) return '密码太短了,至少 6 位';
  if (m.includes('email rate limit') || m.includes('over_email_send_rate_limit'))
    return '邮件发太频繁了,等一两分钟再试';
  if (m.includes('rate limit')) return '请求太频繁了,稍等一下再试';
  if (m.includes('email not confirmed')) return '邮箱还没验证,看看收件箱里的验证邮件';
  if (m.includes('signup') && m.includes('disabled')) return '现在不开放注册';
  if (m.includes('same as the old password') || m.includes('different password'))
    return '新密码不能跟旧的一样';
  return msg;
}
