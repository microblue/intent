/**
 * OpenClaw gateway wire protocol — frame types + connect handshake.
 *
 * Adapted from `~/myclaw-studio/src/lib/controlplane/contracts.ts` and
 * `gateway-connect-profile.ts`. The studio adapter ran server-side
 * (node `ws`); aios runs in the browser (native WebSocket). The frame
 * shapes and method names are identical so we share the same backend.
 *
 * Wire spec:
 *   Client → server : { type: "req", id, method, params }
 *   Server → client : { type: "res", id, ok, payload, error? }
 *                   | { type: "event", event, payload?, seq? }
 *
 * Connect handshake:
 *   1. Client opens WebSocket.
 *   2. Server emits event `connect.challenge` once the socket is open.
 *   3. Client sends a `req` with method `"connect"` and the params
 *      shape below.
 *   4. Server responds; ok=true means the session is ready and other
 *      methods (chat.send, agents.list, …) become available.
 */

export const GATEWAY_PROTOCOL_VERSION = 3;
export const GATEWAY_CAPABILITIES = ['tool-events'] as const;

export const GATEWAY_METHODS = [
  'status',
  'chat.send',
  'chat.abort',
  'chat.history',
  'agents.list',
  'sessions.list',
  'sessions.preview',
  'exec.approval.resolve',
  'exec.approvals.get',
] as const;
export type GatewayMethod = (typeof GATEWAY_METHODS)[number];

export interface GatewayRequestFrame {
  type: 'req';
  id: string;
  method: string;
  params?: unknown;
}

export interface GatewayResponseFrame {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code: string; message: string; details?: unknown };
}

export interface GatewayEventFrame {
  type: 'event';
  event: string;
  payload?: unknown;
  seq?: number;
}

export type GatewayFrame =
  | GatewayRequestFrame
  | GatewayResponseFrame
  | GatewayEventFrame;

/**
 * `connect` method params. Tracks the studio's `operator` profile
 * (full read + write + approvals scope). Future profile splits (a
 * read-only "viewer" profile, for instance) extend this here.
 */
export interface GatewayConnectParams {
  minProtocol: number;
  maxProtocol: number;
  client: {
    id: string;
    version: string;
    platform: string;
    mode: string;
  };
  role: 'operator';
  scopes: readonly string[];
  caps: readonly string[];
  auth: { token: string };
}

export const OPERATOR_SCOPES = [
  'operator.admin',
  'operator.read',
  'operator.write',
  'operator.approvals',
  'operator.pairing',
] as const;

const CLIENT_ID = 'myclaw-aios';
const CLIENT_PLATFORM = 'web';
const CLIENT_MODE = 'aios';

export function buildConnectParams(args: {
  token: string;
  /** aios bundle version. From `import.meta.env.VITE_APP_VERSION` or 'dev'. */
  appVersion: string;
}): GatewayConnectParams {
  return {
    minProtocol: GATEWAY_PROTOCOL_VERSION,
    maxProtocol: GATEWAY_PROTOCOL_VERSION,
    client: {
      id: CLIENT_ID,
      version: args.appVersion,
      platform: CLIENT_PLATFORM,
      mode: CLIENT_MODE,
    },
    role: 'operator',
    scopes: [...OPERATOR_SCOPES],
    caps: [...GATEWAY_CAPABILITIES],
    auth: { token: args.token },
  };
}

export function isGatewayFrame(value: unknown): value is GatewayFrame {
  if (!value || typeof value !== 'object') return false;
  const t = (value as { type?: unknown }).type;
  return t === 'req' || t === 'res' || t === 'event';
}
