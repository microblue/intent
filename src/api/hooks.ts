import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Profile, ThingDetail, UserInput } from '@shared/types';
import { api, ensureSessionReady } from './client';

/**
 * The server pushes change events (SSE). Polling is only a fallback while
 * something is busy: every second without a live connection, every 5 s with one.
 */
let live = false;
const pollBusy = () => (live ? 5000 : 1000);

/** Subscribe to the server's change events; refresh exactly what changed. */
export function useLiveUpdates() {
  const qc = useQueryClient();
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    let es: EventSource | undefined;
    let closed = false;
    void ensureSessionReady().then(() => {
      if (closed) return;
      es = new EventSource('/api/events');
      es.onopen = () => { live = true; };
      es.onerror = () => { live = false; };
      es.onmessage = (m) => {
        const e = JSON.parse(m.data) as { type: string; id?: string };
        if (e.type === 'thing') {
          void qc.invalidateQueries({ queryKey: ['things'] });
          if (e.id) void qc.invalidateQueries({ queryKey: ['thing', e.id] });
        } else if (e.type === 'memories') void qc.invalidateQueries({ queryKey: ['memories'] });
        else if (e.type === 'profile') void qc.invalidateQueries({ queryKey: ['profile'] });
      };
    });
    return () => { closed = true; live = false; es?.close(); };
  }, [qc]);
}

export function useAccount() {
  return useQuery({ queryKey: ['account'], queryFn: api.account, staleTime: 60_000 });
}

export function useThings() {
  return useQuery({
    queryKey: ['things'],
    queryFn: api.things,
    refetchInterval: (q) => (q.state.data?.some((t) => t.busy) ? pollBusy() : false),
  });
}

export function useThing(id: string) {
  return useQuery({
    queryKey: ['thing', id],
    queryFn: () => api.thing(id),
    refetchInterval: (q) => (q.state.data?.thing.busy ? pollBusy() : false),
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
