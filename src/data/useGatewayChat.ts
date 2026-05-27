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
import { findBuiltinAgent } from '@/lib/agents';
import type { Message } from '@/mocks/types';
import type { Database } from '@/lib/db-types';

type DbMessageInsert = Database['public']['Tables']['messages']['Insert'];

/**
 * useGatewayChat — bridge between an aios Intent and an OpenClaw chat
 * session.
 *
 * Architecture: ONE session per intent, always owned by the 'main'
 * orchestrator agent. Specialist agents (陪练, 规划员, …) are invoked
 * internally by the orchestrator via sessions_spawn — the SPA never
 * creates their sessions directly. This keeps full conversation
 * context in one place; the orchestrator always knows what has been
 * discussed, and switching specialists doesn't cause amnesia.
 *
 * When the user "picks" a specialist via AgentPicker, that preference
 * is passed as `preferAgentId` in sendViaGateway — the hook turns it
 * into a delegation hint prepended to the message. The orchestrator
 * reads the hint and routes accordingly.
 *
 * Attribution: OpenClaw emits `agentKey` on each chat frame when a
 * sub-agent produced the reply; the SPA uses this for per-message
 * bylines (e.g. "📚 陪练") without needing separate sessions.
 *
 * Session key: `agent:main:aios:<intentId>`. Same intent across
 * reloads ⇒ same key ⇒ same conversation history on the claw side.
 */

const DEFAULT_AGENT_ID = 'main';

// Session key is always main — the orchestrator owns the session and
// routes to specialists internally via sessions_spawn.
function sessionKeyFor(intentId: string): string {
  return `agent:main:aios:${intentId}`;
}

/**
 * Build a delegation hint for the orchestrator when the user has
 * explicitly selected a specialist. The hint is prepended to the
 * message text so the orchestrator knows which sub-agent to invoke.
 * It is bracket-wrapped so the orchestrator treats it as metadata,
 * not part of the user's natural utterance.
 */
function buildDelegationHint(agentId: string): string {
  const agent = findBuiltinAgent(agentId);
  if (!agent) return '';
  return `[委托：请让${agent.emoji}${agent.name}(agentId:${agentId})来处理以下问题]\n\n`;
}

interface GatewayChatResult {
  /** True only when the gateway WS is open AND in real-mode. */
  connected: boolean;
  /**
   * Fire the user's text at the agent. Resolves once the send is
   * acknowledged (NOT when the reply arrives — listen to messages
   * via useMessages for that). Throws if the gateway is offline.
   *
   * `opts.contextPrefix` is prepended to the message before it
   * leaves the SPA. The persisted user message (via useSendMessage)
   * stays clean — only the gateway sees the prefix. Used by L1
   * cross-intent memory recall: the chat thread injects the user's
   * memory_facts so the agent can weave them in.
   *
   * `opts.preferAgentId` — if set and not 'main', a delegation hint
   * is prepended so the orchestrator routes to the named specialist.
   * The hint is invisible to the user (stays off the persisted message).
   */
  sendViaGateway: (
    text: string,
    opts?: { contextPrefix?: string; preferAgentId?: string },
  ) => Promise<void>;
}

export function useGatewayChat(intentId: string): GatewayChatResult {
  const { status, send: gatewaySend } = useGateway();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const userIdRef = useRef(user?.id ?? null);
  userIdRef.current = user?.id ?? null;

  const connected = status === 'connected';
  const key = sessionKeyFor(intentId);

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
    gatewaySend('sessions.create', { agentId: DEFAULT_AGENT_ID, key }).catch(() => {
      // Swallow — sessions.send below will reveal the real reason if
      // the create attempt actually failed (vs. session-already-exists,
      // which is the expected case after the first turn).
      createdRef.current.delete(key);
    });
  }, [connected, key, gatewaySend]);

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
          // Optional per-turn attribution. The session is always owned
          // by 'main', but a chat frame may carry the key of a subagent
          // that actually produced the reply (e.g. 'planner' after main
          // delegated via sessions_spawn). OpenClaw emits this at the
          // top level or nested under `message`; accept both.
          agentKey?: string;
          message?: {
            role?: string;
            agentKey?: string;
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
    // Prefer per-turn attribution from the gateway payload so the
    // specialist (e.g. 🗺️ 规划员) shows on its own reply instead of
    // always showing 'main'. Fall back to DEFAULT_AGENT_ID.
    const turnAgentId = payload.message?.agentKey ?? payload.agentKey ?? DEFAULT_AGENT_ID;
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
      turnAgentId,
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
        agent_id: turnAgentId,
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
    async (
      text: string,
      opts?: { contextPrefix?: string; preferAgentId?: string },
    ): Promise<void> => {
      if (!connected) {
        throw new Error('gateway is not connected');
      }
      const trimmed = text.trim();
      if (!trimmed) return;
      // Make sure the session exists before sending. If create above
      // raced and lost (cleared from createdRef), retry it inline.
      if (!createdRef.current.has(key)) {
        createdRef.current.add(key);
        await gatewaySend('sessions.create', { agentId: DEFAULT_AGENT_ID, key }).catch(
          () => {
            createdRef.current.delete(key);
          },
        );
      }
      // Build the delegation hint when the user picked a specialist.
      // Prepend: context prefix (memory recall) → delegation hint → user message.
      const prefix = opts?.contextPrefix ?? '';
      const delegationHint =
        opts?.preferAgentId && opts.preferAgentId !== DEFAULT_AGENT_ID
          ? buildDelegationHint(opts.preferAgentId)
          : '';
      const messageOnWire =
        prefix || delegationHint
          ? `${prefix}${delegationHint}${trimmed}`
          : trimmed;
      await gatewaySend('sessions.send', {
        key,
        message: messageOnWire,
        idempotencyKey: `aios-${intentId}-${Date.now()}`,
      });
    },
    [connected, key, gatewaySend, intentId],
  );

  return { connected, sendViaGateway };
}
