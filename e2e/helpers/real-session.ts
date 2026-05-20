import type { BrowserContext } from '@playwright/test';
import { SUPABASE_STORAGE_KEY } from './auth-stub';

/**
 * Mint a *real* Supabase session for a known user via the admin API,
 * then inject it into the browsing context's localStorage so the SPA
 * treats us as truly signed-in (RLS reads against Supabase succeed,
 * not just the UI chrome). Used by the real-mode smoke spec that
 * verifies preview-build behavior end-to-end.
 *
 * Requires service-role credentials in the test environment:
 *   SUPABASE_URL              = https://<ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)
 *
 * Flow:
 *   1. admin.generateLink({type:'magiclink',email}) → hashed_token
 *   2. POST /auth/v1/verify with hashed_token → real access_token +
 *      refresh_token signed by Supabase
 *   3. Write the session blob into the project-scoped localStorage key
 *
 * This is a TEST-only helper. Never call from the SPA bundle.
 */

interface MintedSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user_id: string;
  email: string;
}

async function mintViaMagiclink(email: string): Promise<MintedSession> {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      'real-session helper requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env',
    );
  }

  // Step 1: ask admin API to generate a magic link for this email.
  // We don't follow the link in a real browser — we just want the
  // hashed_token so we can call /verify to obtain a session.
  const linkRes = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ type: 'magiclink', email }),
  });
  if (!linkRes.ok) {
    throw new Error(`generate_link failed: ${linkRes.status} ${await linkRes.text()}`);
  }
  // GoTrue's REST `admin/generate_link` returns the user object with
  // `hashed_token` and `action_link` at the top level (the supabase-js
  // client adapter re-shapes it into `{user, properties}` — the raw
  // HTTP endpoint does not).
  const link = (await linkRes.json()) as {
    hashed_token?: string;
    action_link?: string;
    id?: string;
    email?: string;
  };
  if (!link.action_link) throw new Error('generate_link returned no action_link');
  if (!link.id) throw new Error('generate_link returned no user id');

  // Step 2: GET the action_link manually, intercepting the 303 redirect
  // that GoTrue issues with the session embedded as a URL fragment
  // (`#access_token=…&refresh_token=…&expires_at=…`). We don't follow
  // the redirect — we just parse Location, since the destination
  // (e.g. https://myclaw.one) won't accept random fetch traffic.
  const verifyRes = await fetch(link.action_link, { redirect: 'manual' });
  if (verifyRes.status !== 303 && verifyRes.status !== 302) {
    throw new Error(
      `expected 303 redirect from action_link, got ${verifyRes.status}: ${await verifyRes.text()}`,
    );
  }
  const location = verifyRes.headers.get('location');
  if (!location) throw new Error('action_link redirect missing Location header');
  const fragment = location.split('#')[1];
  if (!fragment) {
    throw new Error(`action_link redirected without session fragment: ${location}`);
  }
  const params = new URLSearchParams(fragment);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const expiresAtStr = params.get('expires_at');
  if (!accessToken || !refreshToken || !expiresAtStr) {
    throw new Error(`fragment missing tokens: ${fragment}`);
  }

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: Number(expiresAtStr),
    user_id: link.id,
    email: link.email ?? email,
  };
}

export async function injectRealSession(
  context: BrowserContext,
  email: string,
): Promise<MintedSession> {
  const minted = await mintViaMagiclink(email);
  const sessionBlob = {
    access_token: minted.access_token,
    token_type: 'bearer',
    expires_in: minted.expires_at - Math.floor(Date.now() / 1000),
    expires_at: minted.expires_at,
    refresh_token: minted.refresh_token,
    user: {
      id: minted.user_id,
      email: minted.email,
      aud: 'authenticated',
      role: 'authenticated',
    },
  };
  // The Supabase JS client reads its session from this localStorage key
  // on init. Injecting before navigation means the very first render
  // already knows we're signed in.
  await context.addInitScript(
    ({ key, value }) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        // ignore; private mode or storage quota
      }
    },
    { key: SUPABASE_STORAGE_KEY, value: JSON.stringify(sessionBlob) },
  );
  return minted;
}
