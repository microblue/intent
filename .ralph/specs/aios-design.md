# AI-OS Redesign — P0 Design Doc

Status: **draft, awaiting sign-off**
Author: Dawson + Claude
Last updated: 2026-05-06

---

## 1. North star

Reframe the product from "rent a Claw server" to "**install an AI-OS on your own machine**". The AI-OS exposes:

- **Intents** — the user's long-running goals/projects (top-level abstraction)
- **Agents** — bound to Intents, addressed via `@agent` in chat
- **Skills / Agent Engine** — platform resources the OS ships with

The Claw is the substrate; users live inside Intents. Three deployment surfaces: Hetzner / Lightsail / DigitalOcean VMs (existing); Fly.io containers (new); user-self-hosted Docker (free byproduct of the container build).

The control plane (myclaw.one) splits into three role-keyed surfaces with **distinct URLs** (no shared paths between roles).

---

## 2. Roles

| Role | Surface URL | Self-mints | Notes |
|------|-------------|-----------|-------|
| `super_admin` | `/admin/*` | Yes (no quota) | Sees everything; can open any claw's dev mode |
| `channel_partner` | `/partner/*` | Yes, capped per-SKU quota | Sees own batches + own customers only |
| `end_user` | `/aios/*` | No | Single-user; multi-AI-OS per account |

`partner_member` (multi-seat partner accounts) is **out of scope** for this revision.

---

## 3. URL map

```
public
  /                  marketing home (existing, retained)
  /login /signup     auth (Supabase email/password)

end_user (login required)
  /aios                          AI-OS list, default landing post-login
  /aios/install                  redeem flow: paste key → name/region → start install
  /aios/install/:clawId          install progress: phase animation + live log streams
  /aios/:clawId                  Intent home for one AI-OS (Intent list)
  /aios/:clawId/intent/:intentId Intent detail (3-pane: chat / outline / artifacts)
  /aios/:clawId/dev              developer mode (dark + monospace; existing claw detail)

super_admin (login required)
  /admin                         landing = analytics
  /admin/codes
  /admin/codes/mint
  /admin/partners                NEW — partner accounts + per-SKU quota grants
  /admin/users                   user accounts
  /admin/fleet                   all AI-OS instances (was admin claws tab)
  /admin/fleet/:id               any-instance dev view (read-only for non-owner)
  /admin/billing
  /admin/install-reports
  /admin/audit                   NEW — audit log of admin & partner actions
  /admin/settings                includes INSTALLER_VERSION, kill-switch flags

channel_partner (login required, sidebar = 4 items)
  /partner                       landing = own codes dashboard
  /partner/codes                 own batches only
  /partner/codes/mint            capped at remaining seat quota per-SKU
  /partner/customers             end_users who redeemed partner's codes
  /partner/billing               own revenue / payouts
  /partner/profile

redirects (single coordinated cutover)
  /admin (legacy tab UI)        → /admin (new sidebar UI; same URL, content re-rendered)
  /admin?tab=*                  → /admin/<corresponding section>  (301)
  /claws                        → role-routed: super_admin → /admin, partner → /partner, end_user → /aios
  /claws/:id                    → /aios/:id   (end_user owner) or /admin/fleet/:id (otherwise)
  /claws/redeem                 → /aios/install
  /claws/new (legacy wizard)    → /aios/install
```

**Why distinct URLs by role**: shared URLs that render different views by user role are debug-hostile (screenshots / bug reports / docs all become ambiguous). The earlier merge into `/claws` was reverted on review.

---

## 4. Data model changes

### 4.1 RBAC + per-SKU partner quota

`is_admin` is dropped in **two staged migrations** so an in-flight deploy never sees a column the API still references.

```sql
-- Migration N (ships with code that READS role; tolerates is_admin still present)
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'end_user';
UPDATE users SET role = 'super_admin' WHERE is_admin = true;
-- is_admin column kept for now.

CREATE TABLE channel_partners (
  user_id           text PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  display_name      text NOT NULL,
  status            text NOT NULL DEFAULT 'active',  -- 'active' | 'suspended' | 'terminated'
  revenue_share_pct numeric NOT NULL DEFAULT 0,
  payout_method     jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Per-SKU quota (enables "100 90-day VM codes + 50 365-day VM codes + 200 $5 container credits")
CREATE TABLE partner_quotas (
  partner_id     text NOT NULL REFERENCES channel_partners(user_id) ON DELETE CASCADE,
  sku_kind       text NOT NULL,        -- 'new_vm_day' | 'renewal_vm_day' | 'new_container_credit'
  validity_days  integer,              -- null for credit SKUs
  credit_usd     integer,              -- null for day SKUs
  total          integer NOT NULL,
  used           integer NOT NULL DEFAULT 0,
  PRIMARY KEY (partner_id, sku_kind, COALESCE(validity_days, -1), COALESCE(credit_usd, -1))
);

ALTER TABLE activation_codes
  ADD COLUMN partner_id text REFERENCES users(id) ON DELETE SET NULL;
-- partner_name is kept as a free-text legacy label. partner_id stays NULL on
-- pre-existing batches until super-admin manually maps a registered partner
-- to a partner_name in /admin/partners.

-- Migration N+1 (after API deploy that reads role only is rolled out)
ALTER TABLE users DROP COLUMN is_admin;
```

### 4.2 Intent (sovereign architecture)

Intent **metadata** lives centrally so `/aios` lists work cross-device and admin can audit usage. Intent **outline + messages + artifacts** stay on the AI-OS itself; web fetches them on demand.

```sql
CREATE TABLE intents (
  id                  text PRIMARY KEY,             -- ULID
  claw_id             text NOT NULL REFERENCES claws(id) ON DELETE CASCADE,
  user_id             text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title               text NOT NULL,
  -- Last-message snapshot pushed by the claw on each chat turn.
  -- Used purely for the /aios list view; NOT a source of truth.
  last_message_preview text,
  last_message_at     timestamptz,
  archived_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX intents_claw_user_idx ON intents (claw_id, user_id);

CREATE TABLE intent_agents (
  intent_id    text NOT NULL REFERENCES intents(id) ON DELETE CASCADE,
  agent_key    text NOT NULL,
  display_name text NOT NULL,
  is_orchestrator boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (intent_id, agent_key)
);
CREATE UNIQUE INDEX intent_agents_one_orchestrator
  ON intent_agents (intent_id) WHERE is_orchestrator = true;

CREATE TABLE intent_artifacts (
  id          text PRIMARY KEY,
  intent_id   text NOT NULL REFERENCES intents(id) ON DELETE CASCADE,
  kind        text NOT NULL,
  name        text NOT NULL,
  pointer     text NOT NULL,                       -- path on claw
  size_bytes  bigint,
  sha256      text,                                -- claw-reported; verified on download
  verified_at timestamptz,                         -- last time central verified pointer
  created_by_agent text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX intent_artifacts_intent_idx ON intent_artifacts (intent_id);
```

**No `outline` column** (initial draft had `intents.outline jsonb`; removed because it created split-brain — outline is derived from messages on the claw, so it can never be canonical centrally). Detail page fetches outline from claw on demand via openclaw-studio API. List page uses `last_message_preview` snapshot.

### 4.3 Install phase tracking — single source of truth

```sql
-- Distinguishes log chunks from a fresh install vs a re-run; client subscriptions
-- filter by run_id so they never tail an old install's logs.
ALTER TABLE claws ADD COLUMN install_run_id text;

CREATE TABLE claw_install_phases (
  id             text PRIMARY KEY,                 -- ULID
  claw_id        text NOT NULL REFERENCES claws(id) ON DELETE CASCADE,
  install_run_id text NOT NULL,
  phase          text NOT NULL,
  -- 'renting_compute' | 'mounting_storage' | 'installing_kernel' | 'loading_skills' |
  -- 'calibrating_agents' | 'wiring_network' | 'issuing_certificate' |
  -- 'pulling_image' (container only) | 'ready' | 'failed'
  log_chunk      text NOT NULL,                    -- newline-joined tail
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX claw_install_phases_run_idx
  ON claw_install_phases (claw_id, install_run_id, created_at DESC);
```

The latest row's `phase` is the live cursor (no separate `claws.install_phase` column — eliminates two-channel race). Web subscribes via Supabase Realtime to `claw_install_phases` filtered by `install_run_id`.

`install_reports` is for **desktop installer crash reports** (separate concern, separate table — confirmed by reading existing schema).

### 4.4 Auth bridge — three credentials, one job each

| Credential | Direction | Used for | Lifetime |
|------------|-----------|----------|----------|
| Supabase JWT | browser → claw | Web reads Intent messages, writes turns | Per Supabase session |
| `gatewayToken` | external → claw network gateway | inbound traffic to the claw's public surface | Per-claw, baked at install |
| `claw_central_token` | claw → central API | phase emit, last-message preview push, artifact metadata push | Per-claw, **rotatable** independently |

Single token doing all three was the original design; rejected because rotating it required touching 3+ surfaces simultaneously. Splitting outbound (claw → central) into its own token means leak/rotation only affects upstream calls.

```sql
ALTER TABLE claws ADD COLUMN central_token text NOT NULL;
-- Generated at claw insert; cycled via super_admin action in /admin/fleet/:id.
```

**Browser → claw auth**: claw validates Supabase JWKS in-process. Cloud-init writes `/etc/openclaw/env`:

```
SUPABASE_JWKS_URL=https://<project>.supabase.co/auth/v1/.well-known/jwks.json
OWNER_USER_ID=<userId>
```

openclaw-studio middleware validates JWT signature against cached JWKS (1h TTL with stale-while-revalidate semantics on rotation) and rejects unless `sub === OWNER_USER_ID`. JWKS rotation: if validation fails AND cache is older than 5 min, refresh JWKS once before rejecting; this gives Supabase rotations near-zero impact.

### 4.5 Activation-code SKU shapes (day vs credit)

White-paper appendix A has `xxxxxxxxx-ddd-uuu` (day-validity, multi-seat) for VM tiers. Container tiers (Fly) bill by seconds, so a flat day-validity code mismatches actual cost. Add a second code shape:

```
xxxxxxxxx-DDD-UUU   day-based code      (VM tiers)        sku_kind = 'new_vm_day' | 'renewal_vm_day'
xxxxxxxxx-CCC-UUU   credit-based code   (Container tiers) sku_kind = 'new_container_credit'
```

The user-facing redemption page surfaces:
- Day code: "90 days · 5 seats"
- Credit code: "$5 compute credit · 5 seats" + "≈ 50 hours light use" footnote

Existing `activation_codes.validity_days` stays (NULL for credit SKUs). New column:

```sql
ALTER TABLE activation_codes ADD COLUMN credit_usd integer; -- NULL for day SKUs
-- CHECK ((validity_days IS NULL) <> (credit_usd IS NULL))
```

---

## 5. Install flow

End user lands on `/aios/install` (after login):

```
┌─────────────────────────────────────────────┐
│ Install AI-OS                               │
├─────────────────────────────────────────────┤
│ Activation key:  XXXXXXXXX-DDD-UUU          │
│   → preview: VM · 4 vCPU · 8 GB · 90 days   │
│ Name:            my-aios                    │
│ Region:          [Hetzner Helsinki ▾]       │
│ SSH key:         [None ▾]                   │
│                                             │
│              [ Install ]                    │
└─────────────────────────────────────────────┘
```

On submit → API claims a seat (existing CAS), generates `install_run_id`, creates the claw row with `central_token`, fires `provisionClawServer()`, redirects to `/aios/install/:clawId`.

`/aios/install/:clawId` page:

```
┌──────────────────────────────────────────────────────────────┐
│   ╔═══════════════════════════════════╗                      │
│   ║  AI-OS Installation               ║                      │
│   ║  ⚙  Calibrating Agent Engine...   ║   <— big animated   │
│   ║  [████████████░░░░░░░] 62%         ║       phase label   │
│   ╚═══════════════════════════════════╝                      │
│                                                              │
│   Phases:                                                    │
│   ✔ Renting compute             ~28s                         │
│   ✔ Mounting sovereign storage  ~9s                          │
│   ✔ Installing AI-OS kernel     ~118s                        │
│   ▶ Calibrating Agent Engine    ~45s elapsed                 │
│   ○ Wiring sovereign network                                 │
│   ○ Issuing trust certificate                                │
│                                                              │
│   ┌─ bootstrap log ─────┐  ┌─ gateway log ──────┐            │
│   │ + apt-get update    │  │ [info] worker up   │            │
│   │ + curl install.sh   │  │ [info] skill load… │            │
│   └─────────────────────┘  └────────────────────┘            │
└──────────────────────────────────────────────────────────────┘
```

**Backend phase emission** (from the GitHub installer's `lib/00-phase-emit.sh`):

```bash
emit_phase() {
  curl -fsS --max-time 8 --retry 5 --retry-connrefused --retry-delay 2 \
       -X POST "${OPENCLAW_API_BASE}/install/${OPENCLAW_CLAW_ID}/phase" \
       -H "Authorization: Bearer ${OPENCLAW_CENTRAL_TOKEN}" \
       -H "Idempotency-Key: ${INSTALL_RUN_ID}-$1" \
       -H "Content-Type: application/json" \
       -d "$(jq -nc --arg p "$1" --arg r "${INSTALL_RUN_ID}" --arg l "$2" \
              '{phase:$p, runId:$r, logTail:$l}')"
}
```

Notes:
- Idempotency-Key prevents duplicate phase rows on retry
- `--retry-connrefused` survives transient network blips during install
- Phase emit failures **never abort install** (warning only) — the install proceeds; UI just lacks live updates

**Live log streaming**: each phase boundary uploads the last ~200 lines of `cloud-init-output.log` AND `journalctl -u openclaw-gateway.service -n 200` (once gateway exists). Persisted as one row per emit in `claw_install_phases`. Web subscribes via Supabase Realtime to `claw_install_phases` rows where `install_run_id = :runId`.

**Completion**: when the latest phase row is `phase='ready'`, the install page transitions to `/aios/:clawId`.

### 5.5 CORS — Web → AI-OS subdomain

```
header /api/* {
  Access-Control-Allow-Origin "{$ALLOWED_ORIGIN}"  # https://myclaw.one in prod
  Access-Control-Allow-Credentials "true"
  Access-Control-Allow-Headers "Authorization, Content-Type, Idempotency-Key"
  Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS"
  Access-Control-Max-Age "600"
}
@options method OPTIONS
respond @options 204
```

`ALLOWED_ORIGIN` is set per-environment in cloud-init env. Production = `https://myclaw.one`; staging gets its own hostname.

### 5.6 Single transport per direction (architectural rule)

| Direction | Transport | Why |
|-----------|-----------|-----|
| claw → central | HTTP POST (Bearer central_token) | Claw is the active actor; central is a sink. Retry buffered locally. |
| browser ← central | Supabase Realtime | Already in stack; built-in fan-out. |
| browser → claw | direct HTTP (Bearer Supabase JWT) | Sovereign data path; CORS allowed. |
| central → claw | **forbidden** | No reverse connection: claw firewalls / NAT / mobile installs would all need shoehorning. Anything central wants to push, the claw polls or browser triggers. |

Rule violations get caught in code review.

---

## 6. Intent runtime model

```
┌───────────────────────────────────────────────────────────┐
│  Intent: "Plan European trip June 2026"                   │
├───────────┬──────────────────────────────────┬────────────┤
│  outline  │   main chat (orchestrator)       │ artifacts  │
│  (live)   │                                  │            │
│           │  user: find me hotel options     │  📄 hotels │
│  • Brief  │  orchestrator: I'll ask          │     .csv   │
│  • Hotels │    @booking-agent…               │  🖼 map    │
│  • Visas  │  user: @visa-agent any I need?   │     .png   │
│           │  visa-agent: France ok, …        │            │
│           │  [open subchat with visa-agent]  │            │
└───────────┴──────────────────────────────────┴────────────┘
```

- **Main chat** belongs to the **orchestrator agent**.
- `@agent-key` in input inlines the agent's reply as a collapsible block in main chat. **User-explicit "Open dedicated thread"** action opens subchat drawer. (Simpler mental model than the ambiguous "@ inlines OR opens drawer" of the first draft.)
- Subchats are separate threads under the same Intent; their messages don't auto-copy back to main chat (user can "Pin to main chat" any subchat message).
- **Outline is fetched from claw on demand** (no central caching, no split-brain). Browser hits `GET <claw>/api/intents/:id/outline` when the user opens detail page; claw computes from local message log and returns. List page does NOT show outline; only `last_message_preview` (which the claw pushed at last turn).
- Artifacts pane lists files the AI produced; click downloads from the claw.

**Where state lives**:

| State | Location | Writer | Why |
|-------|----------|--------|-----|
| Intent metadata (id, title, agent list, archived) | central Supabase | web | cross-device list, admin audit |
| `intents.last_message_preview` | central Supabase | claw push (after each turn) | drives list view without claw round-trip |
| outline (computed from messages) | **claw memory / claw-local cache** | claw | derived data; central caching → split-brain |
| Chat messages | claw filesystem | claw | sovereign data, offline use |
| Artifact files | claw filesystem | claw | sovereign data; pointer + sha256 in central |

---

## 7. Developer mode (`/aios/:clawId/dev`, `/admin/fleet/:id`)

Same content as today's `/claws/:id` page (Overview, Logs, WebSSH, Files, Subdomain, SSH key, Volumes, Snapshots, Lifecycle). **Visual reskin** is deferred — current xterm.js panel is already monospace; reskinning the surrounding chrome is cosmetic, not behavior. Owner-only `/aios/:clawId/dev`; super_admin uses `/admin/fleet/:id` to access any claw.

WebSSH (`ClawTerminalContent.tsx`) and live logs already exist; no new work.

---

## 8. Migration plan

Existing prod state: 3 users, several activation_code rows on v2 schema. Existing claws stay on the legacy cloud-init — only newly-installed claws use the GitHub installer. No re-provisioning of existing fleet.

Coordinated migration:

1. **DB migration N**: add `users.role`, `channel_partners`, `partner_quotas`, `activation_codes.partner_id`, `activation_codes.credit_usd`, `claws.install_run_id`, `claws.central_token`, `claw_install_phases`, `intents`, `intent_agents`, `intent_artifacts`, `audit_log` (§16), `rate_limits` (§13). Keeps `is_admin`. Backfill `central_token` for existing claws (random, written to `/etc/openclaw/env` on next config sync).
2. **API deploy** reading `role` only.
3. **DB migration N+1** (after deploy is fully green): `DROP COLUMN users.is_admin`.
4. **Web deploy**: `/admin/*` content moves to sidebar UI; `/admin?tab=*` → 301; `/claws*` → role-routed redirect; `/claws/redeem` → 301 to `/aios/install`.
5. **Per-claw default Intent** backfill: SQL idempotent `INSERT ... ON CONFLICT DO NOTHING` for every existing claw at deploy time (not lazy on visit — lazy backfill leaves never-visited users in inconsistent state).
6. After 1 week of green prod metrics, retire legacy code paths.

---

## 9. Phase plan

| P | Goal | Deliverables (incl. tests) | Est. |
|---|------|----------------------------|------|
| **P0** | this doc + sign-off + test infra | `docs/aios-design.md`; Playwright set up; CI gate | now → 2 days |
| **P1** | RBAC + admin/partner UI split | role column, channel_partners + partner_quotas, middleware (`superAdminOnly` / `partnerOrSuperAdmin`), `/admin` + `/partner` route shells, sidebars; **e2e + unit tests per §11** | 5-7 days |
| **P2a** | Extract installer to GitHub | new public `microblue/openclaw-installer`; `generateCloudInit.ts` shrinks to ~12-line wrapper; `INSTALLER_VERSION` setting; **shellcheck + smoke install on a real test VM** | 3-4 days |
| **P2b** | Install animation + live logs | `claw_install_phases`, `centralTokenAuth` middleware, `POST /install/:clawId/phase` (idempotent), `/aios/install/:clawId` page, dual-pane Realtime tail; **e2e: simulate phase emits, assert UI tracking** | 5-7 days |
| **P2c** | Provider interface split + Container variant | `VMProvider` / `ContainerProvider` interfaces; `microblue/openclaw-aios` Docker repo; `services/providers/fly.ts`; credit-based SKU plumbing; **interface conformance tests** | 6-8 days |
| **PRE-3** | Auth bridge + CORS (cross-repo) | Supabase JWKS validation in openclaw-studio; CORS in installer's Caddy block; cloud-init env. **integration test: web → claw with valid JWT 200; with wrong sub 401; with expired JWT 401** | 3-5 days |
| **P3** | Intent data layer | intents/intent_agents/intent_artifacts tables, central CRUD, `POST /api/intents/:id/last-preview` (claw push), claw-side outline computation; **unit tests per controller** | 4-5 days |
| **P4** | Intent UI | three-pane, orchestrator main chat, `@agent` inline blocks, subchat drawer, on-demand outline fetch, artifact pane; **e2e: full Intent journey** | 1.5-2 weeks |
| **P5** | Cutover + GA | retire `/admin?tab=*` and `/claws/redeem`, drop `is_admin`, marketing copy refresh; **regression e2e suite** | 2-3 days |

Total: **~8-12 weeks** (was 6-9; +25-33% test tax per user direction).

---

## 9.5. Container-based AI-OS (Fly.io / self-host)

```
microblue/openclaw-aios   (public Docker repo)
  Dockerfile              # FROM debian:stable-slim → runs same install steps as the GitHub installer
  entrypoint.sh           # exec gateway + studio + caddy under tini
  fly.toml.template       # baseline Fly app config
  docker-compose.yml      # for self-host SKU
```

Pricing handled by §4.5 (credit-based codes, not day-based). Self-host SKU is a free byproduct: same image, run with `docker compose up`, no central registration required (sovereign mode). Tradeoffs unchanged from earlier draft (volumes are zonal; some apt-needing skills don't work; Fly billing is hot/cold seconds — credit codes solve the latter).

---

## 10. Provider interface split

```
BaseProvider                                    common: status query, cost estimate, region list
  └── VMProvider (extends BaseProvider)         createVM, attachVolume, sshKeyInject, snapshot
        └── HetznerProvider
        └── LightsailProvider
        └── DigitalOceanProvider
  └── ContainerProvider (extends BaseProvider)  createMachine, mountVolume, exec, suspend
        └── FlyProvider
        └── SelfHostProvider                    (no-op for self-managed; metadata only)
```

Existing `services/providers/registry.ts` returns `BaseProvider`; callers narrow via `instanceof VMProvider` / `instanceof ContainerProvider`. UI's plan-selection groups visually by family ("VM tier" / "Container tier" / "Self-host").

`apps/web/src/pages/aios/install/index.tsx` reads `provider_family` from preview response and routes to the correct sub-form (VM family asks for SSH key + volume size; container family asks for region + credit budget).

---

## 11. Testing strategy (NEW — comprehensive)

### 11.1 Test infrastructure (P0 deliverable)

- **Unit tests**: vitest (existing). Co-located `*.test.ts(x)`.
- **Integration tests**: vitest with real Postgres + a mocked claw. Run against `supabase start` local instance.
- **E2E tests**: Playwright. New `tests/e2e/` directory at repo root. CI runs against a deployed staging slot or a local `pnpm dev` stack.
- **Contract tests**: claw ↔ central token validation; web ↔ claw JWKS validation. Live in `tests/contract/`.
- **Smoke tests**: post-deploy check that production endpoints respond. `tests/smoke/`.

CI gate (`pre-merge.yml`): lint + typecheck + unit + integration must pass. E2E must pass on staging. PRs without test additions for new code blocked by `/lint-tests` workflow.

### 11.2 Phase-by-phase test matrix

#### P1 — RBAC + role-keyed surfaces

Unit tests:
- `superAdminOnly` middleware: 200 on role=super_admin, 403 otherwise (for role ∈ {channel_partner, end_user, anon}).
- `partnerOrSuperAdmin` middleware: 200 on those two roles, 403 otherwise.
- `partner_quotas` upsert: increment used; reject when used >= total; concurrent CAS test.
- `createActivationCodeBatch` for partner: rejects when sku_kind not in partner_quotas; rejects when total - used < count*seats; succeeds on valid case.
- `getAdminActivationCodes` scoping: super_admin sees all; partner sees only own partner_id.
- Audit log writes on role change, partner suspend, code void.

E2E tests:
1. super_admin login → sidebar shows 8 items → click each, no 403.
2. channel_partner login → sidebar shows 4 items → /admin returns 403 → /partner/codes shows only own batches.
3. end_user login → /admin returns redirect to /aios → /partner returns redirect to /aios.
4. partner mints batch within quota → CSV downloads → quota incremented.
5. partner mints batch over quota → error toast → quota unchanged.
6. partner A cannot see partner B's customers (privilege isolation test).
7. super_admin opens /admin/fleet/:id of another user's claw → dev mode loads.
8. super_admin promotes end_user to channel_partner via /admin/users/:id → audit_log row written → user's next login shows /partner.

#### P2a — Installer extraction

Unit tests:
- `generateCloudInit.ts` produces ≤4096 byte output (well under 16KB cap).
- `generateCloudInit.ts` includes `INSTALLER_VERSION` from settings.
- `generateCloudInit.ts` references the configured `INSTALLER_VERSION` tag.

Integration / shellcheck:
- `microblue/openclaw-installer` repo CI: shellcheck on every `lib/*.sh`.
- Smoke: spin up a fresh Hetzner CX22 in CI weekly, run installer end-to-end, assert openclaw-gateway is healthy, assert openclaw-studio reachable on subdomain.

E2E:
9. Provision a new claw via `/aios/install` with day-based code → claw reaches `running` state → `/aios/:id` accessible.

#### P2b — Install animation + live logs

Unit tests:
- `centralTokenAuth` middleware: 200 with valid token; 401 with wrong/expired/missing.
- `postInstallPhase` controller: rejects unknown phase strings; idempotent (same Idempotency-Key returns 200 without dup row).
- `postInstallPhase` rate limit: >60 req/min per claw → 429.

Integration:
- Mock installer script: emit 8 phase rows in order; web subscriber receives all 8 in correct order; phase animation reaches "ready".
- Out-of-order emit (phase 5 arrives before phase 4): UI still ends at "ready" without crashing.
- Realtime subscription scoping: install A's logs don't leak into install B's UI even if same claw_id (different run_id).

E2E:
10. New install → install page shows phase animation → reaches Intent home.
11. Network blip during phase emit (simulate via artificial latency) → install completes; UI catches up at next phase.
12. User refreshes browser mid-install → UI rehydrates from latest claw_install_phases row.
13. Failed install (provider returns error) → phase=failed → UI shows error + Retry button → retry generates new run_id.

#### P2c — Provider split + Container

Unit tests:
- `VMProvider.createVM` contract: returns `{providerServerId, ip, status='creating'}`.
- `ContainerProvider.createMachine` contract: returns `{providerServerId, ip, status='creating'}`.
- Both implementations conform via `runProviderConformance(provider)` shared test suite.
- Credit-based code redemption: claw row inserted with `credit_usd_remaining`; deduct hourly via sweeper.

E2E:
14. Mint a credit-based code → user redeems → Fly machine spins up in <90s → user sees Intent home.
15. Container plan selector hides VM-only options (SSH key field absent).

#### PRE-3 — Auth bridge + CORS

Unit tests (in openclaw-studio repo):
- JWT middleware: valid signature + matching sub → 200.
- JWT middleware: valid signature + wrong sub → 401.
- JWT middleware: expired JWT → 401.
- JWT middleware: malformed JWT → 401.
- JWKS cache: refreshes on miss; serves stale during 5-min window if remote fails.

Contract tests:
- Browser fetch with real Supabase JWT → claw → 200 + body.
- Browser fetch from `https://evil.com` → claw → CORS preflight blocks.

#### P3 — Intent data layer

Unit tests:
- Intent CRUD: create/list/archive/delete.
- `intent_agents.is_orchestrator` unique partial index: cannot create second orchestrator for same intent (DB-level test).
- `last_message_preview` push from claw token: 200 with claw's central_token; 401 with another claw's token.
- Artifact pointer with stale verified_at → web fetches re-verifies via claw GET.

E2E:
16. Create Intent on `/aios/:clawId` → row inserted → claw receives orchestrator-agent install → /aios list updates.
17. Archive Intent → row's archived_at set → list view filters it out.

#### P4 — Intent UI

Unit / component tests (RTL):
- Main chat renders messages from mocked claw API.
- `@agent` token in input opens agent picker.
- Subchat drawer separate context.

E2E:
18. Open Intent → main chat loads → outline fetched from claw → artifacts list shown.
19. Send message with @booking-agent → reply inlined as collapsible block in main chat.
20. Click "Open dedicated thread with @booking-agent" → drawer opens with own message history.
21. Pin subchat message to main chat → message appears in main thread.
22. Long Intent (500+ messages): outline pane stays responsive; no UI jank > 100ms.
23. Claw offline mid-session: chat input shows "AI-OS offline" banner; outline fetch fails gracefully.

#### P5 — Cutover regression

E2E:
24. Polar checkout flow (no activation code) — unchanged from current behavior.
25. Dev-mode deploy (no Polar configured, no activation code) — unchanged.
26. Existing user with existing claw logs in → /aios shows their claw with the lazy-backfilled "Workspace" Intent.
27. /admin?tab=codes → 301 → /admin/codes (header `Location` correct).
28. /claws/redeem → 301 → /aios/install.
29. After `is_admin` drop migration: super_admin still has access (validates role-only path works).

### 11.3 Test coverage targets

- **Unit**: 80%+ line coverage per package (enforced via `vitest --coverage`).
- **E2E**: every numbered scenario above gates production deploys.
- **Contract**: every cross-repo boundary (web↔claw, claw↔central) has at least one positive + one negative test.

### 11.4 Backfill plan for existing untested code

Before P1 starts, T1 backfill week (3-5 days):
- `redeemActivationCode.ts`: 4 rejection paths × 2 SKU kinds; concurrent CAS; renewal plan-mismatch rejection.
- `createActivationCodeBatch.ts`: SKU validation; quota; super-admin no-quota path.
- `previewActivationCode.ts`: returns shape correctly per SKU.
- `expirySweeper.ts`: fake clock, expired claw triggers `cleanupClaw`.
- `cleanupExpiredClaws.ts`: returns claws with `deletionScheduledAt < now()`.
- Existing `adminOnly` middleware tests stay (rename when role migration lands).

---

## 12. Observability

### 12.1 Metrics (Datadog or self-hosted Prometheus — TBD)

Per-claw lifecycle:
- `install.phase.duration{phase, provider}` — histogram
- `install.phase.failed{phase, provider, reason}` — counter
- `install.duration_total{provider, outcome}` — histogram

Code redemption:
- `code.redeem.success{sku_kind}` — counter
- `code.redeem.failed{sku_kind, reason}` — counter (`reason` ∈ not_found, voided, expired, redeemed, plan_mismatch, no_seats)
- `code.preview.attempts{outcome}` — counter (for brute-force detection)

API health:
- `api.request.duration{route, status}` — histogram
- `api.gateway_token.invalid` — counter (compromise signal)

Realtime:
- `realtime.connections.active` — gauge
- `realtime.subscription.dropped` — counter

### 12.2 Alerts (PagerDuty)

| Alert | Threshold | Severity |
|-------|-----------|----------|
| Install failure rate | `> 5%` over 10 min | high |
| Code preview failures | `> 30/min` from one IP | medium (suspected brute force) |
| `gateway_token.invalid` spike | `> 10/min` | high (suspected compromise) |
| Realtime drops | sustained `> 1%` of active subs | medium |
| Phase-emit p99 latency | `> 5s` over 5 min | low |

### 12.3 Dashboards

- Install funnel (per provider, per phase): rows = phase; cols = provider; cell = success rate + p50/p99 duration.
- Per-partner activity: codes minted, redeemed, voided; revenue share earned; quota utilization.
- Claw lifecycle: creating → running → expired → cleanup.

### 12.4 Log retention

- `claw_install_phases`: 90-day TTL (cron job: `DELETE WHERE created_at < now() - interval '90 days'`).
- `audit_log`: 2 years (compliance).
- `rate_limits` (rolling counters): in-memory or Redis with 1h TTL.

---

## 13. Security & rate limiting

### 13.1 Public-ish endpoint rate limits

```
POST /api/claws/activation-code/preview     30 req/IP/min, 10 req/user/min
POST /api/claws/purchase                    10 req/user/min
POST /install/:clawId/phase                 60 req/claw/min
POST /api/intents/:id/last-preview          120 req/claw/min
```

Implementation: `rate_limits` table with `(key, window_start, count)` rows; middleware increments per request; reject with 429 + `Retry-After`. Redis swap-in deferred until single-instance API can't keep up.

### 13.2 Authentication boundaries

| Surface | Auth | Notes |
|---------|------|-------|
| `/admin/*` | Supabase session + role=super_admin | role check in middleware |
| `/partner/*` | Supabase session + role=channel_partner | partners see only own resources |
| `/aios/*` | Supabase session | end_user check |
| `/install/:clawId/phase` | claw central_token | `centralTokenAuth` |
| Browser → claw `/api/*` | Supabase JWT | claw validates JWKS |
| Inbound to claw gateway | gatewayToken | unchanged |

### 13.3 Token rotation

- `central_token`: rotatable per-claw via `/admin/fleet/:id` action. Old token invalid immediately; claw fetches new one via existing config-watcher mechanism on next poll.
- `gatewayToken`: rotatable similarly; not aggressive about cycling (rotation breaks any external callers, e.g., webhooks).
- Supabase JWT: handled by Supabase; claw's JWKS cache picks up new keys within 5 min worst case.

### 13.4 Cross-tenant isolation

Every list endpoint that supports filtering by partner / user / claw applies the filter in the WHERE clause **and** asserts the requestor's role is allowed to see the requested scope. Test §11.2 P1 #6 covers this.

### 13.5 Code-guessing attack mitigation

- 30 req/IP/min rate limit on `preview`
- 10-char base32-no-confusable random segment in code (~33 bits entropy excluding the dd/uuu suffix) — brute force at 30 req/min would take >10⁹ years on average
- After 100 consecutive failed previews from one IP in 1h → IP-banned for 24h (logged to audit_log)

---

## 14. Failure modes

### 14.1 Install failures

| What fails | Detection | User-facing | System action |
|------------|-----------|-------------|---------------|
| Provider API rejects createServer | API exception | "Couldn't reach provider — try a different region" + Retry button | Seat NOT claimed (CAS in transaction); claw row not created |
| Cloud-init runs but installer download 404 | phase emit never starts; 5-min timeout on UI | "Installer unreachable — contact support" | Seat IS claimed; claw row exists with phase=failed; manual retry by support |
| Installer mid-stream fails | phase=failed emit | Error message + "Retry install" button | New install_run_id; same claw row reused |
| Phase emit network drop | curl `--retry 5` exhausted | UI lacks live updates but install proceeds | Background sweeper checks claws stuck in early phase >15 min, marks failed |
| User closes browser mid-install | — | Returns to /aios → claw shows "Installing…" → click resumes /aios/install/:clawId | None; install is server-side |

### 14.2 Subscription expiry

Per user direction: subscription expiry = **hard stop**.

- `expirySweeper` (hourly) finds claws with `deletionScheduledAt < now()`, calls `cleanupClaw()`.
- 24h before expiry: notification email "Your AI-OS expires in 24 hours" with renewal link.
- Cleanup destroys provider resource AND deletes `claws` row AND archives child `intents`.
- Re-redemption with renewal code BEFORE cleanup: extends expiry without disruption.
- Re-redemption AFTER cleanup: not supported in v1 (data is gone). Email warning above is the only safety net.

### 14.3 Partner termination

When `channel_partners.status = 'terminated'`:
- Existing redeemed codes continue working (end_users keep their AI-OS).
- Unused codes → automatically voided.
- Future revenue shares paused but accrued — payout when partner is reinstated or after settlement.
- Audit_log entry mandatory.

### 14.4 User account deletion (GDPR)

Per §17 placeholder.

### 14.5 Orphaned seat (race)

Defense in depth:
- DB transaction wraps seat-claim + claw-insert. Both succeed or both rollback.
- If transaction commits but provisionClawServer fires-and-forgets and crashes the process before scheduling: a sweeper finds claws in `creating` state with no provider response after 5 min and marks `failed`.

---

## 15. Partner lifecycle

### 15.1 Onboarding

**Decision: super_admin invite only** for v1. Self-signup adds anti-abuse complexity not needed for the small partner count expected.

Flow:
1. Super_admin: `/admin/partners/new` → enters partner email + display_name + initial quotas per SKU.
2. System: emails the partner a signup link (single-use, 7-day TTL).
3. Partner clicks link → /signup with prefilled email + role badge → sets password.
4. On first login: lands on `/partner` with empty codes list and quota indicator.

### 15.2 Suspension / Termination

- `/admin/partners/:id` shows status + actions (Suspend, Terminate).
- Suspended partner cannot log in. Existing codes still work for end_users.
- Termination: see §14.3.

### 15.3 Partner billing / payout

- Partner's `revenue_share_pct` × redeemed-code revenue is computed nightly into `partner_payouts` table.
- Payouts processed monthly (manually for v1; automation deferred).
- Partner sees pending + paid amounts on `/partner/billing`.

```sql
CREATE TABLE partner_payouts (
  id           text PRIMARY KEY,
  partner_id   text NOT NULL REFERENCES channel_partners(user_id),
  period_start date NOT NULL,
  period_end   date NOT NULL,
  amount_usd   numeric NOT NULL,
  status       text NOT NULL DEFAULT 'pending',  -- 'pending' | 'paid' | 'disputed'
  paid_at      timestamptz,
  paid_method  text,
  paid_ref     text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
```

---

## 16. Audit log

```sql
CREATE TABLE audit_log (
  id           text PRIMARY KEY,
  actor_id     text NOT NULL REFERENCES users(id),
  actor_role   text NOT NULL,                     -- snapshot at action time
  action       text NOT NULL,                     -- 'role_change' | 'partner_suspend' | 'code_void' | …
  target_kind  text,                              -- 'user' | 'partner' | 'code' | 'claw'
  target_id    text,
  before_value jsonb,
  after_value  jsonb,
  metadata     jsonb,                             -- IP, user-agent, etc.
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_actor_idx ON audit_log (actor_id, created_at DESC);
CREATE INDEX audit_log_target_idx ON audit_log (target_kind, target_id, created_at DESC);
```

Mandatory writes (with tests verifying):
- super_admin changes user.role
- super_admin creates / suspends / terminates partner
- super_admin grants / modifies partner quota
- super_admin opens any claw's dev mode (read-access audit)
- super_admin or partner voids a code or batch
- super_admin rotates `central_token` or `gatewayToken`
- super_admin issues a payout

Surfaced at `/admin/audit` with filters by actor / target / action / date range.

---

## 17. Compliance & data residency (placeholder for legal review)

Open until counsel reviews:

- **GDPR delete-of-account**: must delete user's central rows + send a delete-request to each of the user's claws (claw runs `cleanupClaw`-equivalent on its local data).
- **Data residency**: VM provider selection sets effective residency (Hetzner Helsinki = EU). Partners MUST be told their downstream users get data on the region the user picks.
- **DPA template**: a DPA must accompany every channel-partner contract. Boilerplate to be drafted by counsel.
- **Audit log retention**: 2 years (typical for SOC2 / GDPR).
- **Cookie / privacy policy**: existing /privacy page revised when partner accounts launch.

This section MUST be filled in before partner onboarding; placeholder until then.

---

## 18. Abuse policy

Out-of-scope content / use cases:
- CSAM / illegal content generation: claw-side skill blocklist + central kill-switch (see §13.3 token rotation; revoke gatewayToken effectively offlines a claw).
- Spam / phishing campaigns: same.
- DDoS originating from claws: monitor outbound traffic via Caddy access logs; flag claws exceeding bandwidth thresholds.

Reporting: `abuse@myclaw.one` mailbox + `/admin/audit` writes a row when super_admin takes a takedown action.

V1 scope: kill-switch only. Active content moderation deferred.

---

## 19. Idempotency

Every state-mutating endpoint accepts `Idempotency-Key` header (UUID; client-generated).

```sql
CREATE TABLE idempotency_keys (
  key          text PRIMARY KEY,
  user_id      text REFERENCES users(id),
  request_hash text NOT NULL,                     -- sha256 of method + path + body
  status_code  integer NOT NULL,
  response_body jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
-- Cleanup: 24h TTL.
```

Middleware: on POST/PUT/PATCH, lookup key. If found AND request_hash matches → return cached response. If found AND hash differs → 422 (conflict — same key, different body). If not found → process + store result.

Tests:
- Same Idempotency-Key + same body → second call returns cached response without side-effects.
- Same Idempotency-Key + different body → 422.
- Two concurrent requests with same Idempotency-Key → only one wins, other waits and returns same response.

---

## 20. Open questions (defer or escalate)

1. **openclaw-studio cross-repo work** — confirm scope (msg-fetch HTTP API, JWKS middleware, CORS, outline computation). Track as cross-repo dependency.
2. **`outline_nodes` normalised table** — deferred; `intents.last_message_preview` snapshot is enough for v1 list views, real outline computed by claw on demand.
3. **Installer integrity verification** (SHA256 pin / GPG-signed commits) — explicitly out of scope per user direction. cloud-init trusts `raw.githubusercontent.com` over TLS.
4. **Custom partner landing pages** — out of scope.
5. **Free trial pool** — deferred phase.
6. **Multi-tenant partner_member accounts** — deferred.
7. **Intent sharing across users** — deferred; v1 single-user.
8. **AI-OS upgrade for existing fleet** — existing fleet untouched per user direction; opt-in rerun via GitHub installer + new tag.
9. **SDK / programmatic API for partners** — deferred.
10. **Compliance review (§17)** — must clear before partner onboarding.

---

## Appendix A — Sidebar layouts

```
super_admin (8 items)
┌─────────────────┐
│ ▷ Codes         │  ← landing
│   Partners      │
│   Users         │
│   Fleet         │
│   Billing       │
│   Audit         │
│   Install logs  │
│   Settings      │
└─────────────────┘

channel_partner (5 items, includes Profile)
┌─────────────────┐
│ ▷ Codes         │  ← landing
│   Customers     │
│   Billing       │
│   Profile       │
└─────────────────┘

end_user (no sidebar)
  /aios is full-bleed; "Install AI-OS" is a button on the empty state /
  list header. Account access stays in the existing AppShell user-menu.
```

---

## Appendix B — Files touched per phase

**P0 (test infra)**
- create: `playwright.config.ts`
- create: `tests/e2e/fixtures.ts`, `tests/e2e/auth.spec.ts` (smoke)
- create: `tests/contract/`, `tests/smoke/`
- modify: `.github/workflows/pre-merge.yml` (add e2e job)
- modify: PR template adds checkbox "tests added/updated"

**T1 (backfill missing tests for existing code)**
- create: `apps/api/src/controllers/claws/helpers/redeemActivationCode.test.ts`
- create: `apps/api/src/controllers/admin/createActivationCodeBatch.test.ts`
- create: `apps/api/src/controllers/claws/previewActivationCode.test.ts`
- create: `apps/api/src/services/expirySweeper.test.ts`
- create: `apps/api/src/controllers/cron/cleanupExpiredClaws.test.ts`
- expand: `apps/api/src/middleware/adminOnly.test.ts` (new role cases)

**P1 (RBAC + admin/partner UI split)**
- create: `apps/api/drizzle/<n>_rbac_partners.sql`
- create: `apps/api/src/db/schema/{channelPartners,partnerQuotas,auditLog,rateLimits,idempotencyKeys}.ts`
- create: `apps/api/src/middleware/{superAdminOnly,partnerOrSuperAdmin,centralTokenAuth,rateLimit,idempotency}.ts`
- create: `apps/api/src/controllers/admin/{listPartners,createPartner,suspendPartner,grantPartnerQuota,getAuditLog}.ts`
- create: `apps/api/src/controllers/partner/*` (codes / customers / billing scoped)
- modify: `apps/api/src/middleware/adminOnly.ts` → wraps `superAdminOnly`
- modify: `apps/api/src/controllers/admin/createActivationCodeBatch.ts` (partner_id + per-SKU quota check)
- create: `apps/web/src/pages/admin/*` (sidebar UI)
- create: `apps/web/src/pages/partner/*`
- modify: `apps/web/src/App.tsx` (route reshuffle, role-routed redirects)
- modify: `apps/web/src/components/layout/AppShell.tsx` (role-aware sidebar)
- create: `tests/e2e/p1-*.spec.ts` (8 scenarios from §11.2)

**P2a (extract installer)**
- new repo: `microblue/openclaw-installer` (public)
  - install.sh, lib/{00-phase-emit,10-base-system,20-openclaw-gateway,30-openclaw-studio,40-caddy-tls,99-finalize}.sh
  - release/CHANGELOG.md, README.md
  - .github/workflows/shellcheck.yml, smoke-install.yml
- modify: `apps/api/src/controllers/claws/helpers/generateCloudInit.ts`
- create: `INSTALLER_VERSION` row in admin_settings + read site
- modify: `apps/web/src/pages/admin/SettingsTab.tsx`
- create: `tests/e2e/p2a-install-*.spec.ts`

**P2b (animation + live logs)**
- create: `apps/api/drizzle/<n>_claw_install_phases.sql`
- create: `apps/api/src/db/schema/clawInstallPhases.ts`
- create: `apps/api/src/controllers/install/postInstallPhase.ts`
- modify: installer repo `lib/00-phase-emit.sh`
- create: `apps/web/src/pages/aios/install/{index,Progress}.tsx`
- create: `apps/web/src/hooks/useInstallPhaseSubscription.ts`
- create: `tests/e2e/p2b-*.spec.ts`

**P2c (provider split + container)**
- new repo: `microblue/openclaw-aios` (public Docker)
- create: `apps/api/src/services/providers/{base,vm,container}.ts` (interface refactor)
- modify: `apps/api/src/services/providers/{hetzner,lightsail,digitalocean}.ts` → extend VMProvider
- create: `apps/api/src/services/providers/fly.ts` (extends ContainerProvider)
- create: `apps/api/src/services/providers/curatedPlans/fly.ts`
- modify: `apps/api/src/services/providers/registry.ts`
- modify: `apps/api/src/db/schema/activationCodes.ts` (add credit_usd)
- modify: `apps/web/src/pages/aios/install/index.tsx` (family-aware form)
- create: `tests/contract/provider-conformance.test.ts`
- create: `tests/e2e/p2c-*.spec.ts`

**PRE-3 (auth bridge + CORS)** *(work in openclaw-studio repo)*
- studio: JWT/JWKS middleware, OWNER_USER_ID enforcement
- installer: CORS block in lib/40-caddy-tls.sh
- create: `tests/contract/jwks-validation.test.ts`

**P3 (Intent data)**
- create: `apps/api/drizzle/<n>_intents.sql`
- create: `apps/api/src/db/schema/{intents,intentAgents,intentArtifacts}.ts`
- create: `apps/api/src/controllers/intents/*.ts`
- studio repo: `GET /api/intent/:id/messages`, `GET /api/intent/:id/outline`
- create: `tests/e2e/p3-*.spec.ts`

**P4 (Intent UI)**
- create: `apps/web/src/pages/aios/IntentDetail/{ChatPane,OutlinePane,ArtifactPane,SubchatDrawer}.tsx`
- create: `tests/e2e/p4-*.spec.ts` (full Intent journey, 6 scenarios)

**P5 (cutover)**
- delete: `apps/web/src/pages/Admin/*` legacy tab UI (after 301 stable)
- delete: legacy `/claws` end-user dashboard route
- migration: `DROP COLUMN users.is_admin`
- create: `tests/e2e/p5-regression.spec.ts`
