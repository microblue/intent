import { supabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import type { GatewayCredentials } from './client';

/**
 * Call the myclaw Supabase Edge Function `mint-claw-token` to exchange
 * the user JWT for a short-lived per-claw gateway token + the WS URL.
 *
 * Contract is locked in `docs/phase6-myclaw-prompt.md`:
 *   POST /functions/v1/mint-claw-token
 *   body: { claw_id }
 *   200 → { url, token, expires_at, claw_id }
 *   409 + code:claw_not_ready → sentinel / pending claw
 *
 * The Edge Function is the trust boundary — `claws.gateway_token` never
 * leaves Supabase; the SPA only ever sees the short-lived mint output.
 */

export interface MintError {
  code: string;
  message: string;
  status: number;
}

export class MintClawTokenError extends Error implements MintError {
  readonly code: string;
  readonly status: number;
  constructor(params: MintError) {
    super(params.message);
    this.name = 'MintClawTokenError';
    this.code = params.code;
    this.status = params.status;
  }
}

interface MintResponse {
  url: string;
  token: string;
  expires_at: string;
  claw_id: string;
}

export async function mintClawToken(clawId: string): Promise<GatewayCredentials> {
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr) {
    throw new MintClawTokenError({
      code: 'session_error',
      message: sessionErr.message,
      status: 0,
    });
  }
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new MintClawTokenError({
      code: 'not_signed_in',
      message: '需要先登录才能连接 claw',
      status: 401,
    });
  }

  // Construct the function URL from VITE_SUPABASE_URL so we don't bake
  // a project ref in. supabase.functions.invoke would work too, but the
  // raw fetch keeps the error path explicit so we can surface
  // claw_not_ready → friendly UI without parsing FunctionsHttpError.
  const fnUrl = `${env.supabaseUrl}/functions/v1/mint-claw-token`;
  let res: Response;
  try {
    res = await fetch(fnUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ claw_id: clawId }),
    });
  } catch (err) {
    throw new MintClawTokenError({
      code: 'network_error',
      message: err instanceof Error ? err.message : 'mint request failed',
      status: 0,
    });
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // ignore — Edge Functions sometimes return empty bodies on 5xx.
  }

  if (!res.ok) {
    // myclaw's fail() returns { error, code } — read both shapes so we
    // stay compatible if a future revision adds `message` too.
    const errObj = (body && typeof body === 'object' ? (body as Record<string, unknown>) : {}) as {
      code?: string;
      error?: string;
      message?: string;
    };
    throw new MintClawTokenError({
      code: errObj.code ?? `http_${res.status}`,
      message: errObj.message ?? errObj.error ?? `mint failed (${res.status})`,
      status: res.status,
    });
  }

  const parsed = body as Partial<MintResponse> | null;
  if (!parsed?.url || !parsed?.token) {
    throw new MintClawTokenError({
      code: 'invalid_response',
      message: 'mint response missing url or token',
      status: res.status,
    });
  }

  return { url: parsed.url, token: parsed.token, expiresAt: parsed.expires_at };
}
