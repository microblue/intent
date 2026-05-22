# Hand-off — provision `aios_gateway_token_key` in Supabase Vault

**Repo:** none. This is a Supabase Dashboard / SQL Editor action on
the `myclaw-v2` project (`SUPABASE_PROJECT_REF` per
`~/.openclaw/credentials/myclaw-supabase.env`). Schema is already in
place via `~/myclaw/supabase/migrations/20260520000001_gateway_token_encryption.sql`.

## Context

`aios-design.md §4.4` (auth bridge) says `claws.gateway_token` is
a long-lived secret that **must not** leave Supabase. The migration
already added:

- `claws.gateway_token_enc text` — base64 of pgsodium-encrypted token
- `public.encrypt_gateway_token_trigger()` — encrypts plaintext writes
  when the Vault key is present (no-op otherwise, so the migration is
  safe to apply early)
- `public.decrypt_gateway_token(claw_id text)` — service-role-only
  RPC the `mint-claw-token` Edge Function calls instead of reading
  the column directly

Without the Vault key both functions short-circuit and plaintext rows
keep flowing through. Provisioning the key flips on at-rest
encryption for every future INSERT/UPDATE; the backfill in step (2)
encrypts existing rows.

## What to run (Supabase Dashboard → SQL Editor → service-role)

### 1. Insert the key into Vault

```sql
-- One-shot: stage a 256-bit symmetric key for pgp_sym_encrypt.
-- The Vault encrypts it at rest with the project master key; the
-- decrypted_secrets view is the only read path, gated to service
-- role.
--
-- Use vault.create_secret() (SECURITY DEFINER wrapper), NOT a direct
-- INSERT into vault.secrets. Direct INSERT calls
-- pgsodium._crypto_aead_det_noncegen which requires the project owner
-- role; the wrapper sidesteps that.
select vault.create_secret(
    encode(gen_random_bytes(32), 'hex'),
    'aios_gateway_token_key'
);
```

Verify:

```sql
select name, length(decrypted_secret) as key_len_chars
from vault.decrypted_secrets
where name = 'aios_gateway_token_key';
-- expect: 1 row, key_len_chars = 64  (32 bytes hex-encoded)
```

### 2. Bulk-encrypt existing claws.gateway_token rows

The encryption trigger fires on `UPDATE OF gateway_token`. A
self-update tickles it without changing any value:

```sql
-- Atomic backfill — runs the trigger on every row that still has
-- plaintext. Safe to re-run; rows already encrypted have
-- gateway_token = null so the trigger short-circuits.
update public.claws
set gateway_token = gateway_token
where gateway_token is not null;
```

Verify:

```sql
select
    count(*) filter (where gateway_token is not null) as plaintext_remaining,
    count(*) filter (where gateway_token_enc is not null) as encrypted_now
from public.claws;
-- expect: plaintext_remaining = 0; encrypted_now = total real claws
```

### 3. Confirm `mint-claw-token` can decrypt

The Edge Function calls `public.decrypt_gateway_token(claw_id)`.
Spot-check by issuing a token for one of DZ's existing claws via the
SPA: open `https://app.myclaw.one`, navigate into any intent, watch
`ClawStatus` flip to `connected` within ~5s. If decryption fails the
SPA stays in `connecting`/`error` and the `mint-claw-token` function
logs show "decrypted_secret was null" or similar.

(For a CLI check: `curl -i -X POST` against the function URL with the
test user's JWT. The aios real-mode e2e
`phase6-realmode-smoke.spec.ts` already covers this end-to-end on
prod and will fail if mint regresses.)

### 4. (Future) Drop the plaintext column

Once step (2) shows 0 plaintext rows and the SPA has been signed-in
+ connected by every active user (let's say two weeks of dwell after
the bulk-encrypt), apply a follow-up migration in `~/myclaw`:

```sql
alter table public.claws drop column gateway_token;
```

That removes the trigger's no-op leg and locks in encryption-only.
**Don't run this until step (2) shows 0 plaintext rows; otherwise
existing claws will lose their token.**

## Acceptance — when to flip D1 to [x]

DZ to confirm in chat:

1. Vault contains `aios_gateway_token_key` (step 1 verify query
   returns 1 row, 64 chars).
2. `plaintext_remaining = 0` after step 2.
3. Real-mode `phase6-realmode-smoke.spec.ts` green against
   `https://app.myclaw.one` (ClawStatus reaches `connected`).
4. This file is deleted in the same commit that marks D1 [x] so the
   tree stops carrying a satisfied hand-off.

## Rollback

If anything goes wrong, delete the Vault row and the trigger will
short-circuit; subsequent writes go back to plaintext. The
`gateway_token_enc` column stays populated for already-encrypted
rows — they will fail to decrypt and the SPA will show
`claw_not_ready` until the key is restored.

```sql
delete from vault.secrets where name = 'aios_gateway_token_key';
```
