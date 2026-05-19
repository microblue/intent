import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { approvals as mockApprovals } from '@/mocks';
import type { Approval } from '@/mocks/types';
import type { Database } from '@/lib/db-types';
import { useGatewayEvent } from '@/gateway/useGateway';

/**
 * useApprovals — pending user-decision items the Now panel surfaces at
 * the top of its feed.
 *
 * Real mode: SELECT public.approvals WHERE user_id = auth.uid() AND
 * status = 'pending'. Realtime subscription on INSERTs pushes new
 * approvals to the feed without polling (the table is in the
 * supabase_realtime publication on the myclaw side).
 *
 * Mock mode falls back to the bundled prototype approvals.
 *
 * Approvals are user-visible but server-written — agents insert them
 * via service-role from apps/api when they need a decision. aios doesn't
 * INSERT approvals itself; it only resolves them via useResolveApproval.
 */

type DbApproval = Database['public']['Tables']['approvals']['Row'];

function dbRowToApproval(row: DbApproval): Approval {
  const options = row.options as Approval['options'] | null;
  return {
    id: row.id,
    intentId: row.intent_id,
    prompt: row.prompt,
    detail: row.detail ?? undefined,
    agentKey: row.agent_key ?? undefined,
    createdAt: row.created_at,
    options: options ?? undefined,
  };
}

export interface ApprovalsResult {
  approvals: Approval[];
  isLoading: boolean;
  error: Error | null;
  isMock: boolean;
}

const queryKey = (real: boolean, userId: string | null) =>
  ['approvals', { real, userId }] as const;

export function useApprovals(): ApprovalsResult {
  const { signedIn, user, loading: sessionLoading } = useSession();
  const useReal = env.useRealData && signedIn;
  const queryClient = useQueryClient();
  const key = queryKey(useReal, user?.id ?? null);

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<Approval[]> => {
      if (!useReal) return mockApprovals;
      const { data, error } = await supabase
        .from('approvals')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map(dbRowToApproval);
    },
    enabled: !sessionLoading,
  });

  // Realtime: subscribe to INSERTs. RLS handles user isolation server-side;
  // we additionally filter on status change in the handler since UPDATE
  // events (when an approval moves to resolved) should remove the row
  // from the pending list.
  useEffect(() => {
    if (!useReal) return;
    const channel = supabase
      .channel('approvals:pending')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'approvals' },
        (payload) => {
          const row = payload.new as DbApproval;
          if (row.status !== 'pending') return;
          const a = dbRowToApproval(row);
          queryClient.setQueryData<Approval[]>(key, (old = []) => {
            if (old.some((x) => x.id === a.id)) return old;
            return [a, ...old];
          });
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'approvals' },
        (payload) => {
          const row = payload.new as DbApproval;
          // Approval resolved → drop from pending list.
          if (row.status !== 'pending') {
            queryClient.setQueryData<Approval[]>(key, (old = []) =>
              old.filter((x) => x.id !== row.id),
            );
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useReal, user?.id, queryClient]);

  // Gateway event bridge: when OpenClaw raises exec.approval.* or
  // plugin.approval.*, the canonical source of truth moves (eventually,
  // when Phase 6 transitions away from Supabase-resident approvals
  // entirely). Until then, invalidate the cached approvals query so the
  // SPA refetches against whichever source currently holds them.
  useGatewayEvent(
    [
      'exec.approval.requested',
      'exec.approval.resolved',
      'plugin.approval.requested',
      'plugin.approval.resolved',
    ],
    () => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
  );

  return {
    approvals: query.data ?? [],
    isLoading: query.isLoading || sessionLoading,
    error: query.error as Error | null,
    isMock: !useReal,
  };
}

export interface ResolveApprovalResult {
  resolve: (id: string, outcome: 'approved' | 'rejected') => Promise<void>;
  isPending: boolean;
  error: Error | null;
  isMock: boolean;
}

export function useResolveApproval(): ResolveApprovalResult {
  const { signedIn } = useSession();
  const queryClient = useQueryClient();
  const useReal = env.useRealData && signedIn;

  const mutation = useMutation({
    mutationFn: async ({
      id,
      outcome,
    }: {
      id: string;
      outcome: 'approved' | 'rejected';
    }) => {
      if (!useReal) {
        if (!signedIn) throw new Error('演示模式,不会真的处理。');
        throw new Error('演示模式,不会真的处理。');
      }
      const { error } = await supabase
        .from('approvals')
        .update({
          status: outcome,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw new Error(error.message);
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
  });

  return {
    resolve: (id, outcome) => mutation.mutateAsync({ id, outcome }),
    isPending: mutation.isPending,
    error: mutation.error as Error | null,
    isMock: !useReal,
  };
}
