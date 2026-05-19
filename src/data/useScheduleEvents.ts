import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { sortedSchedule } from '@/mocks';
import type { ScheduleEvent } from '@/mocks/types';
import type { Database } from '@/lib/db-types';

/**
 * useScheduleEvents — the canonical "提醒" feed.
 *
 * Real mode: SELECT public.schedule_events for the current user, ordered
 * by fire_at. RLS narrows to user_id = auth.uid(); INSERT additionally
 * checks the referenced intent belongs to the user.
 *
 * Mock mode: returns the bundled prototype schedule. Mutations in mock
 * mode are toast-only.
 */

type DbScheduleEvent = Database['public']['Tables']['schedule_events']['Row'];

function dbRowToScheduleEvent(row: DbScheduleEvent): ScheduleEvent {
  const recurrence = row.recurrence as ScheduleEvent['recurrence'] | null;
  return {
    id: row.id,
    intentId: row.intent_id,
    title: row.title,
    fireAt: row.fire_at,
    recurrence: recurrence ?? undefined,
    status: (row.status as ScheduleEvent['status']) ?? 'pending',
  };
}

export interface ScheduleEventsResult {
  events: ScheduleEvent[];
  isLoading: boolean;
  error: Error | null;
  isMock: boolean;
}

export function useScheduleEvents(): ScheduleEventsResult {
  const { signedIn, user, loading: sessionLoading } = useSession();
  const useReal = env.useRealData && signedIn;

  const query = useQuery({
    queryKey: ['schedule_events', { real: useReal, userId: user?.id ?? null }],
    queryFn: async (): Promise<ScheduleEvent[]> => {
      if (!useReal) return sortedSchedule();
      const { data, error } = await supabase
        .from('schedule_events')
        .select('*')
        .order('fire_at', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map(dbRowToScheduleEvent);
    },
    enabled: !sessionLoading,
  });

  return {
    events: query.data ?? [],
    isLoading: query.isLoading || sessionLoading,
    error: query.error as Error | null,
    isMock: !useReal,
  };
}

export interface AddScheduleEventInput {
  intentId: string;
  title: string;
  /** ISO timestamp. */
  fireAt: string;
  recurrence?: ScheduleEvent['recurrence'];
}

export interface AddScheduleEventResult {
  add: (input: AddScheduleEventInput) => Promise<ScheduleEvent>;
  isPending: boolean;
  error: Error | null;
  isMock: boolean;
}

export function useAddScheduleEvent(): AddScheduleEventResult {
  const { signedIn, user } = useSession();
  const queryClient = useQueryClient();
  const useReal = env.useRealData && signedIn;

  const mutation = useMutation({
    mutationFn: async (input: AddScheduleEventInput): Promise<ScheduleEvent> => {
      const title = input.title.trim();
      if (!title) throw new Error('提醒不能空');
      if (!input.intentId) throw new Error('提醒得绑在一件事上');

      if (!useReal) {
        if (!signedIn) throw new Error('演示模式,提醒不会被保存。登录后再来试。');
        throw new Error('演示模式,提醒不会被保存。等真实数据接通后再来。');
      }
      if (!user?.id) throw new Error('请先登录');

      const { data, error } = await supabase
        .from('schedule_events')
        .insert({
          intent_id: input.intentId,
          user_id: user.id,
          title,
          fire_at: input.fireAt,
          recurrence: input.recurrence
            ? (input.recurrence as unknown as DbScheduleEvent['recurrence'])
            : null,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      queryClient.invalidateQueries({ queryKey: ['schedule_events'] });
      return dbRowToScheduleEvent(data);
    },
  });

  return {
    add: (input) => mutation.mutateAsync(input),
    isPending: mutation.isPending,
    error: mutation.error as Error | null,
    isMock: !useReal,
  };
}
