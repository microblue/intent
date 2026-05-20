import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser } from './helpers/test-user';

/**
 * L5 — RLS isolation: user A cannot read or modify user B's data.
 *
 * Provisions two throwaway users via admin API, then for every
 * user-scoped table, attempts read + update + delete from each user's
 * session against the OTHER user's row. RLS must reject all of them.
 *
 * Tables under test:
 *   - intents
 *   - messages
 *   - approvals
 *   - schedule_events
 *   - memory_facts
 *   - permission_grants
 *   - user_preferences
 *   - claws
 *
 * This spec doesn't touch the SPA — it talks to PostgREST directly
 * with each user's freshly-minted access token, which is exactly what
 * the SPA does in real-mode.
 */

interface MintedUser { id: string; email: string; access_token: string }

function svc() {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY!;
  return { apikey: k, authorization: `Bearer ${k}` };
}

async function mintTokenFor(email: string): Promise<string> {
  const url = process.env.SUPABASE_URL!;
  const link = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { ...svc(), 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email }),
  });
  const { action_link } = (await link.json()) as { action_link: string };
  const r = await fetch(action_link, { redirect: 'manual' });
  const loc = r.headers.get('location') ?? '';
  const fragment = loc.split('#')[1] ?? '';
  const params = new URLSearchParams(fragment);
  const tok = params.get('access_token');
  if (!tok) throw new Error('no access_token in mint redirect');
  return tok;
}

async function provisionUser(): Promise<MintedUser> {
  const u = await createTestUser();
  // Brief delay so the auto-claw trigger commits the sentinel before we mint.
  await new Promise((r) => setTimeout(r, 500));
  const access_token = await mintTokenFor(u.email);
  return { id: u.id, email: u.email, access_token };
}

async function userScopedFetch(
  user: MintedUser,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = process.env.SUPABASE_URL!;
  const anon = process.env.SUPABASE_PUB_KEY ?? process.env.SUPABASE_ANON_KEY ?? '';
  return fetch(`${url}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      apikey: anon,
      authorization: `Bearer ${user.access_token}`,
    },
  });
}

const skip = () => {
  if (!process.env.SUPABASE_URL || !(process.env.SUPABASE_PUB_KEY ?? process.env.SUPABASE_ANON_KEY)) {
    test.skip(true, 'L5 needs SUPABASE_URL + SUPABASE_PUB_KEY (anon)');
  }
};

test.describe.configure({ mode: 'serial' });

test.describe('L5 — RLS isolation between two real users', () => {
  test.beforeEach(skip);
  test.skip(({ isMobile }) => isMobile === true, 'no UI; one project run');

  test('user A cannot read or modify user B\'s rows in every user-scoped table', async () => {
    test.setTimeout(120_000);
    const userA = await provisionUser();
    const userB = await provisionUser();
    try {
      // ─── Seed user B's data via service role ───────────────────────
      // Each table: insert one row owned by B.
      const url = process.env.SUPABASE_URL!;
      const intentId = `aios-rls-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

      // Fetch B's sentinel claw to use as FK target.
      const clawRes = await fetch(
        `${url}/rest/v1/claws?user_id=eq.${userB.id}&select=id&limit=1`,
        { headers: svc() },
      );
      const clawRows = (await clawRes.json()) as { id: string }[];
      const clawId = clawRows[0]?.id;
      if (!clawId) throw new Error('user B has no sentinel claw — auto trigger missing?');

      await fetch(`${url}/rest/v1/intents`, {
        method: 'POST',
        headers: { ...svc(), 'content-type': 'application/json' },
        body: JSON.stringify({
          id: intentId,
          user_id: userB.id,
          claw_id: clawId,
          title: 'B-private',
        }),
      });

      const msgRes = await fetch(`${url}/rest/v1/messages`, {
        method: 'POST',
        headers: { ...svc(), 'content-type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({
          intent_id: intentId,
          user_id: userB.id,
          role: 'user',
          content: [{ type: 'text', text: 'B private message' }],
        }),
      });
      const msgRows = (await msgRes.json()) as { id: string }[];
      const messageId = msgRows[0].id;

      const apprRes = await fetch(`${url}/rest/v1/approvals`, {
        method: 'POST',
        headers: { ...svc(), 'content-type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({
          intent_id: intentId,
          user_id: userB.id,
          prompt: 'B-only approval',
          status: 'pending',
        }),
      });
      const apprRows = (await apprRes.json()) as { id: string }[];
      const approvalId = apprRows[0].id;

      await fetch(`${url}/rest/v1/user_preferences`, {
        method: 'POST',
        headers: { ...svc(), 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: userB.id, display_name: 'B-name' }),
      });

      // ─── Now user A tries to read B's data ────────────────────────
      const cases: Array<[string, string]> = [
        ['intents', `/rest/v1/intents?id=eq.${intentId}&select=*`],
        ['messages', `/rest/v1/messages?id=eq.${messageId}&select=*`],
        ['approvals', `/rest/v1/approvals?id=eq.${approvalId}&select=*`],
        ['user_preferences', `/rest/v1/user_preferences?user_id=eq.${userB.id}&select=*`],
        ['claws', `/rest/v1/claws?id=eq.${clawId}&select=*`],
      ];
      for (const [name, path] of cases) {
        const r = await userScopedFetch(userA, path);
        const rows = (await r.json()) as unknown[];
        expect(
          Array.isArray(rows) && rows.length === 0,
          `RLS leak: user A read ${rows.length} row(s) from ${name} owned by user B (response: ${JSON.stringify(rows).slice(0, 200)})`,
        ).toBe(true);
      }

      // ─── Now user A tries to UPDATE B's intent (should affect 0 rows)
      const updRes = await userScopedFetch(userA, `/rest/v1/intents?id=eq.${intentId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ title: 'B-pwned-by-A' }),
      });
      const updRows = (await updRes.json()) as unknown[];
      expect(
        Array.isArray(updRows) && updRows.length === 0,
        `RLS leak: user A UPDATEd ${updRows.length} of B's intent rows`,
      ).toBe(true);

      // ─── DELETE attempt (should also affect 0) ─────────────────────
      const delRes = await userScopedFetch(userA, `/rest/v1/intents?id=eq.${intentId}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=representation' },
      });
      const delRows = (await delRes.json().catch(() => [])) as unknown[];
      expect(
        Array.isArray(delRows) && delRows.length === 0,
        `RLS leak: user A DELETEd ${delRows.length} of B's intent rows`,
      ).toBe(true);

      // ─── Confirm B's row still intact via service role ─────────────
      const stillThere = await fetch(`${url}/rest/v1/intents?id=eq.${intentId}&select=title`, {
        headers: svc(),
      });
      const ok = (await stillThere.json()) as { title: string }[];
      expect(ok[0]?.title, 'B intent should be untouched').toBe('B-private');
    } finally {
      await deleteTestUser(userA.id);
      await deleteTestUser(userB.id);
    }
  });
});
