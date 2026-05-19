import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { capabilityGrants as mockGrants } from '@/mocks';
import type { CapabilityGrant } from '@/mocks/types';
import type { Database } from '@/lib/db-types';

/**
 * usePermissionGrants — per-user capability allow/ask/deny choices.
 *
 * Schema lives in myclaw (`permission_grants` table, composite PK
 * (user_id, capability_id), RLS-narrowed to auth.uid()). Rows are NOT
 * pre-seeded — a capability without a row defaults to `mode='ask'` in
 * the UI. Writes go through upsert so we can blindly INSERT without
 * caring whether a row already exists.
 *
 * Mock mode reads the bundled grants and reflects toggles in local
 * state via the mutation's optimistic cache update.
 */

type DbGrant = Database['public']['Tables']['permission_grants']['Row'];

function dbRowToGrant(row: DbGrant): CapabilityGrant {
  return {
    capabilityId: row.capability_id,
    mode: (row.mode as CapabilityGrant['mode']) ?? 'ask',
  };
}

export interface PermissionGrantsResult {
  grants: CapabilityGrant[];
  /** Lookup helper: mode for a given capability, defaulting to 'ask'. */
  modeOf: (capabilityId: string) => CapabilityGrant['mode'];
  isLoading: boolean;
  error: Error | null;
  isMock: boolean;
}

const queryKey = (real: boolean, userId: string | null) =>
  ['permission_grants', { real, userId }] as const;

export function usePermissionGrants(): PermissionGrantsResult {
  const { signedIn, user, loading: sessionLoading } = useSession();
  const useReal = env.useRealData && signedIn;

  const query = useQuery({
    queryKey: queryKey(useReal, user?.id ?? null),
    queryFn: async (): Promise<CapabilityGrant[]> => {
      if (!useReal) return mockGrants;
      const { data, error } = await supabase
        .from('permission_grants')
        .select('*');
      if (error) throw new Error(error.message);
      return (data ?? []).map(dbRowToGrant);
    },
    enabled: !sessionLoading,
  });

  const grants = query.data ?? [];
  const modeOf = (capabilityId: string): CapabilityGrant['mode'] =>
    grants.find((g) => g.capabilityId === capabilityId)?.mode ?? 'ask';

  return {
    grants,
    modeOf,
    isLoading: query.isLoading || sessionLoading,
    error: query.error as Error | null,
    isMock: !useReal,
  };
}

export interface SetPermissionModeResult {
  setMode: (
    capabilityId: string,
    mode: CapabilityGrant['mode'],
  ) => Promise<void>;
  isPending: boolean;
  error: Error | null;
  isMock: boolean;
}

export function useSetPermissionMode(): SetPermissionModeResult {
  const { signedIn, user } = useSession();
  const queryClient = useQueryClient();
  const useReal = env.useRealData && signedIn;
  const key = queryKey(useReal, user?.id ?? null);

  const mutation = useMutation({
    mutationFn: async ({
      capabilityId,
      mode,
    }: {
      capabilityId: string;
      mode: CapabilityGrant['mode'];
    }) => {
      // Optimistic update first so the toggle responds instantly even
      // before the network round-trip.
      queryClient.setQueryData<CapabilityGrant[]>(key, (old = []) => {
        const idx = old.findIndex((g) => g.capabilityId === capabilityId);
        if (idx === -1) return [...old, { capabilityId, mode }];
        const next = old.slice();
        next[idx] = { capabilityId, mode };
        return next;
      });

      if (!useReal) {
        if (!signedIn) {
          // Anonymous: leave the optimistic update in place so demo
          // viewers can play with toggles for the session, but tell the
          // caller this won't persist if they try to read it elsewhere.
          return;
        }
        return;
      }
      if (!user?.id) throw new Error('请先登录');

      const { error } = await supabase
        .from('permission_grants')
        .upsert(
          { user_id: user.id, capability_id: capabilityId, mode },
          { onConflict: 'user_id,capability_id' },
        );
      if (error) {
        // Roll back the optimistic write so the UI reflects reality.
        queryClient.invalidateQueries({ queryKey: ['permission_grants'] });
        throw new Error(error.message);
      }
    },
  });

  return {
    setMode: (capabilityId, mode) => mutation.mutateAsync({ capabilityId, mode }),
    isPending: mutation.isPending,
    error: mutation.error as Error | null,
    isMock: !useReal,
  };
}
