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
- [x] **B2.** `/now` activity feed (real-mode) — see Notes B2.
  - Picked option (b): collapse mock running/done buckets in
    real-mode; approvals stay (they're real). `src/routes/Now.tsx`
    gates `running` and `done` arrays behind `approvalsMock`, and
    the PageHeader subtitle drops "件在跑 · 件刚做完" in real-mode.
  - New e2e `e2e/phaseB2-now-realmode.spec.ts` (2 tests) locks in
    the collapse against `https://app.myclaw.one`.
  - Deferral handoff written:
    `docs/handoff/now-running-done-tables.md` — describes the
    `agent_calls` / `agent_traces` schema work that needs to land
    in `~/myclaw` before the buckets come back.
- [x] **B3.** `/schedule` add-reminder real persistence — see Notes B3.
  - Picked option (c): removed the toast-only NL composer; spec
    says natural-language time parsing belongs in a reminder agent,
    and the SPA was lying ("已记下" with nothing persisted).
  - `src/routes/Schedule.tsx` now shows a hint card pointing at the
    chat path ("跟某件事里的助手说一句"), with a CTA `➕ 起一件新事`
    that links to `/new`. Empty-state copy tightened.
  - e2e updates: `phase11-14-data-swap.spec.ts` and
    `phaseL2-data-surfaces.spec.ts` assert the new hint card +
    CTA + composer-gone. Real-mode L2 green on prod.
  - Deferral handoff: `docs/handoff/schedule-reminder-agent.md`
    describes the reminder agent + non-intent gateway routing work
    that needs to land in `~/myclaw` before the form comes back.
- [x] **B4.** `/memory` add-fact path + DB INSERT + e2e.
  - New `useAddMemoryFact()` mutation in `src/data/useMemoryFacts.ts`
    INSERTs into `public.memory_facts` and invalidates the list
    query. Real-mode persists; mock-mode reuses the existing
    "演示模式" rejection message.
  - `src/routes/Memory.tsx` now renders an `AddFactComposer` above
    the category groups: free-text input + 4-button category chips
    (`关于你` / `你的偏好` / `重要的人` / `项目相关`) + submit button.
    Input clears on success; toast confirms either path.
  - New e2e `e2e/phaseB4-memory-add.spec.ts` (mock-mode + real-mode)
    asserts composer render, chip toggling, INSERT visibility, and
    input-clear. Real-mode test cleans up via service-role DELETE
    by `text` match. 2 passed against `https://app.myclaw.one`.
- [x] **B5.** Cross-browser smoke (WebKit + Firefox) for `/`,
  `/intent/<id>` chat-send, `/settings` signout. 6 new tests.
  - `playwright.config.ts` now defines `firefox` + `webkit` projects
    with `testMatch: ['**/phaseB5-*.spec.ts']`; chromium + mobile
    projects `testIgnore` the same so we don't double-cover.
  - New spec `e2e/phaseB5-cross-browser.spec.ts` (3 tests × 2
    browsers = 6 runs): `/` renders + IntentList CTA; `/intent/birthday`
    chat-send adds the user bubble + clears composer; `/settings`
    signout via `stubSupabaseSession` clears `sb-` localStorage +
    redirects to `/auth/signin`.
  - Mock-mode only by design (production is real-mode → spec
    auto-skips against `https://app.myclaw.one`); the existing
    chromium realmode specs cover the same paths on prod.
  - 6/6 passed locally against `vite preview` on Firefox + WebKit.
- [x] **B6.** Mobile viewport markdown render spec.
  - New `e2e/phaseB6-mobile-markdown.spec.ts` (3 tests) runs on the
    `mobile` project (Chromium 390×844). Each test seeds an assistant
    message via service-role INSERT and asserts:
    1. Long unbreakable URL — bubble doesn't overflow + page
       `documentElement.scrollWidth ≤ clientWidth + 2`
    2. GFM table — thead + 2 rows render + no horizontal page scroll
    3. Fenced JS code block — `<pre>` can scroll horizontally inside
       (overflow-x-auto), page itself does not scroll horizontally
  - Real-mode against `https://app.myclaw.one` → 3 passed, 0 failed.

## Phase C — Multi-agent orchestration polish

- [x] **C1.** Subagent attribution in chat: specialist's reply shows
  specialist's emoji/name, not main's. e2e: planner delegation.
  - Read path was already correct (`AssistantMessage` calls
    `findBuiltinAgent(message.agentId)` for emoji/name). Bug was on
    the write path: `useGatewayChat` hard-coded the session-owner
    `agentId` on every upsert + Supabase INSERT, so a delegated
    subagent's reply inherited "main" instead of e.g. "planner".
  - Fix: chat handler now reads `payload.message.agentKey` (or
    top-level `payload.agentKey`) per turn and falls back to the
    session-owner `agentId` only when neither is present. Forward-
    compat with OpenClaw emitting per-turn attribution; preserves
    current behavior until it does.
  - New e2e `e2e/phaseC1-subagent-attribution.spec.ts` seeds two
    assistant turns (main + planner) via service-role INSERT and
    asserts the second has `data-agent-id="planner"` + header text
    "规划员" + emoji "🗺". Green on `https://app.myclaw.one`.
- [x] **C2.** Inline "🗺️ 规划员 正在拆步骤..." badge during in-flight
  delegation, driven by `agent` lifecycle events.
  - New `useAgentActivity(intentId)` hook subscribes to `agent.start`
    / `agent.done` / `agent.error` gateway events with intentId
    scoping + 60s auto-clear safety net.
  - New `phaseVerbFor(agentKey)` in `lib/agents` maps known
    specialists to verb phrases (planner→"正在拆步骤",
    researcher→"正在查资料", …) with "正在想…" fallback.
  - `TypingIndicator` upgraded to render `{emoji} {name} {verb}`
    + `data-testid="typing-indicator"` + `data-agent-key`. Wired
    through both Desktop + Mobile IntentHome via `agentActivity` prop.
  - Test escape hatch on `window.__aios.emitGatewayEvent(event,
    payload)` (src/main.tsx) lets e2e drive synthetic events
    without a live OpenClaw.
  - New `e2e/phaseC2-agent-activity.spec.ts` (3 tests) — planner
    start/done, unknown-agent fallback, cross-intent isolation. All
    green locally; phase8 + C1 regression suites stayed green on
    prod after deploy.
- [x] **C3.** e2e for orchestrator-removal guard in TeamPanel.
  - New `e2e/phaseC3-team-orchestrator-guard.spec.ts` covers both
    layers of the guard:
    - UI layer (mock-mode): `team-member-main` mounts with "主理"
      tag; `team-remove-main` testid has count 0 — no remove path
      exists for the orchestrator.
    - Real-mode: seeds an intent with main + planner via service-
      role INSERT into `intent_agents`. Both rows render; main has
      no remove button, planner does.
  - Mock-mode green locally; real-mode green against
    `https://app.myclaw.one`.
- [x] **C4.** AgentPicker disabled state when gateway disconnected —
  see Notes C4.
  - Picked option (a) "disable picker". `StickyComposer` now reads
    `useGateway().{status, isMock}` and passes
    `disabled = !isMock && status !== 'connected'` to AgentPicker.
    Mock-mode stays enabled (the demo doesn't pretend to route);
    real-mode disables while the WS is not connected.
  - AgentPicker trigger gains `aria-disabled` + a friendly tooltip
    "等连上 claw 才能切换助手" + `disabled:cursor-not-allowed` styling.
  - New `e2e/phaseC4-agentpicker-disconnected.spec.ts`:
    - mock-mode: trigger is enabled, no aria-disabled.
    - real-mode (prod): `page.route('**/functions/v1/mint-claw-token')`
      → 503 → gateway never reaches `connected` → trigger is
      disabled with the right title + clicking doesn't open the menu.
  - Real-mode green against prod; phase8 + phase7 agent-picker
    regression suites both stayed green (19 passed) after deploy.

## Phase D — Production-readiness

- [ ] **D1.** Write `docs/handoff/vault-key-provision.md` with exact
  Dashboard SQL to INSERT `aios_gateway_token_key` into Vault. Mark
  `[x]` only after human confirms it ran.
  - Hand-off written: `docs/handoff/vault-key-provision.md`.
    Covers the 3-step provisioning (Vault INSERT + bulk-encrypt
    self-update + spot-check via SPA + ClawStatus connected),
    verification queries, the future column-drop migration, and the
    rollback DELETE.
  - Migration source-of-truth referenced:
    `~/myclaw/supabase/migrations/20260520000001_gateway_token_encryption.sql`
    (trigger + decrypt RPC already in place; short-circuit until
    Vault key lands).
  - In-progress: aios-side has nothing to ship. Flip `[x]` after DZ
    runs the SQL on the myclaw-v2 Supabase project and confirms
    `plaintext_remaining = 0` + real-mode smoke green.
- [x] **D2.** Token-refresh e2e: WS close mid-stream → reconnect picks
  up fresh JWT.
  - `__simulateGatewayWsCloseForTests` test escape hatch on
    `window.__aios` (src/main.tsx → src/gateway/useGateway.ts →
    `GatewayClient.__simulateWsCloseForTests`) lets the spec close the
    live WS without touching the network. Default close code is **4000**
    (application-defined, 3000–4999 range) — `ws.close(1006)` throws
    InvalidAccessError per the WHATWG WebSocket spec, so the original
    1006 try/catch silently no-op'd and the reconnect path never ran.
  - New `e2e/phaseD2-token-refresh.spec.ts`: wait for initial connect,
    snapshot `mint-claw-token` call count via `context.route`
    pass-through, fire `simulateGatewayWsClose()`, poll for an
    additional mint call, then assert ClawStatus is back at `connected`.
    Skips the transient non-connected state observation because the
    reconnect cycle (close → reconnecting → connecting → connected)
    passes through faster than one DOM tick on prod — the durable
    assertions are the extra mint + the final connected status.
  - Green against `https://app.myclaw.one` (5.6s); the phase8 +
    C4 regression sweep stayed green (19 passed) after deploy.
- [ ] **D3.** Wire `@sentry/react` prod-only via `env.isProd`. Dev-only
  test-throw button in `/settings/engines`. Hand-off doc if Sentry
  account needs human creation.
  - `@sentry/react` installed; `src/lib/sentry.ts` exposes `initSentry()`
    (no-op unless `env.isProd && env.sentryDsn`) and `throwTestError()`.
    Wired from `src/main.tsx` before `createRoot`. Errors-only init
    (`tracesSampleRate=0`, both replay rates = 0); `beforeSend` drops
    `AuthSessionMissingError` so sign-out is silent.
  - Dev-only test-throw button at `/settings/engines` (gated on
    `env.isDev`, `data-testid="sentry-test-throw"`).
  - Bundle stayed at ~1MB (`import * as Sentry` tree-shakes since only
    `Sentry.init` is referenced).
  - Hand-off written: `docs/handoff/sentry-setup.md` — covers org/project
    creation, `vercel env add VITE_SENTRY_DSN production`, and the redeploy.
  - In-progress: aios-side has nothing to ship. Flip `[x]` after DZ
    runs through the hand-off and a real prod error lands in Sentry.
- [ ] **D4.** Audit `gh secret list --repo microblue/myclaw-aios`
  against `.github/workflows/ci.yml`. Missing → write
  `docs/handoff/github-secrets.md`.
  - Audit done: `gh secret list` is empty; `ci.yml` references 4
    secrets (`REAL_TEST_EMAIL`, `SUPABASE_URL`, `SUPABASE_PUB_KEY`,
    `SUPABASE_SERVICE_ROLE_KEY`) in the `realmode-e2e-prod` job. All 4
    missing — that job has been silently skipping real-mode coverage
    on every push to `main`. `typecheck-and-build` + `mock-e2e` are
    unaffected (they use inline placeholders).
  - Hand-off written: `docs/handoff/github-secrets.md` — covers the 4
    secrets, their canonical source paths in
    `~/.openclaw/credentials/myclaw-supabase.env`, and the
    `printf '%s' "$VAR" | gh secret set NAME --repo ...` snippets that
    keep values out of shell history.
  - In-progress: aios-side has nothing to ship. Flip `[x]` after DZ
    runs the snippets and the next push produces a green
    `realmode-e2e-prod` job.
- [x] **D5.** Rate-limit smoke: fire 20 messages in quick succession,
  assert client surfaces backoff toast, no LLM-token blowup.
  - New `src/lib/rateLimit.ts:createSendRateLimiter()` — sliding-window
    limiter, 5 sends per 10s, ~30 LOC, zero deps. Window numbers chosen
    to let real multi-turn dialog ("yes", "no", "go on") through while
    catching `for (i=0;i<20;i++)`-shape spam after ~5 sends.
  - `useChatThread.send` in `src/routes/IntentHome.tsx` holds the
    limiter in a `useRef` and short-circuits **before** any
    persistence / gateway call when blocked, so no token is burned.
    Friendly toast (`发得太快啦, 稍等 N 秒再说 🐌`) uses a stable
    `id: 'chat-rate-limit'` so a burst of 15 blocked sends produces
    one toast, not fifteen.
  - New `e2e/phaseD5-rate-limit.spec.ts` (mock-mode, desktop): fires
    20 rapid sends at `/intent/birthday`, asserts ≤5 with the unique
    tag land in the thread + the backoff toast surfaces.
  - Bundle held at ~1MB (1116.35 → 1116.79 KB, +0.44 KB). Regression
    sweep on prod (phase8 console-clean) stayed green (10/10).
    coverage-fillin + phase10 chat-send tests stayed green (27 pass).

## Phase E — Self-audit findings

Append discovered items here. Format: surface · step · expected vs
actual.

- [ ] **E1.** `/new` · click 🎙️ 说一句 voice button · expected: a
  friendly "coming soon" nudge in the app's normal toast style ·
  actual: fires browser-native `alert('语音输入开发中')`
  (`src/routes/NewIntent.tsx:594`). Native `alert()` feels like a
  status-code error popup and is inconsistent with the rest of the
  app's `sonner` toasts. Per CLAUDE.md lay-user rules ("no half-finished
  implementations" + "friendly natural-language suggestions, not status
  codes"), either remove the button entirely until voice ships, or
  swap `alert()` for a `toast('稍后再来,语音还在做 🎙️')`. Prefer removal
  to keep the surface honest.
- [ ] **E2.** `/now` · land here with nothing pending · expected: a
  clear empty state (already present), no element that looks
  clickable-but-isn't · actual: the empty-state final line "去看看你正在做的事 →"
  (`src/routes/Now.tsx:64–66`) is a static `<p>` that ends with the `→`
  arrow glyph. A lay user reads it as a CTA and tries to tap it; nothing
  happens. Either wrap the text in a `<Link to="/">` (the intent list is
  where "你正在做的事" lives) or drop the arrow so the line reads as
  descriptive copy, not a button.

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
