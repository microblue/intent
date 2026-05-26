import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { messagesFor } from '@/mocks';
import type { Message, MessageContentPart } from '@/mocks/types';
import type { Database } from '@/lib/db-types';

/**
 * useMessages — the chat thread for a given intent.
 *
 * Two modes, identical return shape:
 *   Mock  : returns the bundled seed thread + any optimistic additions
 *           the caller's useSendMessage put into the cache.
 *   Real  : SELECT from public.messages WHERE intent_id = X, ordered by
 *           created_at, + Supabase Realtime subscription that fans in
 *           new INSERTs (cross-tab + cross-device sync).
 *
 * RLS narrows to user_id = auth.uid(), so the subscription filter
 * `intent_id=eq.X` is just a network-traffic optimisation; the server
 * wouldn't deliver someone else's messages anyway.
 */

type DbMessage = Database['public']['Tables']['messages']['Row'];

/**
 * Map a raw row to the Message shape the UI already speaks. Content is
 * jsonb (an array of typed parts) but the type system widens it to Json
 * — we narrow back with a runtime guard. Anything malformed falls back
 * to a single empty text part so the renderer doesn't crash.
 */
function dbRowToMessage(row: DbMessage): Message {
  const parts: MessageContentPart[] = Array.isArray(row.content)
    ? (row.content as unknown as MessageContentPart[])
    : [{ type: 'text', text: '' }];
  return {
    id: row.id,
    intentId: row.intent_id,
    role: (row.role as Message['role']) ?? 'user',
    content: parts,
    createdAt: row.created_at,
    agentId: row.agent_id ?? undefined,
  };
}

export interface MessagesResult {
  messages: Message[];
  isLoading: boolean;
  error: Error | null;
  isMock: boolean;
}

export const messagesQueryKey = (
  intentId: string,
  real: boolean,
  userId: string | null,
) => ['messages', { intentId, real, userId }] as const;

export function useMessages(intentId: string): MessagesResult {
  const { signedIn, user, loading: sessionLoading } = useSession();
  const useReal = env.useRealData && signedIn;
  const queryClient = useQueryClient();
  const queryKey = messagesQueryKey(intentId, useReal, user?.id ?? null);

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<Message[]> => {
      if (!useReal) return messagesFor(intentId);
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('intent_id', intentId)
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map(dbRowToMessage);
    },
    enabled: !sessionLoading && intentId.length > 0,
  });

  // Realtime: subscribe to INSERTs for this intent and merge into the
  // cache. Dedupe by id — the user's own INSERT lands here too (after
  // useSendMessage has already optimistically appended), so a naive
  // append would duplicate.
  useEffect(() => {
    if (!useReal || !intentId) return;
    // Per-effect-run UUID in the topic so React 19 strict-mode's
    // mount → cleanup → mount can't hand the same cached channel to
    // the second mount before removeChannel's round-trip completes
    // (see useApprovals.ts for full context).
    const channel = supabase
      .channel(`messages:${intentId}:${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `intent_id=eq.${intentId}`,
        },
        (payload) => {
          const row = payload.new as DbMessage;
          const msg = dbRowToMessage(row);
          queryClient.setQueryData<Message[]>(queryKey, (old = []) => {
            if (old.some((m) => m.id === msg.id)) return old;
            return [...old, msg];
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // queryKey is stable wrt the inputs we serialize manually; depending
    // on the array reference would resubscribe each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useReal, intentId, queryClient, user?.id]);

  // Note: assistant messages from the live agent flow through
  // useGatewayChat, which writes them into THIS query's cache via
  // upsertLocalAssistantMessage. We intentionally don't invalidate
  // here on `chat` events — that would round-trip to Supabase
  // (which doesn't have the message yet) and clobber the cache.

  return {
    messages: query.data ?? [],
    isLoading: query.isLoading || sessionLoading,
    error: query.error as Error | null,
    isMock: !useReal,
  };
}

export interface SendMessageResult {
  send: (text: string, attachments?: MessageContentPart[]) => Promise<Message>;
  isPending: boolean;
  error: Error | null;
  isMock: boolean;
}

export function useSendMessage(intentId: string): SendMessageResult {
  const { signedIn, user } = useSession();
  const useReal = env.useRealData && signedIn;
  const queryClient = useQueryClient();
  const queryKey = messagesQueryKey(intentId, useReal, user?.id ?? null);

  const mutation = useMutation({
    mutationFn: async (input: { text: string; attachments?: MessageContentPart[] }): Promise<Message> => {
      const trimmed = input.text.trim();
      const attachments = input.attachments ?? [];
      if (!trimmed && attachments.length === 0) throw new Error('说点什么或加个附件吧');

      // Compose the content array: text first (if any), then attachments.
      const content: MessageContentPart[] = [];
      if (trimmed) content.push({ type: 'text', text: trimmed });
      for (const a of attachments) content.push(a);

      // Mock mode: synthesize a Message and shove it into the cache so
      // useMessages picks it up. No persistence — refresh wipes it.
      if (!useReal) {
        const msg: Message = {
          id: `m-user-${Date.now()}`,
          intentId,
          role: 'user',
          content,
          createdAt: new Date().toISOString(),
        };
        queryClient.setQueryData<Message[]>(queryKey, (old = []) => [...old, msg]);
        return msg;
      }
      if (!user?.id) throw new Error('请先登录');

      const { data, error } = await supabase
        .from('messages')
        .insert({
          intent_id: intentId,
          user_id: user.id,
          role: 'user',
          // Content stays jsonb-shaped from day one — multi-modal parts
          // are forward-compatible (the column accepts whatever shape).
          content: content as unknown as DbMessage['content'],
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      const msg = dbRowToMessage(data);
      // Append optimistically. Realtime will also fire for our own
      // INSERT, but the dedupe-by-id in useMessages handles it.
      queryClient.setQueryData<Message[]>(queryKey, (old = []) => {
        if (old.some((m) => m.id === msg.id)) return old;
        return [...old, msg];
      });
      // The myclaw-side sync_intent_last_message trigger updates
      // intents.last_message_preview + last_message_at on INSERT, so
      // the cached intent row + the list need to refetch — otherwise
      // the chat header keeps showing the cold-start "还没开始聊"
      // preview until something else triggers a refetch.
      queryClient.invalidateQueries({
        predicate: (q) => {
          const k = q.queryKey;
          if (!Array.isArray(k)) return false;
          if (k[0] === 'intents') return true;
          if (
            k[0] === 'intent' &&
            typeof k[1] === 'object' &&
            k[1] !== null &&
            (k[1] as { id?: string }).id === intentId
          )
            return true;
          return false;
        },
      });
      return msg;
    },
  });

  return {
    send: (text, attachments) => mutation.mutateAsync({ text, attachments }),
    isPending: mutation.isPending,
    error: mutation.error as Error | null,
    isMock: !useReal,
  };
}

/**
 * Append a synthesized assistant message into the cache. Used by the
 * mock-mode auto-reply in useChatThread so the demo experience stays
 * interactive — in real mode this never fires because the assistant
 * side is driven by the server (Phase 11+ agent wiring).
 */
export function appendLocalAssistantMessage(
  queryClient: ReturnType<typeof useQueryClient>,
  intentId: string,
  text: string,
  useReal: boolean,
  userId: string | null,
) {
  const key = messagesQueryKey(intentId, useReal, userId);
  const msg: Message = {
    id: `m-asst-${Date.now()}`,
    intentId,
    role: 'assistant',
    content: [{ type: 'text', text }],
    createdAt: new Date().toISOString(),
  };
  queryClient.setQueryData<Message[]>(key, (old = []) => [...old, msg]);
}

/**
 * Upsert a streaming assistant message keyed by msgId. Used by the
 * gateway-chat bridge to update the same message in place as `chat`
 * delta events arrive — the user sees the agent typing instead of a
 * long pause followed by a complete reply.
 */
export function upsertLocalAssistantMessage(
  queryClient: ReturnType<typeof useQueryClient>,
  intentId: string,
  msgId: string,
  text: string,
  useReal: boolean,
  userId: string | null,
  agentId?: string,
) {
  const key = messagesQueryKey(intentId, useReal, userId);
  queryClient.setQueryData<Message[]>(key, (old = []) => {
    const existingIdx = old.findIndex((m) => m.id === msgId);
    if (existingIdx >= 0) {
      // Update in place — keep createdAt stable so message ordering
      // doesn't jump around mid-stream.
      const next = old.slice();
      next[existingIdx] = {
        ...next[existingIdx],
        content: [{ type: 'text', text }],
        agentId: agentId ?? next[existingIdx].agentId,
      };
      return next;
    }
    return [
      ...old,
      {
        id: msgId,
        intentId,
        role: 'assistant',
        content: [{ type: 'text', text }],
        createdAt: new Date().toISOString(),
        agentId,
      },
    ];
  });
}
