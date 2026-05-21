import {
  buildConnectParams,
  isGatewayFrame,
  type GatewayEventFrame,
  type GatewayResponseFrame,
} from './protocol';

/**
 * Browser WebSocket client for the OpenClaw gateway.
 *
 * Mirrors the studio adapter's protocol (req/res/event frames, connect
 * handshake, request-id correlation, timeout per request) but runs in
 * the browser against native `WebSocket`. Reconnect uses exponential
 * backoff capped at 15s; pending requests are rejected on disconnect
 * so callers can decide whether to retry.
 *
 * Lifecycle:
 *   const client = new GatewayClient({ getCredentials, onEvent, … });
 *   client.start();   // connects; emits status changes
 *   await client.request('chat.send', { … });
 *   client.stop();    // graceful close
 *
 * The `getCredentials` callback is invoked each (re)connect attempt
 * so a fresh short-lived token from mint_claw_token can be supplied
 * without having to tear down the client.
 */

export type GatewayStatus =
  | 'stopped'
  | 'connecting'
  | 'reconnecting'
  | 'connected'
  | 'error';

export interface GatewayCredentials {
  url: string;
  token: string;
  /**
   * Optional ISO timestamp the token expires at. When provided the
   * client schedules a graceful re-mint + reconnect 60 seconds before
   * expiry so the user doesn't see a disconnect blip when the
   * server-side TTL lapses.
   */
  expiresAt?: string;
}

export interface GatewayClientOptions {
  getCredentials: () => Promise<GatewayCredentials>;
  onEvent?: (event: GatewayEventFrame) => void;
  onStatusChange?: (status: GatewayStatus, reason: string | null) => void;
  appVersion?: string;
  /** Wire factory override for tests; defaults to `new WebSocket(url)`. */
  webSocketFactory?: (url: string) => WebSocket;
  connectTimeoutMs?: number;
  defaultRequestTimeoutMs?: number;
}

const CONNECT_TIMEOUT_MS = 8_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 15_000;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class GatewayError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(params: { code: string; message: string; details?: unknown }) {
    super(params.message);
    this.name = 'GatewayError';
    this.code = params.code;
    this.details = params.details;
  }
}

export class GatewayClient {
  private ws: WebSocket | null = null;
  private status: GatewayStatus = 'stopped';
  private statusReason: string | null = null;
  private connectRequestId: string | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private stopping = false;
  private nextRequestNumber = 1;
  private pending = new Map<string, PendingRequest>();
  private readonly options: GatewayClientOptions;

  constructor(options: GatewayClientOptions) {
    this.options = options;
  }

  getStatus(): { status: GatewayStatus; reason: string | null } {
    return { status: this.status, reason: this.statusReason };
  }

  start(): void {
    if (this.status !== 'stopped' && this.status !== 'error') return;
    this.stopping = false;
    this.reconnectAttempt = 0;
    void this.connect();
  }

  stop(): void {
    this.stopping = true;
    this.clearReconnect();
    this.clearRefresh();
    this.failPendingRequests(new GatewayError({ code: 'stopped', message: 'gateway client stopped' }));
    const ws = this.ws;
    this.ws = null;
    this.connectRequestId = null;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      try {
        ws.close(1000, 'client stop');
      } catch {
        // ignore
      }
    }
    this.updateStatus('stopped', null);
  }

  /** Send a request and resolve with the server's payload. */
  request<T = unknown>(
    method: string,
    params?: unknown,
    options?: { timeoutMs?: number },
  ): Promise<T> {
    if (this.status !== 'connected' || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(
        new GatewayError({ code: 'not_connected', message: 'gateway is not connected' }),
      );
    }
    const id = String(this.nextRequestNumber++);
    const frame = { type: 'req' as const, id, method, params };
    const timeoutMs = options?.timeoutMs ?? this.options.defaultRequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new GatewayError({ code: 'timeout', message: `request "${method}" timed out` }));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      });
      try {
        this.ws!.send(JSON.stringify(frame));
      } catch (err) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(new GatewayError({ code: 'send_failed', message: err instanceof Error ? err.message : 'send failed' }));
      }
    });
  }

  // ─── internals ───────────────────────────────────────────────────

  private async connect(): Promise<void> {
    if (this.stopping) return;
    this.clearReconnect();
    this.clearRefresh();
    this.updateStatus(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting', null);

    let creds: GatewayCredentials;
    try {
      creds = await this.options.getCredentials();
    } catch (err) {
      this.handleConnectFailure(err instanceof Error ? err.message : 'credentials_failed');
      return;
    }
    if (this.stopping) return;

    // Schedule a proactive refresh 60s before the token expires so the
    // user doesn't see a disconnect blip when the server-side TTL
    // lapses. If expiresAt is missing or already past, skip.
    if (creds.expiresAt) {
      const expiresMs = Date.parse(creds.expiresAt);
      if (Number.isFinite(expiresMs)) {
        const delay = Math.max(30_000, expiresMs - Date.now() - 60_000);
        this.refreshTimer = setTimeout(() => {
          this.refreshTimer = null;
          if (this.stopping) return;
          // Graceful cycle: close + reconnect picks fresh creds.
          const ws = this.ws;
          this.ws = null;
          if (ws && ws.readyState === WebSocket.OPEN) {
            try { ws.close(1000, 'proactive_refresh'); } catch { /* ignore */ }
          }
          this.reconnectAttempt = 0;
          void this.connect();
        }, delay);
      }
    }

    const factory = this.options.webSocketFactory ?? ((url) => new WebSocket(url));
    let ws: WebSocket;
    try {
      ws = factory(creds.url);
    } catch (err) {
      this.handleConnectFailure(err instanceof Error ? err.message : 'ws_open_failed');
      return;
    }
    this.ws = ws;
    this.connectRequestId = null;

    const connectTimeoutMs = this.options.connectTimeoutMs ?? CONNECT_TIMEOUT_MS;
    this.connectTimer = setTimeout(() => {
      this.handleConnectFailure('connect_timeout');
      try {
        ws.close(1011, 'connect timeout');
      } catch {
        // ignore
      }
    }, connectTimeoutMs);

    ws.addEventListener('message', (ev) => this.handleMessage(ev, creds.token));
    ws.addEventListener('close', (ev) => this.handleClose(ev));
    ws.addEventListener('error', () => {
      // Browser WebSocket "error" carries no useful info; rely on close.
    });
  }

  private handleMessage(ev: MessageEvent, token: string): void {
    if (typeof ev.data !== 'string') return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (!isGatewayFrame(parsed)) return;

    if (parsed.type === 'event') {
      if (parsed.event === 'connect.challenge') {
        this.sendConnectRequest(token);
        return;
      }
      this.options.onEvent?.(parsed);
      return;
    }
    if (parsed.type === 'res') {
      this.handleResponse(parsed);
    }
  }

  private sendConnectRequest(token: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.connectRequestId) return;
    const id = String(this.nextRequestNumber++);
    this.connectRequestId = id;
    const params = buildConnectParams({
      token,
      appVersion: this.options.appVersion ?? 'dev',
    });
    try {
      this.ws.send(JSON.stringify({ type: 'req', id, method: 'connect', params }));
    } catch (err) {
      this.connectRequestId = null;
      this.handleConnectFailure(err instanceof Error ? err.message : 'connect_send_failed');
    }
  }

  private handleResponse(frame: GatewayResponseFrame): void {
    if (frame.id === this.connectRequestId) {
      if (this.connectTimer) {
        clearTimeout(this.connectTimer);
        this.connectTimer = null;
      }
      this.connectRequestId = null;
      if (frame.ok) {
        this.reconnectAttempt = 0;
        this.updateStatus('connected', null);
      } else {
        this.handleConnectFailure(frame.error?.message ?? 'connect_rejected');
      }
      return;
    }

    const pending = this.pending.get(frame.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(frame.id);
    if (frame.ok) {
      pending.resolve(frame.payload);
    } else {
      pending.reject(
        new GatewayError({
          code: frame.error?.code ?? 'gateway_error',
          message: frame.error?.message ?? 'gateway returned an error',
          details: frame.error?.details,
        }),
      );
    }
  }

  private handleClose(ev: CloseEvent): void {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    const wasConnected = this.status === 'connected';
    this.ws = null;
    this.connectRequestId = null;
    this.failPendingRequests(
      new GatewayError({ code: 'disconnected', message: `socket closed (${ev.code})` }),
    );

    if (this.stopping) {
      this.updateStatus('stopped', null);
      return;
    }
    // Treat any non-1000 close as a reconnect trigger. 1000 with stopping=false
    // (server hung up gracefully) also retries — agents need to be reachable.
    if (wasConnected) this.reconnectAttempt = 0;
    this.scheduleReconnect(ev.reason || `close_${ev.code}`);
  }

  private handleConnectFailure(reason: string): void {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    const ws = this.ws;
    this.ws = null;
    this.connectRequestId = null;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      try {
        ws.close(1011, reason);
      } catch {
        // ignore
      }
    }
    if (this.stopping) return;
    this.scheduleReconnect(reason);
  }

  private scheduleReconnect(reason: string): void {
    this.clearReconnect();
    this.updateStatus('reconnecting', reason);
    const delay = Math.min(
      MAX_RECONNECT_DELAY_MS,
      INITIAL_RECONNECT_DELAY_MS * 2 ** Math.min(this.reconnectAttempt, 4),
    );
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
  }

  private clearRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private failPendingRequests(err: Error): void {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(err);
    }
    this.pending.clear();
  }

  /**
   * Test-only: close the active WebSocket with a non-1000 code so the
   * built-in reconnect path runs. Used by e2e to verify the
   * disconnect → re-mint → re-connect flow without a real network
   * drop. No-op when the client isn't currently connected.
   */
  __simulateWsCloseForTests(code = 1006, reason = 'simulated_disconnect'): void {
    const ws = this.ws;
    if (!ws) return;
    if (ws.readyState !== WebSocket.OPEN && ws.readyState !== WebSocket.CONNECTING) return;
    try {
      ws.close(code, reason);
    } catch {
      // ignore
    }
  }

  private updateStatus(next: GatewayStatus, reason: string | null): void {
    if (this.status === next && this.statusReason === reason) return;
    this.status = next;
    this.statusReason = reason;
    this.options.onStatusChange?.(next, reason);
  }
}
