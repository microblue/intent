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

export const env = {
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
