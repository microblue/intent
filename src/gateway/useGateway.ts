import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { useClaws } from '@/data/useClaws';
import { GatewayClient, type GatewayStatus } from './client';
import { mintClawToken } from './mint';
import type { GatewayEventFrame } from './protocol';

/**
 * useGateway — owns the lifetime of a single GatewayClient bound to the
 * user's default claw.
 *
 * Connection rules:
 *   - Mock mode (VITE_USE_REAL_DATA=false) → no connection attempt; the
 *     hook returns status='stopped' so the rest of the app stays on
 *     mocks. Flipping the flag (or the user signing in) reactively
 *     starts the client.
 *   - Real mode + signed in + has at least one non-sentinel claw → mint
 *     a short-lived token, open WS, hold connected through reconnects.
 *   - Sentinel-only / no claws / signed-out → client is left stopped.
 *
 * Domain events flow out via `lastEvent` (single most-recent frame;
 * consumers that need a stream subscribe via `subscribe`). Request
 * sends route through the same client via `send`.
 *
 * Only one gateway client per app — re-rendering this hook in multiple
 * components is fine, but they share the singleton via a module-scoped
 * ref so we don't duplicate sockets.
 */

interface ModuleSingleton {
  client: GatewayClient | null;
  /** clawId the live singleton was started for; null when stopped. */
  startedFor: string | null;
  refs: number;
}

const singleton: ModuleSingleton = { client: null, startedFor: null, refs: 0 };
const listeners = new Set<(s: GatewayStatus, reason: string | null) => void>();
const eventListeners = new Set<(e: GatewayEventFrame) => void>();
let currentStatus: { status: GatewayStatus; reason: string | null } = {
  status: 'stopped',
  reason: null,
};
let lastEvent: GatewayEventFrame | null = null;

function broadcastStatus(s: GatewayStatus, reason: string | null) {
  currentStatus = { status: s, reason };
  listeners.forEach((l) => l(s, reason));
}

function broadcastEvent(e: GatewayEventFrame) {
  lastEvent = e;
  eventListeners.forEach((l) => l(e));
}

function ensureClient(clawId: string, appVersion: string): GatewayClient {
  if (singleton.client) return singleton.client;
  singleton.client = new GatewayClient({
    appVersion,
    getCredentials: () => mintClawToken(clawId),
    onStatusChange: broadcastStatus,
    onEvent: broadcastEvent,
  });
  return singleton.client;
}

function teardown() {
  singleton.client?.stop();
  singleton.client = null;
  singleton.startedFor = null;
  currentStatus = { status: 'stopped', reason: null };
  lastEvent = null;
}

export interface UseGatewayResult {
  status: GatewayStatus;
  reason: string | null;
  isMock: boolean;
  /** ID of the claw we're (or would be) connected to. Null if none. */
  clawId: string | null;
  /** Send a request frame; resolves with payload or rejects with GatewayError. */
  send: <T = unknown>(method: string, params?: unknown, options?: { timeoutMs?: number }) => Promise<T>;
  /** Subscribe to all event frames; returns an unsubscribe. */
  subscribe: (handler: (e: GatewayEventFrame) => void) => () => void;
}

export function useGateway(): UseGatewayResult {
  const { signedIn, loading: sessionLoading } = useSession();
  const { defaultClaw, hasRealClaw, isMock } = useClaws();
  const [status, setStatus] = useState(currentStatus.status);
  const [reason, setReason] = useState<string | null>(currentStatus.reason);

  const targetClawId = hasRealClaw && defaultClaw ? defaultClaw.id : null;
  const shouldConnect =
    env.useRealData && signedIn && !sessionLoading && Boolean(targetClawId);

  // Status subscription (always on; cheap).
  useEffect(() => {
    const handler = (s: GatewayStatus, r: string | null) => {
      setStatus(s);
      setReason(r);
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  // Lifecycle. The singleton lives at module scope so multiple
  // consumers (ClawPicker, ClawStatus, useGatewayChat per intent…)
  // share the SAME socket. Only switch clients when the targetClawId
  // changes across consumers; otherwise just bump the refcount.
  useEffect(() => {
    if (!shouldConnect || !targetClawId) {
      // This consumer doesn't need a connection. Don't tear down the
      // singleton here — another consumer may still want it.
      return;
    }
    singleton.refs += 1;
    if (singleton.startedFor !== targetClawId) {
      // Different claw than the singleton was started for — recycle.
      if (singleton.client) teardown();
      const appVersion = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? 'dev';
      const client = ensureClient(targetClawId, appVersion);
      singleton.startedFor = targetClawId;
      client.start();
    }
    return () => {
      singleton.refs -= 1;
      if (singleton.refs <= 0) {
        teardown();
      }
    };
  }, [shouldConnect, targetClawId]);

  const result = useMemo<UseGatewayResult>(
    () => ({
      status,
      reason,
      isMock,
      clawId: targetClawId,
      send: async (method, params, options) => {
        if (!singleton.client) {
          throw new Error('gateway client not started');
        }
        return singleton.client.request(method, params, options);
      },
      subscribe: (handler) => {
        eventListeners.add(handler);
        return () => {
          eventListeners.delete(handler);
        };
      },
    }),
    [status, reason, isMock, targetClawId],
  );

  return result;
}

/** Test-only: peek at the singleton state (and clear it). */
export function __resetGatewaySingletonForTests() {
  teardown();
  listeners.clear();
  eventListeners.clear();
  lastEvent = null;
}

export function __getLastEventForTests(): GatewayEventFrame | null {
  return lastEvent;
}

/**
 * Test-only: synthesize a gateway event into the same broadcast bus
 * that real WS frames flow through. Used by e2e to simulate
 * `agent.start` / `agent.done` lifecycle events without a live
 * OpenClaw backend.
 */
export function __emitGatewayEventForTests(event: string, payload?: unknown): void {
  broadcastEvent({ type: 'event', event, payload });
}

/**
 * useGatewayEvent — subscribe to a specific gateway event by name.
 *
 * The handler fires on every matching frame and is auto-cleaned up on
 * unmount. Use this in data hooks (useApprovals, useMessages, …) that
 * want to invalidate a TanStack Query cache when the gateway emits a
 * relevant runtime event.
 *
 * Mock mode / no real claw → no events ever fire, so handlers can
 * safely be no-ops and the rest of the page stays on mocks.
 *
 * `eventName` can be:
 *   - a literal string ("exec.approval.requested")
 *   - "*" to match every event
 *   - an array of names to match any of several
 *
 * Handler is wrapped in a ref so callers can pass an inline closure
 * without re-subscribing on every render.
 */
export function useGatewayEvent(
  eventName: string | readonly string[],
  handler: (event: GatewayEventFrame) => void,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const accept = (name: string) => {
      if (eventName === '*') return true;
      if (typeof eventName === 'string') return name === eventName;
      return eventName.includes(name);
    };
    const wrapped = (e: GatewayEventFrame) => {
      if (accept(e.event)) handlerRef.current(e);
    };
    eventListeners.add(wrapped);
    return () => {
      eventListeners.delete(wrapped);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Array.isArray(eventName) ? eventName.join('|') : eventName]);
}
