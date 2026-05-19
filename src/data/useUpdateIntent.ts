import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { dbRowToIntent } from './useIntents';
import type { Intent } from '@/mocks/types';
import type { Database } from '@/lib/db-types';

type IntentUpdate = Database['public']['Tables']['intents']['Update'];

/**
 * useUpdateIntent — UPDATE the editable fields on an existing intent.
 *
 * Today: title + cosmetic columns (emoji / cover / preview) + lifecycle
 * (via archived_at). RLS on intents narrows UPDATE to `user_id =
 * auth.uid()`, so this just trusts the policy.
 *
 * Mock mode: rejects with the same kind of demo-only message the rest
 * of the data layer uses, branched on signed-in vs anonymous so the
 * copy never tells a logged-in user to "log in".
 *
 * Cache invalidation: bust both the list query (`['intents']`) and the
 * single-record query (`['intent', { id, ... }]`) so the change shows up
 * everywhere immediately. Granular optimistic updates would be nice but
 * a refetch is cheap (RLS-narrowed single-row UPDATE returning ROW).
 */

export interface UpdateIntentInput {
  id: string;
  title?: string;
  emoji?: string | null;
  cover?: string | null;
  preview?: string | null;
  /** Set to true to archive (sets archived_at = now), false to unarchive. */
  archived?: boolean;
}

export interface UpdateIntentResult {
  update: (input: UpdateIntentInput) => Promise<Intent>;
  isPending: boolean;
  error: Error | null;
  isMock: boolean;
}

export function useUpdateIntent(): UpdateIntentResult {
  const { signedIn } = useSession();
  const queryClient = useQueryClient();
  const useReal = env.useRealData && signedIn;

  const mutation = useMutation({
    mutationFn: async (input: UpdateIntentInput): Promise<Intent> => {
      if (!useReal) {
        if (!signedIn) {
          throw new Error('演示模式,改的内容不会被保存。登录后再来试一次?');
        }
        throw new Error('演示模式,改的内容不会被保存。等真实数据接通后再来。');
      }

      // Build the patch object — only fields the caller explicitly set
      // get included in the UPDATE. Empty title is rejected client-side
      // so we don't store a row that breaks the list display.
      const patch: IntentUpdate = {};
      if (input.title !== undefined) {
        const trimmed = input.title.trim();
        if (!trimmed) throw new Error('名字不能空');
        patch.title = trimmed;
      }
      if (input.emoji !== undefined) patch.emoji = input.emoji;
      if (input.cover !== undefined) patch.cover = input.cover;
      if (input.preview !== undefined) patch.preview = input.preview;
      if (input.archived !== undefined) {
        patch.archived_at = input.archived ? new Date().toISOString() : null;
      }
      if (Object.keys(patch).length === 0) {
        throw new Error('没什么要改的');
      }

      const { data, error } = await supabase
        .from('intents')
        .update(patch)
        .eq('id', input.id)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return dbRowToIntent(data);
    },
    onSuccess: (_intent, variables) => {
      queryClient.invalidateQueries({ queryKey: ['intents'] });
      queryClient.invalidateQueries({
        queryKey: ['intent', { id: variables.id }],
        // Partial match — useIntent's key includes { id, real, userId }
        // so we use predicate matching to catch any of those variants.
        predicate: (q) => {
          const k = q.queryKey;
          return (
            Array.isArray(k) &&
            k[0] === 'intent' &&
            typeof k[1] === 'object' &&
            k[1] !== null &&
            (k[1] as { id?: string }).id === variables.id
          );
        },
      });
    },
  });

  return {
    update: (input) => mutation.mutateAsync(input),
    isPending: mutation.isPending,
    error: mutation.error as Error | null,
    isMock: !useReal,
  };
}
