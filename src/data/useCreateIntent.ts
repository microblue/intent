import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { dbRowToIntent } from './useIntents';
import { useClaws } from './useClaws';
import type { Intent } from '@/mocks/types';

/**
 * useCreateIntent — INSERTs a new intent for the signed-in user.
 *
 * RLS on `intents` enforces `user_id = auth.uid()` on both SELECT and
 * INSERT, so we hand it auth.uid() explicitly and let Postgres reject
 * mismatches. claw_id comes from useClaws()'s default (oldest claw); if
 * the user has none we surface a friendly error and let the route gate
 * push them to the install flow.
 *
 * Mock mode: rejects with a "演示模式不会保存" message. The /new wizard
 * surfaces this as a toast and keeps the user where they are. We don't
 * fake-persist into the mocks because the rest of the prototype reads
 * mocks synchronously and a fake insert wouldn't survive a reload, which
 * would be more confusing than a clear "not persisted" message.
 */

export interface CreateIntentInput {
  title: string;
  emoji?: string | null;
  cover?: string | null;
  preview?: string | null;
}

export interface CreateIntentResult {
  create: (input: CreateIntentInput) => Promise<Intent>;
  isPending: boolean;
  error: Error | null;
  isMock: boolean;
}

export function useCreateIntent(): CreateIntentResult {
  const { signedIn, user } = useSession();
  const { defaultClaw } = useClaws();
  const queryClient = useQueryClient();
  const useReal = env.useRealData && signedIn;

  const mutation = useMutation({
    mutationFn: async (input: CreateIntentInput): Promise<Intent> => {
      const title = input.title.trim();
      if (!title) throw new Error('给它起个名字吧');

      if (!useReal) {
        throw new Error(
          '现在是演示模式,新建的事不会被保存。登录后再来试一次?',
        );
      }
      if (!user?.id) throw new Error('请先登录');
      if (!defaultClaw) {
        throw new Error('还没有给你分配实例,正在带你去安装');
      }

      // Generate the id client-side. crypto.randomUUID() is in every
      // browser we care about (and our preview build target is Node 20+).
      const id = crypto.randomUUID();
      const { data, error } = await supabase
        .from('intents')
        .insert({
          id,
          user_id: user.id,
          claw_id: defaultClaw.id,
          title,
          emoji: input.emoji ?? null,
          cover: input.cover ?? null,
          preview: input.preview ?? null,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return dbRowToIntent(data);
    },
    onSuccess: () => {
      // Refresh the list so the new card shows up immediately. Granular
      // optimistic updates aren't worth the complexity for now — a refetch
      // is fast (single query, RLS-narrowed).
      queryClient.invalidateQueries({ queryKey: ['intents'] });
    },
  });

  return {
    create: (input) => mutation.mutateAsync(input),
    isPending: mutation.isPending,
    error: mutation.error as Error | null,
    isMock: !useReal,
  };
}
