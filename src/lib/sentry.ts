import * as Sentry from '@sentry/react';
import { env } from './env';

/**
 * Initialize Sentry error capture.
 *
 * No-op unless we're in a production bundle AND a DSN has been provided
 * via `VITE_SENTRY_DSN`. Local dev + preview deploys without the env
 * var stay silent so test throws don't pollute the production project.
 *
 * Kept minimal on purpose: error capture only, no perf tracing or
 * session replay. Bundle budget matters (current bundle ~1MB) and the
 * extra surfaces can be turned on per-feature later.
 */
export function initSentry(): void {
  if (!env.isProd || !env.sentryDsn) return;

  Sentry.init({
    dsn: env.sentryDsn,
    environment: 'production',
    // Errors only — keep the bundle and the Sentry bill small.
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // Don't capture during a graceful sign-out; the session is already
    // teardown territory and any "user is null" type errors there are
    // noise, not bugs.
    beforeSend(event) {
      if (event.exception?.values?.some((v) => v.value?.includes('AuthSessionMissingError'))) {
        return null;
      }
      return event;
    },
  });
}

/**
 * Test-only helper for the dev-mode `/settings/engines` button: throws
 * a labelled error so we can verify the error boundary + (eventually)
 * the Sentry pipeline are wired correctly. Production builds still
 * include the throw — gate the *button* on `env.isDev` instead so the
 * surface area is small.
 */
export function throwTestError(): never {
  throw new Error('Sentry test throw — fired from /settings/engines');
}
