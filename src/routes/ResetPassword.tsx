import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { updatePassword, useSession } from '@/lib/auth';
import { cn } from '@/lib/cn';

/**
 * Password-reset landing page.
 *
 * Flow: user clicks the reset link in their email → Supabase exchanges the
 * recovery code (via `detectSessionInUrl`) → user lands here with an
 * active recovery session → we collect the new password → on success
 * bounce home (now signed in).
 *
 * If someone reaches this page without an active session, the link is
 * stale / they typed the URL by hand — show a friendly nudge back to
 * sign-in instead of a blank form.
 */

const schema = z.object({
  password: z.string().min(6, '密码至少 6 位'),
});
type FormValues = z.infer<typeof schema>;

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const { signedIn, loading } = useSession();
  const [done, setDone] = useState(false);
  const [serverErr, setServerErr] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: { password: '' } });

  useEffect(() => {
    if (done) {
      const t = setTimeout(() => navigate({ to: '/' }), 1200);
      return () => clearTimeout(t);
    }
  }, [done, navigate]);

  const onSubmit = handleSubmit(async ({ password }) => {
    setServerErr(null);
    const parsed = schema.safeParse({ password });
    if (!parsed.success) {
      setServerErr(parsed.error.issues[0]?.message ?? '');
      return;
    }
    const result = await updatePassword(password);
    if (!result.ok) {
      setServerErr(result.error);
      return;
    }
    setDone(true);
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-base-100 px-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 inline-flex items-center gap-3">
          <span aria-hidden className="relative grid h-10 w-10 place-items-center">
            <span className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/35 via-secondary/30 to-accent/35 opacity-70 blur-[3px]" />
            <svg viewBox="0 0 32 32" className="relative h-7 w-7" fill="none">
              <defs>
                <linearGradient id="reset-stroke" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="oklch(78% 0.18 295)" />
                  <stop offset="55%" stopColor="oklch(72% 0.16 235)" />
                  <stop offset="100%" stopColor="oklch(82% 0.15 80)" />
                </linearGradient>
              </defs>
              <path d="M5.5 21.5C8.5 13.5 13 8.5 20 5.5" stroke="url(#reset-stroke)" strokeWidth="2.4" strokeLinecap="round" opacity="0.55" />
              <path d="M8.5 25C12.5 16.5 17.5 11.5 26 8.5" stroke="url(#reset-stroke)" strokeWidth="2.4" strokeLinecap="round" opacity="0.8" />
              <path d="M13 28.5C17 21 21 16 28 13.5" stroke="url(#reset-stroke)" strokeWidth="2.6" strokeLinecap="round" />
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

        {done ? (
          <article className="rounded-2xl bg-base-200/60 p-6 ring-1 ring-base-300/40">
            <div className="text-2xl">✅</div>
            <h1 className="mt-3 text-xl font-semibold">密码已更新</h1>
            <p className="mt-2 text-sm text-base-content/65">正在带你进去…</p>
          </article>
        ) : !loading && !signedIn ? (
          <article className="rounded-2xl bg-base-200/60 p-6 ring-1 ring-base-300/40">
            <div className="text-2xl">🔗</div>
            <h1 className="mt-3 text-xl font-semibold">链接好像失效了</h1>
            <p className="mt-2 text-sm leading-relaxed text-base-content/65">
              重置链接可能过期了,或者已经用过。
            </p>
            <Link to="/auth/signin" className="btn btn-primary mt-4">
              重新发一个
            </Link>
          </article>
        ) : (
          <>
            <h1 className="mb-1 text-2xl font-bold tracking-tight">设置新密码</h1>
            <p className="mb-6 text-sm text-base-content/60">输入一个新密码,至少 6 位。</p>

            <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
              <label className="form-control">
                <span className="label-text mb-1.5 text-sm font-medium">新密码</span>
                <input
                  type="password"
                  autoFocus
                  autoComplete="new-password"
                  placeholder="至少 6 位"
                  {...register('password', { required: '请输入新密码' })}
                  className={cn(
                    'input input-bordered w-full',
                    errors.password && 'input-error',
                  )}
                />
                {errors.password && (
                  <span className="mt-1 text-xs text-error">{errors.password.message}</span>
                )}
              </label>

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
                    保存中…
                  </>
                ) : (
                  '保存新密码'
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
