/**
 * mock-guard — flag every mock function call that happens during a
 * real-mode session.
 *
 * Background: bug class found in v2 audit. Real-mode pages were silently
 * reading `conceptCountsFor`, `outlineFor`, `filesFor`, etc. from
 * `@/mocks` because the call site was never migrated to a Supabase
 * hook. The visible UI showed plausible-looking numbers (0 / small),
 * walkthrough screenshots passed, but the actual data was fake.
 *
 * The guard:
 * - Logs `console.error('[mock-in-real-mode] <name> called …')` when
 *   any wrapped mock function is invoked while `env.useRealData = true`.
 * - Idempotent per (function, intent-or-arg-stripe) so a single render
 *   pass that calls the same function many times doesn't spam the log.
 * - Walkthrough specs assert `console.error` count is 0 during real-mode
 *   runs; any firing of this guard FAILS the spec.
 *
 * Usage: wrap each suspect mock export at the barrel:
 *   export const conceptCountsFor = guardedMock('conceptCountsFor', _conceptCountsFor);
 *
 * Do NOT remove guards once code is migrated — they stay as a smoke
 * test against regressions.
 */

import { env } from './env';

const fired = new Set<string>();

export function guardedMock<TArgs extends unknown[], TReturn>(
  name: string,
  fn: (...args: TArgs) => TReturn,
): (...args: TArgs) => TReturn {
  return (...args: TArgs): TReturn => {
    if (env.useRealData && typeof window !== 'undefined') {
      const key = `${name}:${JSON.stringify(args).slice(0, 80)}`;
      if (!fired.has(key)) {
        fired.add(key);
        // eslint-disable-next-line no-console
        console.error(
          `[mock-in-real-mode] ${name}(${JSON.stringify(args).slice(0, 60)}) ` +
            `called in real mode — data is fake. Migrate the call site to a ` +
            `Supabase-backed hook (see src/data/use<Thing>.ts pattern).`,
        );
      }
    }
    return fn(...args);
  };
}

/**
 * Test hook: clear the dedup set so a Playwright spec can re-assert
 * from scratch. Exposed via `(window as any).__resetMockGuard` only in
 * dev / preview builds; production builds tree-shake this.
 */
if (env.isDev && typeof window !== 'undefined') {
  (window as unknown as { __resetMockGuard?: () => void }).__resetMockGuard = () => {
    fired.clear();
  };
}
