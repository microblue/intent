/**
 * Vite-time environment variables, narrowed and typed.
 *
 * Why a wrapper instead of inlining `import.meta.env.*`:
 * - Single point of truth for which vars exist + their defaults
 * - Fail fast at module load if a required var is missing (vs. silent
 *   undefined that surfaces 10 minutes later in a fetch)
 * - Boolean coercion of "true"/"false" string env values
 * - Easier to mock in tests
 */

function required(name: string): string {
  const value = import.meta.env[name as keyof ImportMetaEnv] as string | undefined;
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. Add it to .env.local (sourced from ~/.openclaw/credentials/myclaw-supabase.env).`,
    );
  }
  return value;
}

function flag(name: string, defaultValue: boolean): boolean {
  const v = import.meta.env[name as keyof ImportMetaEnv] as string | undefined;
  if (v === undefined || v === '') return defaultValue;
  return v === 'true' || v === '1';
}

export const env = {
  supabaseUrl: required('VITE_SUPABASE_URL'),
  supabaseAnonKey: required('VITE_SUPABASE_ANON_KEY'),
  /**
   * When false (default), data hooks return mock data from `src/mocks/`.
   * When true, hooks fetch from Supabase via TanStack Query. This lets the
   * Phase 1 demo keep working while we migrate data sources one at a time
   * during Phase 2. Flip per-feature, not globally, once the table is
   * proven to round-trip.
   */
  useRealData: flag('VITE_USE_REAL_DATA', false),
  isProd: import.meta.env.PROD,
  isDev: import.meta.env.DEV,
  /**
   * Sentry DSN — empty string disables capture entirely (no-op init).
   * Production deploys set this in Vercel; dev/local leaves it blank so
   * console logging is the only feedback. Provision steps live in
   * `docs/handoff/sentry-setup.md`.
   */
  sentryDsn: (import.meta.env.VITE_SENTRY_DSN as string | undefined) ?? '',
} as const;
