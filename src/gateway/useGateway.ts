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
  refs: number;
}

const singleton: ModuleSingleton = { client: null, refs: 0 };
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
  const startedForRef = useRef<string | null>(null);

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

  // Lifecycle. We don't tear down on every re-render — only when the
  // claw changes or the connection should no longer be active.
  useEffect(() => {
    if (!shouldConnect || !targetClawId) {
      if (singleton.refs === 0 && singleton.client) teardown();
      return;
    }
    singleton.refs += 1;
    if (startedForRef.current !== targetClawId) {
      // Different claw than the singleton was started for — recycle.
      if (singleton.client) teardown();
      const appVersion = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? 'dev';
      const client = ensureClient(targetClawId, appVersion);
      startedForRef.current = targetClawId;
      client.start();
    }
    return () => {
      singleton.refs -= 1;
      if (singleton.refs <= 0) {
        teardown();
        startedForRef.current = null;
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
