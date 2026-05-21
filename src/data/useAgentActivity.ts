import { useEffect, useState } from 'react';
import { useGatewayEvent } from '@/gateway/useGateway';

/**
 * useAgentActivity — track which subagent (if any) is currently
 * in-flight for the given intent, driven by `agent.*` lifecycle
 * events from the OpenClaw gateway.
 *
 * Event shapes we recognize (forward-compatible — OpenClaw may pick
 * one or another):
 *
 *   { event: 'agent.start',  payload: { intentId?, agentKey, phase? } }
 *   { event: 'agent.done',   payload: { intentId?, agentKey } }
 *   { event: 'agent.error',  payload: { intentId?, agentKey } }
 *
 * If `intentId` is on the payload, we only track activity for the
 * matching intent — otherwise we accept the event (the session is
 * already scoped to this intent's claw connection upstream).
 *
 * Safety net: every started agent auto-clears after 60s in case the
 * gateway drops its `done`/`error` (mirrors the typing-indicator
 * safety net in IntentHome).
 */

export interface AgentActivity {
  agentKey: string;
  /** Optional phase tag emitted by the agent (e.g. "planning"). */
  phase?: string;
  startedAt: number;
}

const ACTIVITY_TIMEOUT_MS = 60_000;

export function useAgentActivity(intentId: string): AgentActivity | null {
  const [activity, setActivity] = useState<AgentActivity | null>(null);

  useGatewayEvent(['agent.start', 'agent.done', 'agent.error'], (event) => {
    const payload = event.payload as
      | { intentId?: string; agentKey?: string; phase?: string }
      | null;
    if (!payload?.agentKey) return;
    // Filter by intentId when the gateway sends one; otherwise accept
    // (per-intent scoping is enforced at the WS layer for this user's
    // claw, but a future multi-intent multiplex could leak across).
    if (payload.intentId && payload.intentId !== intentId) return;

    if (event.event === 'agent.start') {
      setActivity({
        agentKey: payload.agentKey,
        phase: payload.phase,
        startedAt: Date.now(),
      });
    } else {
      // Only clear if the done/error matches the currently in-flight
      // agent. If the gateway raced and a different agent's done
      // arrived while a new start is already showing, leave the new
      // one alone.
      setActivity((prev) => (prev?.agentKey === payload.agentKey ? null : prev));
    }
  });

  // Auto-clear after the safety timeout in case the gateway never
  // raises the matching done/error.
  useEffect(() => {
    if (!activity) return;
    const handle = window.setTimeout(() => {
      setActivity((prev) => (prev?.startedAt === activity.startedAt ? null : prev));
    }, ACTIVITY_TIMEOUT_MS);
    return () => window.clearTimeout(handle);
  }, [activity]);

  return activity;
}
