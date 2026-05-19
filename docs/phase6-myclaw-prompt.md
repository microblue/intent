# Phase 6 — Hand-off to myclaw (Edge Function `mint_claw_token`)

Drop this into a Claude Code session whose CWD is `~/myclaw`.

---

## Context

`~/myclaw-aios` is the AIOS SPA (anon key + RLS only). It needs to open
a WebSocket to per-user claws at `wss://<claw.subdomain>.myclaw.one/ws`
to drive real-time agent / message / job streams. The handshake passes
a token via `connect`-method `auth.token`.

The long-lived `claws.gateway_token` MUST NOT reach the browser. The
plan (`~/myclaw-studio/docs/aios-plan.md` lines 309-324) requires an
Edge Function that:

1. Reads the caller's user JWT.
2. Verifies the caller owns the requested claw (or has a `claw_grants`
   row — table TBD; if it doesn't exist yet, only owner is allowed).
3. Loads `claws.gateway_token` for that claw.
4. Returns a short-lived (~1 hour) token the SPA can use as
   `connect.params.auth.token` against the claw's OpenClaw gateway.

For Phase 6 v1 we **return the existing `gateway_token` directly**
behind RLS-equivalent auth checks. Later phases will switch to a signed,
time-limited token derived from `gateway_token`. The Edge Function
boundary is what matters now — it lets us swap the minting policy
without touching the SPA.

## Deliverable

Create a Supabase Edge Function at
`~/myclaw/supabase/functions/mint-claw-token/index.ts` with this
contract:

**Request**

- Method: `POST`
- Auth: `Authorization: Bearer <user JWT>` (Supabase user session)
- Body: `{ "claw_id": "<text id>" }`

**Response (200)**

```json
{
  "url": "wss://<claw.subdomain>.myclaw.one/ws",
  "token": "<short-lived token>",
  "expires_at": "<ISO timestamp ~1h ahead>",
  "claw_id": "<echo>"
}
```

**Errors**

- 401 if no JWT or invalid.
- 403 if the caller doesn't own the claw.
- 404 if the claw doesn't exist for that user.
- 409 if the claw isn't ready (`status != 'active'` OR `subdomain IS
  NULL` — sentinel claws have `plan_id='aios-prototype'` and null
  subdomain; reject them with a friendly `claw_not_ready` code so the
  SPA can show the "go install a real claw" banner).
- 500 otherwise.

Use the existing functions in this repo as templates for style /
imports / error handling. Match the surrounding code's pattern for
constructing the Supabase client with the user JWT (service-role client
for the DB read, user-context client for the JWT check).

## SQL prerequisites

Confirm the auto-claw trigger emits sentinel rows correctly. The 4-table
prompt landed earlier (`20260519065449...sql`); the auto-claw trigger
landed as commit `22381e4`. If anything was missed, fix forward — don't
modify the historical migrations.

If `claw_grants` doesn't exist yet, that's fine for Phase 6 v1 —
restrict access to `user_id = auth.uid()` only. Add a TODO comment.

## Verification

After deploying:

1. Sign in as a known user with a real (non-sentinel) claw.
2. `curl` the function with `claw_id` of that claw → expect 200 with
   `url` and `token`.
3. `curl` with a sentinel `claw_id` (plan_id='aios-prototype') →
   expect 409 + `code: claw_not_ready`.
4. `curl` with someone else's claw → expect 403.

Report back with:

- Commit SHA where the function landed.
- The deploy command used (`supabase functions deploy mint-claw-token`).
- Output of the three curl probes.
- Whether `claws.gateway_token` is currently encrypted (plain text per
  the schema right now). If plain text, leave a TODO referencing the
  plan's "encrypt + KMS" note — aios won't ship Phase 6 without an
  Edge Function boundary even if v1 returns raw token.

aios will lock its end against this contract. **Do not** change the
response shape without coordinating; the SPA reads `url + token +
expires_at` literally.

## Out of scope (deferred)

- Token rotation / refresh endpoint (aios will re-mint on reconnect for now).
- `claw_grants` table for shared-claw access (Phase 7+).
- Encrypting `gateway_token` at rest (Phase 7+ if not already).
- `register_claw` / `claim_claw` endpoints — those are separate from
  mint, not blocking aios.
