import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { useGateway, useGatewayEvent } from '@/gateway/useGateway';
import {
  messagesQueryKey,
  upsertLocalAssistantMessage,
} from '@/data/useMessages';
import type { Message } from '@/mocks/types';
import type { Database } from '@/lib/db-types';

type DbMessageInsert = Database['public']['Tables']['messages']['Insert'];

/**
 * useGatewayChat — bridge between an aios Intent and an OpenClaw chat
 * session.
 *
 * Per ~/myclaw-studio/docs/aios-plan.md §"数据边界", agent-driven chat
 * messages should live on the claw, not in central Supabase. This hook
 * is the wire that makes that real: it owns the session lifecycle
 * (lazy `sessions.create` with a deterministic key tied to the intent
 * id), exposes a `sendViaGateway(text)` that calls `sessions.send`,
 * and subscribes to the `chat` event stream to surface assistant
 * replies into the React-Query message cache.
 *
 * Mock mode / disconnected gateway: returns `connected=false` and
 * `sendViaGateway` becomes a no-op. Callers must keep a fallback path
 * (Supabase persistence + mock reply) for those states — this hook
 * doesn't replace useSendMessage; it augments it when the gateway is
 * live.
 *
 * Session key: `agent:main:aios:<intentId>`. OpenClaw's
 * `parseAgentSessionKey` accepts this shape. Same intent across
 * reloads ⇒ same key ⇒ same conversation history on the claw side.
 */

const DEFAULT_AGENT_ID = 'main';

function sessionKeyFor(intentId: string, agentId: string): string {
  return `agent:${agentId}:aios:${intentId}`;
}

interface GatewayChatResult {
  /** True only when the gateway WS is open AND in real-mode. */
  connected: boolean;
  /**
   * Fire the user's text at the agent. Resolves once the send is
   * acknowledged (NOT when the reply arrives — listen to messages
   * via useMessages for that). Throws if the gateway is offline.
   */
  sendViaGateway: (text: string) => Promise<void>;
}

export function useGatewayChat(
  intentId: string,
  agentId: string = DEFAULT_AGENT_ID,
): GatewayChatResult {
  const { status, send: gatewaySend } = useGateway();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const userIdRef = useRef(user?.id ?? null);
  userIdRef.current = user?.id ?? null;

  const connected = status === 'connected';
  const key = sessionKeyFor(intentId, agentId);

  // Lazy session creation. We don't block on this — if the session
  // already exists OpenClaw returns ok (the call is idempotent for
  // explicit keys), and if it didn't, sessions.send below will surface
  // the error. We only attempt once per (intentId, agentId, connected)
  // so we don't thrash on every render.
  const createdRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!connected) return;
    if (createdRef.current.has(key)) return;
    createdRef.current.add(key);
    gatewaySend('sessions.create', { agentId, key }).catch(() => {
      // Swallow — sessions.send below will reveal the real reason if
      // the create attempt actually failed (vs. session-already-exists,
      // which is the expected case after the first turn).
      createdRef.current.delete(key);
    });
  }, [connected, key, agentId, gatewaySend]);

  // Listen for chat events on this session and stream them into the
  // message cache.
  //
  // OpenClaw emits the same `chat` frame for both intermediate deltas
  // (`state: 'delta'`) and the final turn (`state: 'final'`). Each
  // frame carries the FULL accumulated message content — not just the
  // new token — so we upsert by a stable per-run id and let the
  // message render its current text. The user sees the agent typing
  // instead of one long pause.
  // Track which run IDs we've already persisted on `final` so a
  // delayed/duplicated final event doesn't double-insert.
  const persistedFinalsRef = useRef<Set<string>>(new Set());

  useGatewayEvent('chat', (event) => {
    const payload = event.payload as
      | {
          sessionKey?: string;
          state?: string;
          runId?: string;
          message?: {
            role?: string;
            content?: { type: string; text?: string }[];
          };
        }
      | null;
    if (!payload) return;
    if (payload.sessionKey !== key) return;
    if (payload.state !== 'delta' && payload.state !== 'final') return;
    if (payload.message?.role !== 'assistant') return;
    const text = payload.message.content
      ?.filter((part) => part?.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('') ?? '';
    if (!text) return;
    // Stable per-run id keeps every delta updating the same DOM node;
    // when the agent runs again it'll have a new runId and produce a
    // fresh message. Fall back to a session-scoped id if the gateway
    // omits runId for some reason (defensive).
    const msgId = payload.runId
      ? `stream-${payload.runId}`
      : `stream-${key}-${Date.now()}`;
    upsertLocalAssistantMessage(
      queryClient,
      intentId,
      msgId,
      text,
      true,
      userIdRef.current,
      agentId,
    );

    // On `final`, also persist the assistant message to Supabase so
    // it survives reloads and reaches other devices via Realtime.
    // RLS allows the user to INSERT messages tied to their own
    // user_id; role='assistant' is just a tag. We do this only once
    // per runId to avoid duplicates if the server replays.
    if (
      payload.state === 'final' &&
      env.useRealData &&
      userIdRef.current &&
      payload.runId &&
      !persistedFinalsRef.current.has(payload.runId)
    ) {
      persistedFinalsRef.current.add(payload.runId);
      const insertRow: DbMessageInsert = {
        intent_id: intentId,
        user_id: userIdRef.current,
        role: 'assistant',
        agent_id: agentId,
        content: [{ type: 'text', text }] as unknown as DbMessageInsert['content'],
      };
      void supabase
        .from('messages')
        .insert(insertRow)
        .select('*')
        .single()
        .then(({ data, error }) => {
          if (error || !data) {
            console.warn('[gateway-chat] persist final assistant failed', error?.message);
            persistedFinalsRef.current.delete(payload.runId!);
            return;
          }
          // Swap the streaming-id message for the persisted row so
          // that when Supabase Realtime fans this INSERT back, the
          // dedupe-by-id in useMessages doesn't create a duplicate.
          const qKey = messagesQueryKey(intentId, true, userIdRef.current);
          queryClient.setQueryData<Message[]>(qKey, (old = []) => {
            const idx = old.findIndex((m) => m.id === msgId);
            if (idx < 0) return old;
            const next = old.slice();
            next[idx] = {
              ...next[idx],
              id: data.id,
              createdAt: data.created_at ?? next[idx].createdAt,
            };
            return next;
          });
        });
    }
  });

  const sendViaGateway = useCallback(
    async (text: string): Promise<void> => {
      if (!connected) {
        throw new Error('gateway is not connected');
      }
      const trimmed = text.trim();
      if (!trimmed) return;
      // Make sure the session exists before sending. If create above
      // raced and lost (cleared from createdRef), retry it inline.
      if (!createdRef.current.has(key)) {
        createdRef.current.add(key);
        await gatewaySend('sessions.create', { agentId, key }).catch(
          () => {
            createdRef.current.delete(key);
          },
        );
      }
      await gatewaySend('sessions.send', {
        key,
        message: trimmed,
        idempotencyKey: `aios-${intentId}-${Date.now()}`,
      });
    },
    [connected, key, gatewaySend, intentId],
  );

  return { connected, sendViaGateway };
}
