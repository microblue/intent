import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { sortedIntents } from '@/mocks';
import type { Intent } from '@/mocks/types';
import type { Database } from '@/lib/db-types';

/**
 * useIntents — the canonical "list of things the user is working on".
 *
 * Two modes, flipped by `VITE_USE_REAL_DATA` + session state:
 *   - Mock mode  : returns the bundled prototype intents instantly. Always
 *                  the source for signed-out viewers (demo experience).
 *   - Real mode  : `select` from `intents` where RLS narrows to the
 *                  current user's rows. Empty result → empty state, not
 *                  an error.
 *
 * Same return shape in both modes so consumers don't have to branch.
 *
 * Why TanStack Query for both: it gives us identical loading semantics,
 * background refetch, retry, and cache invalidation regardless of source.
 * Components that already render against `intents` just keep working.
 *
 * RLS dependency: the real-mode query trusts that the `intents` table's
 * row-level security policies restrict each request to the calling user.
 * Until that lands (canonical Phase 3 in ~/myclaw), `VITE_USE_REAL_DATA`
 * stays off in production; the flag is opt-in for dev.
 */

type DbIntent = Database['public']['Tables']['intents']['Row'];

// Tailwind-flavored gradient palette. We derive a deterministic gradient
// per row id so the same intent always shows the same cover — without
// adding a column to the `intents` table.
const COVER_PALETTE = [
  'linear-gradient(135deg, oklch(86% 0.12 30) 0%, oklch(78% 0.16 12) 100%)',
  'linear-gradient(135deg, oklch(88% 0.10 110) 0%, oklch(78% 0.14 145) 100%)',
  'linear-gradient(135deg, oklch(85% 0.13 220) 0%, oklch(76% 0.16 250) 100%)',
  'linear-gradient(135deg, oklch(88% 0.10 295) 0%, oklch(80% 0.14 320) 100%)',
  'linear-gradient(135deg, oklch(90% 0.10 85) 0%, oklch(82% 0.13 60) 100%)',
  'linear-gradient(135deg, oklch(86% 0.12 195) 0%, oklch(78% 0.15 175) 100%)',
];

function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return Math.abs(h);
}

function dbRowToIntent(row: DbIntent): Intent {
  return {
    id: row.id,
    title: row.title,
    preview: row.last_message_preview ?? '还没开始聊',
    lastActiveAt: row.last_message_at ?? row.updated_at,
    lifecycle: row.archived_at ? 'archived' : 'active',
    trigger: 'manual',
    // Defaults — UI-layer attributes that aren't in the row yet. When we
    // add an `intent_cosmetics` column / table these come from there.
    emoji: '✨',
    cover: COVER_PALETTE[hashString(row.id) % COVER_PALETTE.length]!,
  };
}

export interface IntentsResult {
  intents: Intent[];
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  /** True when the data came from mocks, not Supabase. */
  isMock: boolean;
  /** Manually re-fetch. */
  refetch: () => void;
}

export function useIntents(): IntentsResult {
  const { signedIn, user, loading: sessionLoading } = useSession();
  const useReal = env.useRealData && signedIn;

  const query = useQuery({
    // Include the mode + userId in the key so flipping the flag or
    // signing in/out triggers a fresh fetch instead of serving stale.
    queryKey: ['intents', { real: useReal, userId: user?.id ?? null }],
    queryFn: async (): Promise<Intent[]> => {
      if (!useReal) return sortedIntents();
      const { data, error } = await supabase
        .from('intents')
        .select('*')
        .is('archived_at', null)
        .order('last_message_at', { ascending: false, nullsFirst: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map(dbRowToIntent);
    },
    // While the session is still resolving, don't fire a real query that
    // would fail because the auth header hasn't been attached yet.
    enabled: !sessionLoading,
  });

  return {
    intents: query.data ?? [],
    isLoading: query.isLoading || sessionLoading,
    isFetching: query.isFetching,
    error: query.error as Error | null,
    isMock: !useReal,
    refetch: () => query.refetch(),
  };
}
