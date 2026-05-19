import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/db-types';

/**
 * useUserPreferences — per-user cosmetic + locale settings.
 *
 * Schema lives in myclaw (`user_preferences` table, RLS-scoped to
 * `user_id = auth.uid()`). The row is NOT auto-created on signup; aios
 * upserts lazily the first time the user changes a preference.
 *
 * Mock mode: returns a static demo preferences object and the upsert is
 * a toast-only no-op (the caller can still pretend it worked).
 */

export type UserPreferences =
  Database['public']['Tables']['user_preferences']['Row'];

export type UserPreferencesUpdate = Partial<
  Omit<UserPreferences, 'user_id' | 'created_at' | 'updated_at'>
>;

const MOCK_PREFERENCES: UserPreferences = {
  user_id: '00000000-0000-0000-0000-000000000000',
  display_name: null,
  default_emoji: '✨',
  default_cover: null,
  preferred_lang: 'zh-CN',
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
};

export interface UserPreferencesResult {
  prefs: UserPreferences | null;
  isLoading: boolean;
  isMock: boolean;
  error: Error | null;
  /** Lazy upsert — pass only the fields you want to change. */
  upsert: (patch: UserPreferencesUpdate) => Promise<void>;
  isSaving: boolean;
}

export function useUserPreferences(): UserPreferencesResult {
  const { signedIn, user, loading: sessionLoading } = useSession();
  const useReal = env.useRealData && signedIn;
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['user_preferences', { real: useReal, userId: user?.id ?? null }],
    queryFn: async (): Promise<UserPreferences | null> => {
      if (!useReal) return MOCK_PREFERENCES;
      const { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !sessionLoading,
  });

  const upsertMutation = useMutation({
    mutationFn: async (patch: UserPreferencesUpdate) => {
      if (!useReal) {
        // Mock mode: pretend it succeeded so UI can optimistically advance.
        // Caller can decide whether to toast.
        return;
      }
      if (!user?.id) throw new Error('未登录,无法保存设置');
      const { error } = await supabase
        .from('user_preferences')
        .upsert({ user_id: user.id, ...patch }, { onConflict: 'user_id' });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user_preferences'] });
    },
  });

  return {
    prefs: query.data ?? null,
    isLoading: query.isLoading || sessionLoading,
    isMock: !useReal,
    error: query.error as Error | null,
    upsert: (patch) => upsertMutation.mutateAsync(patch),
    isSaving: upsertMutation.isPending,
  };
}
