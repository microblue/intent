import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Profile, ThingDetail, UserInput } from '@shared/types';
import { api } from './client';

/** While Intent is working on something, poll every second; otherwise stay quiet. */
const POLL_BUSY_MS = 1000;

export function useThings() {
  return useQuery({
    queryKey: ['things'],
    queryFn: api.things,
    refetchInterval: (q) => (q.state.data?.some((t) => t.busy) ? POLL_BUSY_MS : false),
  });
}

export function useThing(id: string) {
  return useQuery({
    queryKey: ['thing', id],
    queryFn: () => api.thing(id),
    refetchInterval: (q) => (q.state.data?.thing.busy ? POLL_BUSY_MS : false),
    retry: (n, err) => (err as { status?: number }).status !== 404 && n < 2,
  });
}

export function useProfile() {
  return useQuery({ queryKey: ['profile'], queryFn: api.profile, staleTime: 60_000 });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Omit<Profile, 'userId'>>) => api.updateProfile(patch),
    onSuccess: (p) => qc.setQueryData(['profile'], p),
  });
}

export function useCreateThing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => api.createThing(text),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['things'] }),
  });
}

export function useSendInput(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UserInput) => api.input(id, input),
    onSuccess: (detail: ThingDetail) => {
      qc.setQueryData(['thing', id], detail);
      qc.invalidateQueries({ queryKey: ['things'] });
    },
  });
}

export function useArchive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) => api.archive(id, archived),
    onSuccess: (_t, { id }) => {
      qc.invalidateQueries({ queryKey: ['things'] });
      qc.invalidateQueries({ queryKey: ['thing', id] });
    },
  });
}

export function useMemories() {
  return useQuery({ queryKey: ['memories'], queryFn: api.memories });
}

export function useForget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.forget(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memories'] }),
  });
}
