import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { BUILTIN_AGENTS, findBuiltinAgent } from '@/lib/agents';
import type { Database } from '@/lib/db-types';

/**
 * useIntentAgents — the team of OpenClaw agents the user has invited
 * to an intent. Drives the IntentHome "助手团队" panel + restricts the
 * AgentPicker to team members for that intent.
 *
 * Schema (existing in myclaw):
 *   intent_id text, agent_key text, display_name text,
 *   is_orchestrator boolean, created_at timestamptz
 * RLS narrows to rows whose intent belongs to auth.uid().
 *
 * Mock mode: returns a default-recommended team (main + 0-2 specialists
 * based on the intent's title keywords) so the prototype still feels
 * "alive" without a real DB.
 */

type DbIntentAgent = Database['public']['Tables']['intent_agents']['Row'];

export interface IntentAgentRow {
  intentId: string;
  agentKey: string;
  displayName: string;
  isOrchestrator: boolean;
  createdAt: string;
}

function dbRowToIntentAgent(row: DbIntentAgent): IntentAgentRow {
  return {
    intentId: row.intent_id,
    agentKey: row.agent_key,
    displayName: row.display_name,
    isOrchestrator: row.is_orchestrator,
    createdAt: row.created_at,
  };
}

const queryKey = (intentId: string, real: boolean, userId: string | null) =>
  ['intent_agents', { real, userId, intentId }] as const;

export interface IntentAgentsResult {
  team: IntentAgentRow[];
  isLoading: boolean;
  error: Error | null;
  isMock: boolean;
}

export function useIntentAgents(intentId: string | null): IntentAgentsResult {
  const { signedIn, user, loading: sessionLoading } = useSession();
  const useReal = env.useRealData && signedIn && Boolean(intentId);
  const queryClient = useQueryClient();
  const key = queryKey(intentId ?? '', useReal, user?.id ?? null);

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<IntentAgentRow[]> => {
      if (!intentId) return [];
      if (!useReal) {
        // Mock fallback: default team is just main. The /new wizard
        // (step iii) will inject a richer recommended team into the
        // DB on real-mode intent create.
        return [
          {
            intentId,
            agentKey: 'main',
            displayName: 'Claw',
            isOrchestrator: true,
            createdAt: new Date(0).toISOString(),
          },
        ];
      }
      const { data, error } = await supabase
        .from('intent_agents')
        .select('*')
        .eq('intent_id', intentId)
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map(dbRowToIntentAgent);
    },
    enabled: !sessionLoading && Boolean(intentId),
  });

  // Realtime: any insert/delete on intent_agents for this intent → refetch.
  // Channel name uses a per-effect-run UUID so React 19 strict-mode
  // mount → cleanup → mount cycles never collide on the same channel
  // topic (see useApprovals.ts for the full explanation; the same
  // `cannot add postgres_changes callbacks ... after subscribe()`
  // crash surfaced here and broke /intent in real mode).
  useEffect(() => {
    if (!useReal || !intentId) return;
    const channel = supabase
      .channel(`intent_agents:${intentId}:${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'intent_agents',
          filter: `intent_id=eq.${intentId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: key });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useReal, intentId, queryClient]);

  return {
    team: query.data ?? [],
    isLoading: query.isLoading || sessionLoading,
    error: query.error as Error | null,
    isMock: !useReal,
  };
}

export interface AddTeamMemberResult {
  add: (agentKey: string) => Promise<void>;
  isPending: boolean;
  error: Error | null;
  isMock: boolean;
}

export function useAddTeamMember(intentId: string | null): AddTeamMemberResult {
  const { signedIn } = useSession();
  const useReal = env.useRealData && signedIn && Boolean(intentId);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (agentKey: string): Promise<void> => {
      if (!intentId) throw new Error('intent id missing');
      const agent = findBuiltinAgent(agentKey);
      if (!agent) throw new Error(`unknown agent: ${agentKey}`);
      if (!useReal) throw new Error('演示模式不会保存');
      const { error } = await supabase.from('intent_agents').insert({
        intent_id: intentId,
        agent_key: agent.id,
        display_name: agent.name,
        // Don't auto-promote to orchestrator. Only main holds that role
        // unless the user explicitly changes it (future feature).
        is_orchestrator: agent.id === 'main',
      });
      if (error && !/duplicate key/i.test(error.message)) {
        throw new Error(error.message);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intent_agents'] });
    },
  });

  return {
    add: (agentKey) => mutation.mutateAsync(agentKey),
    isPending: mutation.isPending,
    error: mutation.error as Error | null,
    isMock: !useReal,
  };
}

export interface RemoveTeamMemberResult {
  remove: (agentKey: string) => Promise<void>;
  isPending: boolean;
  isMock: boolean;
}

export function useRemoveTeamMember(intentId: string | null): RemoveTeamMemberResult {
  const { signedIn } = useSession();
  const useReal = env.useRealData && signedIn && Boolean(intentId);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (agentKey: string): Promise<void> => {
      if (!intentId) throw new Error('intent id missing');
      if (agentKey === 'main') {
        // Don't let users remove the orchestrator — every intent needs
        // at least one default agent.
        throw new Error('Claw 是默认主理人,不能移除');
      }
      if (!useReal) throw new Error('演示模式不会保存');
      const { error } = await supabase
        .from('intent_agents')
        .delete()
        .eq('intent_id', intentId)
        .eq('agent_key', agentKey);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intent_agents'] });
    },
  });

  return {
    remove: (agentKey) => mutation.mutateAsync(agentKey),
    isPending: mutation.isPending,
    isMock: !useReal,
  };
}

/**
 * Helper for AgentPicker: given the team list, return only the
 * BUILTIN_AGENTS that are members of this intent's team. Used to
 * narrow the picker dropdown so users only see agents they invited.
 */
export function teamMemberAgents(team: IntentAgentRow[]) {
  const memberIds = new Set(team.map((t) => t.agentKey));
  return BUILTIN_AGENTS.filter((a) => memberIds.has(a.id));
}
