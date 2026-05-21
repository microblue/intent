# myclaw-aios — Build Plan

Top to bottom, one item per loop. Mark `[x]` only when: code on `main`
+ deployed to `app.myclaw.one` + relevant e2e green + manual sanity OK.
Pre-Ralph baseline in `docs/ralph-completed.md`. Rationale for tricky
items in `## Notes` at the bottom — read only when picking that item.

`EXIT_SIGNAL: true` only when all `[ ]` are `[x]`, both mock + real-mode
e2e are 0-failure on prod, and a fresh self-audit finds nothing.

---

## Phase A — Spec ↔ reality reconciliation

- [x] **A1.** Audit `specs/aios-design.md §4` against current Supabase
  schema (`supabase gen types` as truth). For each gap: skip / hand off
  to `~/myclaw` / implement aios-side. Append child items.
  - §4.1 RBAC + quota: `users.role` ✓ (no `is_admin`); `channel_partners` ✓; `partner_quotas` ✓; `activation_codes.partner_id` ✓
  - §4.2 Intent: `intents` ✓ (no `outline`; extras `cover`/`emoji`/`preview` are aios display-only and don't conflict with spec); `intent_agents` ✓ (PK + one-orchestrator unique); `intent_artifacts` ✓
  - §4.3 Install: `claws.install_run_id` ✓; `claw_install_phases` ✓
  - §4.4 Auth bridge: `claws.central_token` ✓
  - §4.5 SKUs: `activation_codes.credit_usd` ✓
  - No gaps. No child items required.
- [x] **A2.** Verify intent → claw → session per `aios-design.md §6`
  for: fresh signup (sentinel only), one real claw, multiple real
  claws. Cover whichever case isn't tested today.
  - Sentinel: `phase6-realmode-sentinel.spec.ts` ✓
  - Single real claw: `phase6-realmode-smoke.spec.ts` ✓
  - Multi real claws: new `phase6-realmode-multiclaw.spec.ts` —
    asserts picker shows oldest claw, sentinel banner hidden,
    new-intent FK targets oldest. Documents current single-claw UI
    + locks in oldest-wins fallback for when multi-claw picker lands.
- [ ] **A3.** Tick `aios-ui-spec.md §3` surfaces against `src/routes/`.
  Missing route → add item. Extra route → remove or document.
  - All 10 spec routes present in `src/router.tsx` ✓
  - 3 extras shipped (all legitimate, in active use):
    `/auth/signin`, `/auth/reset-password`, `/archive`.
  - Hand-off written: `docs/handoff/aios-ui-spec-3.1-extra-routes.md`
    asks `~/myclaw` to append the three rows to §3.1.
  - In-progress: mark `[x]` after spec is updated and hand-off file
    deleted; aios-side has no code change to make.
- [x] **A4.** Audit shipped UI against `aios-ui-spec.md §10`
  (lay-user-first rules). One fix_plan item per violation.
  - Rule 1 (no internal terms in primary copy): ✓ — only hit is
    `Engines.tsx:144` "Intent → Agents + Profile" in dev mode, which
    spec explicitly allows ("dev mode only").
  - Rule 3 (no CLI/monospace aesthetic): ✓ — `font-mono` only used in
    Markdown code rendering, `/help` concept catalog (allowed),
    activation-code input pattern, and `agent.key` trace annotation
    (allowed).
  - Rule 4 (friendly errors, no status codes): ✓ — no `40x`/`50x` /
    `HTTP \d` / "Error:" leaks in user-facing JSX strings.
  - Rule 5 (empty states with onboarding copy): ✓ — `/now`,
    IntentList, Memory, Schedule, Archive all have "here's what
    would go here" empty-state cards.
  - Rule 6 (Cmd+K accelerator parity): ✓ — every launcher action
    (new intent, open intent, message search, file search) is
    reachable via sidebar / IntentList grid.
  - Rule 7 (settings/advanced folded away): ✓ — dev mode at
    `/settings/engines` behind a Settings toggle.
  - Rule 8 (btn-md for primary CTAs): **✗ violation** — see A4.1.
- [x] **A4.1.** Promote primary-CTA button size from `btn-sm` → `btn-md`
  per `aios-ui-spec.md §10` rule 8 ("primary buttons are `btn-md` not
  `btn-sm`"). Confirmed lay-user-onboarding-critical instances:
  - `src/routes/Settings.tsx:82` — signed-out "登录" CTA (the entry
    point that drives signup → onboarding).
  - `src/routes/IntentList.tsx:135` — sentinel banner "去开一台 →" CTA
    (the load-bearing install nudge for new accounts).
  - `src/routes/IntentList.tsx:173` — onboarding welcome card
    "起一个新的 →" CTA.
  - `src/routes/Settings.tsx:361` and `src/routes/ResetPassword.tsx:101`
    — review for same treatment.
  Leave `btn-ghost btn-sm` secondary actions (toolbar / dropdown
  triggers / dismiss buttons) untouched; rule 8 calls out *primary*
  buttons. Update related e2e assertions if any check button size.

## Phase B — e2e coverage gaps

- [x] **B1.** Real-mode chat markdown edge cases: js code block, table,
  long-line wrap, mid-stream reload persistence.
  - New spec `e2e/phaseB1-markdown-edge.spec.ts` (4 tests, all green
    against `https://app.myclaw.one`).
  - JS code block: asserts `<pre><code>` with the function body; raw
    triple-backticks absent from rendered text.
  - GFM table: asserts `<thead>` × 3 headers + `<tbody>` × 3 rows;
    raw `| --- |` separator absent.
  - Long URL: asserts `scrollWidth ≤ clientWidth + 2` on the chat
    message so a 220-char unbreakable URL doesn't push the bubble
    wider than its panel.
  - Mid-stream reload: seeds a partial-shaped assistant message
    (unclosed `**` bold) → reload → verifies the message comes back
    from Supabase. Stand-in for "user reloaded mid-stream and didn't
    lose what the gateway already pushed."
- [ ] **B2.** `/now` activity feed (real-mode) — see Notes B2.
- [ ] **B3.** `/schedule` add-reminder real persistence — see Notes B3.
- [ ] **B4.** `/memory` add-fact path + DB INSERT + e2e.
- [ ] **B5.** Cross-browser smoke (WebKit + Firefox) for `/`,
  `/intent/<id>` chat-send, `/settings` signout. 6 new tests.
- [ ] **B6.** Mobile viewport markdown render spec.

## Phase C — Multi-agent orchestration polish

- [ ] **C1.** Subagent attribution in chat: specialist's reply shows
  specialist's emoji/name, not main's. e2e: planner delegation.
- [ ] **C2.** Inline "🗺️ 规划员 正在拆步骤..." badge during in-flight
  delegation, driven by `agent` lifecycle events.
- [ ] **C3.** e2e for orchestrator-removal guard in TeamPanel.
- [ ] **C4.** AgentPicker disabled state when gateway disconnected —
  see Notes C4.

## Phase D — Production-readiness

- [ ] **D1.** Write `docs/handoff/vault-key-provision.md` with exact
  Dashboard SQL to INSERT `aios_gateway_token_key` into Vault. Mark
  `[x]` only after human confirms it ran.
- [ ] **D2.** Token-refresh e2e: WS close mid-stream → reconnect picks
  up fresh JWT.
- [ ] **D3.** Wire `@sentry/react` prod-only via `env.isProd`. Dev-only
  test-throw button in `/settings/engines`. Hand-off doc if Sentry
  account needs human creation.
- [ ] **D4.** Audit `gh secret list --repo microblue/myclaw-aios`
  against `.github/workflows/ci.yml`. Missing → write
  `docs/handoff/github-secrets.md`.
- [ ] **D5.** Rate-limit smoke: fire 20 messages in quick succession,
  assert client surfaces backoff toast, no LLM-token blowup.

## Phase E — Self-audit findings

Append discovered items here. Format: surface · step · expected vs
actual.

(none yet)

---

## Notes (rationale, only read when picking the item)

**B2.** Spec calls for `agent_calls` / `agent_traces` tables to drive
the activity feed. Tables don't exist in shipped DB. Pick: (a) build
them + populate from gateway events, or (b) collapse the section in
real-mode + document deferral.

**B3.** Composer currently toasts and doesn't persist. Spec says NL
parser belongs in an agent. Pick: (a) thin client-side parser for
"每天 X 点提醒", (b) wire to reminder agent via `sessions.send`, or
(c) remove input + "请跟 reminder 助手说一句" copy.

**C4.** Today the picker opens and routes even when WS is down. In
mock-mode the route never fires. Pick a behavior (disable picker / no-op
quietly / friendly toast) and test it.
