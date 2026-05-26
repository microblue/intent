import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { memoryFacts as mockMemoryFacts } from '@/mocks';
import type { MemoryFact } from '@/mocks/types';
import type { Database } from '@/lib/db-types';

/**
 * useMemoryFacts — cross-Intent user-level memory ("助手记得的事").
 *
 * Real mode reads from public.memory_facts, RLS-narrowed to the calling
 * user. Mock mode returns the bundled prototype facts. Categories are
 * fixed in the schema CHECK constraint; aios groups by them client-side.
 *
 * Phase 7 reflection cards (the "复盘" flow) still write to Zustand for
 * now — those are local-only "lessons learned" cards. A future phase
 * can promote them into real memory_facts rows via useAddMemoryFact.
 */

type DbMemoryFact = Database['public']['Tables']['memory_facts']['Row'];

function dbRowToMemoryFact(row: DbMemoryFact): MemoryFact {
  return {
    id: row.id,
    category: row.category as MemoryFact['category'],
    text: row.text,
    originIntentId: row.origin_intent_id ?? undefined,
    createdAt: row.created_at,
  };
}

export interface MemoryFactsResult {
  facts: MemoryFact[];
  /** Same data grouped by category for the page layout. */
  byCategory: Record<MemoryFact['category'], MemoryFact[]>;
  isLoading: boolean;
  error: Error | null;
  isMock: boolean;
}

function groupByCategory(
  rows: MemoryFact[],
): Record<MemoryFact['category'], MemoryFact[]> {
  const buckets: Record<MemoryFact['category'], MemoryFact[]> = {
    'about-you': [],
    preferences: [],
    people: [],
    project: [],
  };
  for (const f of rows) buckets[f.category].push(f);
  return buckets;
}

export function useMemoryFacts(): MemoryFactsResult {
  const { signedIn, user, loading: sessionLoading } = useSession();
  const useReal = env.useRealData && signedIn;

  const query = useQuery({
    queryKey: ['memory_facts', { real: useReal, userId: user?.id ?? null }],
    queryFn: async (): Promise<MemoryFact[]> => {
      if (!useReal) return mockMemoryFacts;
      const { data, error } = await supabase
        .from('memory_facts')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map(dbRowToMemoryFact);
    },
    enabled: !sessionLoading,
  });

  const facts = query.data ?? [];
  return {
    facts,
    byCategory: groupByCategory(facts),
    isLoading: query.isLoading || sessionLoading,
    error: query.error as Error | null,
    isMock: !useReal,
  };
}

export interface AddMemoryFactInput {
  text: string;
  category: MemoryFact['category'];
  /** Optional pointer to the intent the fact came out of. */
  originIntentId?: string | null;
}

export interface AddMemoryFactResult {
  add: (input: AddMemoryFactInput) => Promise<MemoryFact>;
  isPending: boolean;
  error: Error | null;
  isMock: boolean;
}

/**
 * Add a memory fact directly — used by the Memory page composer for
 * manual entries lay users want the assistant to remember (vegan,
 * works from home Tue/Thu, etc.). Agents that auto-write memory go
 * through a different (claw-side) path; this hook is the SPA-side
 * write surface only.
 */
export function useAddMemoryFact(): AddMemoryFactResult {
  const { signedIn, user } = useSession();
  const queryClient = useQueryClient();
  const useReal = env.useRealData && signedIn;

  const mutation = useMutation({
    mutationFn: async (input: AddMemoryFactInput): Promise<MemoryFact> => {
      const text = input.text.trim();
      if (!text) throw new Error('写一条让我记下来');
      if (!useReal) {
        if (!signedIn) {
          throw new Error('演示模式,记下的事不会被保存。登录后再来试一次?');
        }
        throw new Error('演示模式,记下的事不会被保存。等真实数据接通后再来。');
      }
      if (!user?.id) throw new Error('请先登录');

      const { data, error } = await supabase
        .from('memory_facts')
        .insert({
          user_id: user.id,
          text,
          category: input.category,
          origin_intent_id: input.originIntentId ?? null,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return dbRowToMemoryFact(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memory_facts'] });
    },
  });

  return {
    add: (input) => mutation.mutateAsync(input),
    isPending: mutation.isPending,
    error: mutation.error as Error | null,
    isMock: !useReal,
  };
}

export interface AutoAddMemoryFactInput extends AddMemoryFactInput {}

export interface AutoAddMemoryFactResult {
  /**
   * Insert a fact extracted from chat — silent in mock mode (returns
   * `null` instead of throwing) so the chat send never aborts because
   * the user is in the demo. Real mode inserts the row and refreshes
   * the cache. Used by the L1 memory auto-record pipeline in
   * `useChatThread`.
   */
  autoAdd: (input: AutoAddMemoryFactInput) => Promise<MemoryFact | null>;
  isMock: boolean;
}

export function useAutoAddMemoryFact(): AutoAddMemoryFactResult {
  const { signedIn, user } = useSession();
  const queryClient = useQueryClient();
  const useReal = env.useRealData && signedIn;

  const autoAdd = async (
    input: AutoAddMemoryFactInput,
  ): Promise<MemoryFact | null> => {
    const text = input.text.trim();
    if (!text) return null;
    if (!useReal) return null;
    if (!user?.id) return null;

    const { data, error } = await supabase
      .from('memory_facts')
      .insert({
        user_id: user.id,
        text,
        category: input.category,
        origin_intent_id: input.originIntentId ?? null,
      })
      .select('*')
      .single();
    if (error) {
      // Don't surface to the user — the chat send already succeeded;
      // a failed auto-save is a "we missed remembering this" not a
      // "your message didn't go through" event.
      // eslint-disable-next-line no-console
      console.warn('[memory-auto-add] insert failed', error.message);
      return null;
    }
    queryClient.invalidateQueries({ queryKey: ['memory_facts'] });
    return dbRowToMemoryFact(data);
  };

  return { autoAdd, isMock: !useReal };
}

export interface RemoveMemoryFactResult {
  remove: (id: string) => Promise<void>;
  isPending: boolean;
  error: Error | null;
  isMock: boolean;
}

/** Forget a memory fact — soft delete by DELETE-ing the row entirely. */
export function useRemoveMemoryFact(): RemoveMemoryFactResult {
  const { signedIn } = useSession();
  const queryClient = useQueryClient();
  const useReal = env.useRealData && signedIn;

  const mutation = useMutation({
    mutationFn: async (id: string) => {
      if (!useReal) {
        if (!signedIn) throw new Error('演示模式,改的内容不会被保存。登录后再来试。');
        throw new Error('演示模式,改的内容不会被保存。等真实数据接通后再来。');
      }
      const { error } = await supabase
        .from('memory_facts')
        .delete()
        .eq('id', id);
      if (error) throw new Error(error.message);
      queryClient.invalidateQueries({ queryKey: ['memory_facts'] });
    },
  });

  return {
    remove: (id) => mutation.mutateAsync(id),
    isPending: mutation.isPending,
    error: mutation.error as Error | null,
    isMock: !useReal,
  };
}
