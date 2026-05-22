import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { useUI } from '@/state/ui';
import type { Database } from '@/lib/db-types';

/**
 * useClaws — list of claws the signed-in user owns.
 *
 * Used for two things:
 *   1. Resolve the default `claw_id` when creating a new intent (the
 *      first/oldest claw is the user's "home" instance for now)
 *   2. Drive the claw-gate that bounces users with zero claws over to
 *      the install flow on myclaw.one
 *
 * Mock mode (`VITE_USE_REAL_DATA=false`) always returns a single synthetic
 * claw so the demo experience can pretend the user is provisioned — the
 * gate stays open in dev.
 */

export type Claw = Database['public']['Tables']['claws']['Row'];

/**
 * Sentinel-claw marker. The myclaw `handle_new_auth_user()` trigger
 * inserts a placeholder claw row with `plan_id = SENTINEL_PLAN_ID` for
 * every new user — purely so aios's claw-gate (0 claws → install
 * redirect) doesn't fire and lock new users out of the demo. The
 * sentinel has `subdomain = null`, no real gateway, and can't actually
 * be connected to. Real claws come from a myclaw.one purchase flow.
 *
 * Exported so the UI can detect "user is signed in but has only the
 * placeholder" and steer them to open a real claw.
 */
export const SENTINEL_PLAN_ID = 'aios-prototype';

export function isSentinelClaw(c: Claw): boolean {
  return c.plan_id === SENTINEL_PLAN_ID;
}

// Synthetic claw used while we're in mock mode so create-intent has a
// non-null FK target. The id stays stable across reloads.
const MOCK_CLAW_ID = '00000000-0000-0000-0000-cccccccccccc';

const MOCK_CLAW: Claw = {
  // Many of these columns aren't relevant to the demo, but the generated
  // types require them. Default to safe-looking stubs.
  activation_code_id: null,
  billing_interval: null,
  central_token: null,
  claw_type: 'aios-default',
  created_at: new Date(0).toISOString(),
  deletion_scheduled_at: null,
  gateway_token: null,
  id: MOCK_CLAW_ID,
  install_run_id: null,
  ip: null,
  last_reinstalled_at: null,
  location: null,
  model: null,
  name: 'demo claw',
  plan_id: 'demo',
  polar_customer_id: null,
  polar_product_id: null,
  polar_subscription_id: null,
  provider: 'demo',
  provider_server_id: null,
  root_password: null,
  ssh_key_id: null,
  status: 'active',
  subdomain: null,
  // Generated types include columns we haven't enumerated above (e.g.
  // updated_at, user_id); cast covers the gaps without forcing a
  // type-by-type stub of fields we never read.
} as unknown as Claw;

export interface ClawsResult {
  claws: Claw[];
  /** Claws excluding the sentinel placeholder — the ones a user can actually connect to. */
  realClaws: Claw[];
  /** Most users currently have one claw; default to the first real claw, falling back to whatever's there. */
  defaultClaw: Claw | null;
  /**
   * The claw the SPA should currently treat as "active" — the user's
   * `selectedClawId` if it resolves to one of their real claws, else
   * `defaultClaw`. New intents target this claw; the gateway connects
   * to it. Switches reactively when the user picks a different claw
   * in ClawPicker.
   */
  activeClaw: Claw | null;
  /** True when the user has at least one non-sentinel claw. */
  hasRealClaw: boolean;
  /**
   * True when the user has claws but ALL of them are sentinel placeholders —
   * they've been auto-provisioned but haven't opened a real claw on
   * myclaw.one yet. Drives the "go open a real claw" prompt in IntentList.
   */
  isSentinelOnly: boolean;
  isLoading: boolean;
  /** True after the query lands; lets the gate distinguish "still fetching" from "empty". */
  hasResolved: boolean;
  isMock: boolean;
  error: Error | null;
}

export function useClaws(): ClawsResult {
  const { signedIn, user, loading: sessionLoading } = useSession();
  const useReal = env.useRealData && signedIn;

  const query = useQuery({
    queryKey: ['claws', { real: useReal, userId: user?.id ?? null }],
    queryFn: async (): Promise<Claw[]> => {
      if (!useReal) return [MOCK_CLAW];
      const { data, error } = await supabase
        .from('claws')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !sessionLoading,
  });

  const claws = query.data ?? [];
  const realClaws = claws.filter((c) => !isSentinelClaw(c));
  const hasRealClaw = realClaws.length > 0;
  const isSentinelOnly = useReal && claws.length > 0 && !hasRealClaw;
  // Pick the first real claw if one exists; otherwise fall back to whatever's
  // there (sentinel or mock) so callers still get a non-null FK target.
  const defaultClaw = realClaws[0] ?? claws[0] ?? null;
  // The user's UI-store-selected claw. We resolve it against realClaws
  // only — selecting the sentinel placeholder isn't meaningful.
  const selectedClawId = useUI((s) => s.selectedClawId);
  const selectedClaw =
    selectedClawId !== null
      ? realClaws.find((c) => c.id === selectedClawId) ?? null
      : null;
  const activeClaw = selectedClaw ?? defaultClaw;
  return {
    claws,
    realClaws,
    defaultClaw,
    activeClaw,
    hasRealClaw,
    isSentinelOnly,
    isLoading: query.isLoading || sessionLoading,
    hasResolved: !sessionLoading && (query.isSuccess || query.isError),
    isMock: !useReal,
    error: query.error as Error | null,
  };
}
