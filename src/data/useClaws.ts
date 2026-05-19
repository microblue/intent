import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
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
  defaultClaw: Claw | null;
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
  return {
    claws,
    defaultClaw: claws[0] ?? null,
    isLoading: query.isLoading || sessionLoading,
    hasResolved: !sessionLoading && (query.isSuccess || query.isError),
    isMock: !useReal,
    error: query.error as Error | null,
  };
}
