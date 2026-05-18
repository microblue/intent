import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import {
  resetPasswordForEmail,
  sendMagicLink,
  signInWithPassword,
  signUpWithPassword,
  useSession,
} from '@/lib/auth';
import { cn } from '@/lib/cn';

/**
 * Sign-in surface.
 *
 * Four modes drive one form:
 *   signin  — email + password (default)
 *   signup  — email + password, creates account
 *   magic   — email only, link sent to inbox
 *   forgot  — email only, password-reset link sent
 *
 * We keep them on a single page (no separate routes) because the user
 * journey between "I have no password" → "send me a link" → "actually let
 * me set one" should be a copy swap, not a navigation.
 */

type Mode = 'signin' | 'signup' | 'magic' | 'forgot';

const emailSchema = z.string().email('看着不像邮箱地址,再检查一下?');
const passwordSchema = z.string().min(6, '密码至少 6 位');

interface FormValues {
  email: string;
  password: string;
}

const COPY: Record<
  Mode,
  { title: string; subtitle: string; submit: string; busy: string }
> = {
  signin: {
    title: '欢迎回来',
    subtitle: '输入邮箱和密码登录',
    submit: '登录',
    busy: '登录中…',
  },
  signup: {
    title: '创建账号',
    subtitle: '用邮箱注册,设置一个密码',
    submit: '注册',
    busy: '注册中…',
  },
  magic: {
    title: '邮件链接登录',
    subtitle: '不想记密码?我们发个链接到你邮箱,点一下就登录',
    submit: '给我发链接 →',
    busy: '发送中…',
  },
  forgot: {
    title: '找回密码',
    subtitle: '输入邮箱,我们会发个重置链接给你',
    submit: '发送重置链接',
    busy: '发送中…',
  },
};

export function SignInPage() {
  const navigate = useNavigate();
  const { signedIn, loading } = useSession();
  const [mode, setMode] = useState<Mode>('signin');
  const [magicSent, setMagicSent] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState<string | null>(null);
  const [confirmSent, setConfirmSent] = useState<string | null>(null);
  const [serverErr, setServerErr] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    clearErrors,
  } = useForm<FormValues>({
    defaultValues: { email: '', password: '' },
  });

  // Already signed in → bounce home. Effect, not render-time.
  useEffect(() => {
    if (!loading && signedIn) {
      navigate({ to: '/' });
    }
  }, [loading, signedIn, navigate]);

  // Mode change clears stale errors but preserves the email value so users
  // who toggle "signin → magic" don't have to retype. Password isn't
  // shown in magic/forgot modes so its lingering value is invisible; the
  // submit handler reads `password` only in signin/signup branches.
  useEffect(() => {
    setServerErr(null);
    setMagicSent(null);
    setResetSent(null);
    setConfirmSent(null);
    clearErrors();
  }, [mode, clearErrors]);

  if (signedIn) return null;

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setServerErr(null);
    const trimmedEmail = email.trim();
    const emailCheck = emailSchema.safeParse(trimmedEmail);
    if (!emailCheck.success) {
      setServerErr(emailCheck.error.issues[0]?.message ?? '');
      return;
    }

    if (mode === 'magic') {
      const result = await sendMagicLink(trimmedEmail, `${window.location.origin}/`);
      if (result.ok) setMagicSent(trimmedEmail);
      else setServerErr(result.error);
      return;
    }

    if (mode === 'forgot') {
      const result = await resetPasswordForEmail(
        trimmedEmail,
        `${window.location.origin}/auth/reset-password`,
      );
      if (result.ok) setResetSent(trimmedEmail);
      else setServerErr(result.error);
      return;
    }

    if (mode === 'signup') {
      const pwCheck = passwordSchema.safeParse(password);
      if (!pwCheck.success) {
        setServerErr(pwCheck.error.issues[0]?.message ?? '');
        return;
      }
      const result = await signUpWithPassword(
        trimmedEmail,
        password,
        `${window.location.origin}/`,
      );
      if (!result.ok) {
        setServerErr(result.error);
        return;
      }
      // With email confirmation OFF (current project setting) the user is
      // signed in immediately and the redirect effect picks it up. If a
      // future config flip turns confirmations on, show the inbox prompt.
      if (result.needsConfirmation) setConfirmSent(trimmedEmail);
      return;
    }

    // signin
    if (!password) {
      setServerErr('请输入密码');
      return;
    }
    const result = await signInWithPassword(trimmedEmail, password);
    if (!result.ok) setServerErr(result.error);
  });

  const showPassword = mode === 'signin' || mode === 'signup';
  const copy = COPY[mode];

  return (
    <div className="flex min-h-screen items-center justify-center bg-base-100 px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <Link to="/" className="mb-8 flex items-center gap-3">
          <span aria-hidden className="relative grid h-10 w-10 place-items-center">
            <span className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/35 via-secondary/30 to-accent/35 opacity-70 blur-[3px]" />
            <svg viewBox="0 0 32 32" className="relative h-7 w-7" fill="none">
              <defs>
                <linearGradient id="signin-stroke" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="oklch(78% 0.18 295)" />
                  <stop offset="55%" stopColor="oklch(72% 0.16 235)" />
                  <stop offset="100%" stopColor="oklch(82% 0.15 80)" />
                </linearGradient>
              </defs>
              <path d="M5.5 21.5C8.5 13.5 13 8.5 20 5.5" stroke="url(#signin-stroke)" strokeWidth="2.4" strokeLinecap="round" opacity="0.55" />
              <path d="M8.5 25C12.5 16.5 17.5 11.5 26 8.5" stroke="url(#signin-stroke)" strokeWidth="2.4" strokeLinecap="round" opacity="0.8" />
              <path d="M13 28.5C17 21 21 16 28 13.5" stroke="url(#signin-stroke)" strokeWidth="2.6" strokeLinecap="round" />
              <circle cx="27.5" cy="11" r="1.6" fill="oklch(82% 0.15 80)" />
            </svg>
          </span>
          <span className="font-bold tracking-tight" style={{ fontSize: '1.15rem' }}>
            <span className="text-base-content">my</span>
            <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
              claw
            </span>
          </span>
        </Link>

        {magicSent ? (
          <SentCard
            email={magicSent}
            heading={`链接已发到 ${magicSent}`}
            body="到你的邮箱里点那封信里的链接,就能进来了。链接 1 小时内有效。"
            onChangeEmail={() => setMagicSent(null)}
          />
        ) : resetSent ? (
          <SentCard
            email={resetSent}
            heading={`重置链接已发到 ${resetSent}`}
            body="点邮件里的链接就能设置新密码。链接 1 小时内有效。"
            onChangeEmail={() => {
              setResetSent(null);
              setMode('signin');
            }}
            backLabel="返回登录"
          />
        ) : confirmSent ? (
          <SentCard
            email={confirmSent}
            heading={`验证邮件已发到 ${confirmSent}`}
            body="点邮件里的链接验证邮箱,之后就能登录了。"
            onChangeEmail={() => {
              setConfirmSent(null);
              setMode('signin');
            }}
            backLabel="返回登录"
          />
        ) : (
          <>
            <h1 className="mb-1 text-2xl font-bold tracking-tight">{copy.title}</h1>
            <p className="mb-6 text-sm text-base-content/60">{copy.subtitle}</p>

            <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
              {/* noValidate lets our zod checks run instead of the browser's
                  HTML5 validation popup — friendlier copy, consistent UX. */}
              <label className="form-control">
                <span className="label-text mb-1.5 text-sm font-medium">邮箱</span>
                <input
                  type="email"
                  autoFocus
                  autoComplete="email"
                  placeholder="your@email.com"
                  {...register('email', { required: '请输入邮箱' })}
                  className={cn(
                    'input input-bordered w-full',
                    errors.email && 'input-error',
                  )}
                />
                {errors.email && (
                  <span className="mt-1 text-xs text-error">{errors.email.message}</span>
                )}
              </label>

              {showPassword && (
                <label className="form-control">
                  <span className="label-text mb-1.5 text-sm font-medium">密码</span>
                  <input
                    type="password"
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    placeholder={mode === 'signup' ? '至少 6 位' : ''}
                    {...register('password', { required: '请输入密码' })}
                    className={cn(
                      'input input-bordered w-full',
                      errors.password && 'input-error',
                    )}
                  />
                  {errors.password && (
                    <span className="mt-1 text-xs text-error">{errors.password.message}</span>
                  )}
                </label>
              )}

              {serverErr && (
                <div className="alert alert-error text-sm">
                  <span>{serverErr}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="btn btn-primary mt-2 gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <span className="loading loading-spinner loading-sm" />
                    {copy.busy}
                  </>
                ) : (
                  copy.submit
                )}
              </button>
            </form>

            <ModeNav mode={mode} setMode={setMode} />

            <p className="mt-6 text-center text-xs text-base-content/45">
              <Link to="/" className="hover:text-base-content/70">
                先看看演示
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function ModeNav({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  // Discoverable navigation between modes — lay-user-friendly text links,
  // not a tab bar (tabs imply equal weight; here password is primary).
  if (mode === 'signin') {
    return (
      <div className="mt-5 flex flex-col items-center gap-2 text-xs text-base-content/60">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <button type="button" onClick={() => setMode('forgot')} className="hover:text-primary">
            忘记密码?
          </button>
          <span className="opacity-30">·</span>
          <button type="button" onClick={() => setMode('magic')} className="hover:text-primary">
            改用邮件链接
          </button>
        </div>
        <div>
          没有账号?{' '}
          <button type="button" onClick={() => setMode('signup')} className="text-primary hover:underline">
            注册
          </button>
        </div>
      </div>
    );
  }
  if (mode === 'signup') {
    return (
      <div className="mt-5 text-center text-xs text-base-content/60">
        已有账号?{' '}
        <button type="button" onClick={() => setMode('signin')} className="text-primary hover:underline">
          登录
        </button>
      </div>
    );
  }
  if (mode === 'magic') {
    return (
      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-base-content/60">
        <button type="button" onClick={() => setMode('signin')} className="hover:text-primary">
          改用密码登录
        </button>
        <span className="opacity-30">·</span>
        <button type="button" onClick={() => setMode('signup')} className="hover:text-primary">
          注册新账号
        </button>
      </div>
    );
  }
  // forgot
  return (
    <div className="mt-5 text-center text-xs text-base-content/60">
      想起来了?{' '}
      <button type="button" onClick={() => setMode('signin')} className="text-primary hover:underline">
        返回登录
      </button>
    </div>
  );
}

function SentCard({
  heading,
  body,
  onChangeEmail,
  backLabel = '换个邮箱',
}: {
  email: string;
  heading: string;
  body: string;
  onChangeEmail: () => void;
  backLabel?: string;
}) {
  return (
    <article className="rounded-2xl bg-base-200/60 p-6 ring-1 ring-base-300/40">
      <div className="text-2xl">📬</div>
      <h1 className="mt-3 text-xl font-semibold">{heading}</h1>
      <p className="mt-2 text-sm leading-relaxed text-base-content/65">{body}</p>
      <p className="mt-3 text-xs text-base-content/45">
        没收到?看看垃圾邮件,或者{' '}
        <button type="button" onClick={onChangeEmail} className="text-primary hover:underline">
          {backLabel}
        </button>
        。
      </p>
    </article>
  );
}
