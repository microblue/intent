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
