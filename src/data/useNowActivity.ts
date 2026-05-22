import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/db-types';

/**
 * useNowActivity — derives running/completed activity from the messages
 * table grouped by intent.
 *
 * The canonical `agent_calls` / `agent_traces` tables don't exist yet
 * (that's a Phase 6+ schema change tracked in ~/myclaw). Until they
 * land, the messages stream is the only honest source of "what's been
 * happening" — every assistant reply is an observable completion, and
 * any user message without a follow-up assistant reply within a short
 * window is plausibly mid-flight.
 *
 * Rules:
 *   - "running"   : intents whose most recent message in the last
 *                   `RUNNING_WINDOW_MS` is role='user' (assistant hasn't
 *                   replied yet — either truly in-flight, or the user
 *                   sent it while the gateway was disconnected).
 *   - "completed" : intents whose most recent message in the last
 *                   `DONE_WINDOW_MS` is role='assistant' (assistant
 *                   delivered a reply recently).
 *
 * Each bucket is capped at MAX_PER_BUCKET so the feed stays scannable.
 * Returns an empty arrays + isMock flag when not in real mode — the
 * caller renders bundled mock data in that case.
 */

const RUNNING_WINDOW_MS = 5 * 60_000;   // 5 minutes
const DONE_WINDOW_MS = 24 * 60 * 60_000; // 24 hours
const MAX_PER_BUCKET = 8;
const FETCH_LIMIT = 200; // recent messages to scan across all intents

type DbMessage = Database['public']['Tables']['messages']['Row'];

export interface NowRunningItem {
  intentId: string;
  /** The user's prompt that's still waiting on a reply. */
  preview: string;
  since: string; // ISO timestamp
}

export interface NowCompletedItem {
  intentId: string;
  /** A short snippet of the assistant's most recent reply. */
  preview: string;
  since: string; // ISO timestamp
  agentId?: string;
}

export interface NowActivityResult {
  running: NowRunningItem[];
  completed: NowCompletedItem[];
  isLoading: boolean;
  error: Error | null;
  isMock: boolean;
}

const queryKey = (real: boolean, userId: string | null) =>
  ['nowActivity', { real, userId }] as const;

function previewOf(content: DbMessage['content']): string {
  // content is jsonb — typed as Json. Narrow to our { type, text } shape.
  if (!Array.isArray(content)) return '';
  for (const part of content as Array<{ type?: string; text?: string }>) {
    if (part && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string') {
      return part.text.trim().slice(0, 120);
    }
  }
  return '';
}

export function useNowActivity(): NowActivityResult {
  const { signedIn, user, loading: sessionLoading } = useSession();
  const useReal = env.useRealData && signedIn;
  const isMock = !useReal;

  const query = useQuery({
    queryKey: queryKey(useReal, user?.id ?? null),
    queryFn: async (): Promise<{
      running: NowRunningItem[];
      completed: NowCompletedItem[];
    }> => {
      if (!useReal) return { running: [], completed: [] };

      // Pull the most recent messages across all the user's intents.
      // RLS narrows to user_id = auth.uid(), so an unfiltered SELECT
      // still only returns rows the user owns. Ordering DESC + limit
      // keeps the payload small even for chatty accounts.
      const { data, error } = await supabase
        .from('messages')
        .select('id, intent_id, role, content, created_at, agent_id')
        .order('created_at', { ascending: false })
        .limit(FETCH_LIMIT);
      if (error) throw new Error(error.message);

      // Group by intent_id, keep only the most recent message per intent
      // (rows are already DESC ordered, so the first hit wins).
      const latestByIntent = new Map<string, DbMessage>();
      for (const row of data ?? []) {
        if (!latestByIntent.has(row.intent_id)) {
          latestByIntent.set(row.intent_id, row as DbMessage);
        }
      }

      const now = Date.now();
      const running: NowRunningItem[] = [];
      const completed: NowCompletedItem[] = [];

      for (const row of latestByIntent.values()) {
        const ageMs = now - new Date(row.created_at).getTime();
        if (row.role === 'user' && ageMs <= RUNNING_WINDOW_MS) {
          running.push({
            intentId: row.intent_id,
            preview: previewOf(row.content) || '正在让助手处理',
            since: row.created_at,
          });
        } else if (row.role === 'assistant' && ageMs <= DONE_WINDOW_MS) {
          completed.push({
            intentId: row.intent_id,
            preview: previewOf(row.content) || '助手回复完了',
            since: row.created_at,
            agentId: row.agent_id ?? undefined,
          });
        }
      }

      // Most-recent first, capped.
      running.sort((a, b) => b.since.localeCompare(a.since));
      completed.sort((a, b) => b.since.localeCompare(a.since));
      return {
        running: running.slice(0, MAX_PER_BUCKET),
        completed: completed.slice(0, MAX_PER_BUCKET),
      };
    },
    enabled: !sessionLoading,
    // Activity is short-lived information; a 30s refetch keeps the feed
    // moving without manual reload. Realtime would be nicer but messages
    // already has a per-intent subscription on the chat surface, and a
    // cross-intent subscription here would double-bill the user with no
    // visible benefit — they look at /now occasionally, not constantly.
    refetchInterval: 30_000,
  });

  return {
    running: query.data?.running ?? [],
    completed: query.data?.completed ?? [],
    isLoading: query.isLoading,
    error: (query.error as Error | null) ?? null,
    isMock,
  };
}
