# myclaw-aios — Build Plan

Ralph: work this list **top to bottom, one item per loop**. Each item
references the spec section that defines "done." Mark `[x]` when:
- code is on `main` + deployed to `app.myclaw.one`,
- the relevant e2e spec passes against the prod URL,
- a quick manual sanity check confirms the feature actually works.

Stop and emit `EXIT_SIGNAL: true` only when every item below is `[x]`,
mock-mode + real-mode e2e suites are 0-failure on prod, and a fresh
lay-user self-audit produces no new items.

---

## Phase A — Spec ↔ reality reconciliation

Audit each canonical spec against the shipped product and close gaps.
Re-read the spec each loop; **don't paraphrase from memory.**

- [ ] **A1.** Re-read `.ralph/specs/aios-design.md §4 (Data model
  changes)`. List every table/column the spec calls for vs what
  Supabase actually has (use `supabase gen types` output as truth).
  For each missing piece, decide: (a) skip if scope was already
  trimmed, (b) hand off to `~/myclaw` via `docs/handoff/`, or
  (c) implement now if aios-side only. Update this fix_plan with
  child items for each (b)/(c) decision.

- [ ] **A2.** Re-read `aios-design.md §6 (Intent runtime model)`. Verify
  the intent → claw → session mapping works end-to-end for: a fresh
  signup (only sentinel claw), a user with one real claw, a user
  with multiple real claws (mock the third case if no real one
  exists). Cover whichever shape isn't covered today.

- [ ] **A3.** Re-read `aios-ui-spec.md §3 (Surfaces shipped)` and tick
  off each surface against `src/routes/`. For any surface listed in
  the spec that doesn't exist as a route, write an item below to
  build it. For any route that exists but isn't in the spec, write
  an item to either remove it or document it.

- [ ] **A4.** Re-read `aios-ui-spec.md §10 (UX conventions)`. Audit the
  shipped UI for violations of lay-user-first principles:
  - No internal terms in user-visible copy (Intent / Agent / Skill / Orchestrator)
  - No CLI / terminal / monospace aesthetic
  - Settings/advanced folded away
  - Cmd+K accelerators every have a visible button equivalent
  - Errors are friendly natural language

  Write a fix_plan item for each violation found.

## Phase B — e2e coverage gaps

The current real-mode suite covers most happy paths but several
edge cases are under-tested.

- [ ] **B1.** **Real-mode chat: assistant-turn rendering edge cases.**
  Write specs for:
  - Code block with `js` language → renders monospace block
  - Table → renders as `<table>` with grid
  - Very long single line → wraps without horizontal scroll
  - Mid-stream user reload — page must show the persisted user
    message (the assistant turn may or may not have arrived)

- [ ] **B2.** **/now activity feed (real-mode).** The mock-driven
  "正在做" / "刚刚做完" rows are seeded by `agent_calls` /
  `agent_traces` in the spec but not in shipped DB. Either: (a)
  build the missing tables + populate from gateway events, or (b)
  collapse the section in real-mode and document the deferral.

- [ ] **B3.** **/schedule add-reminder real-mode.** Currently the
  composer toasts and doesn't persist. Per the spec the natural-
  language parser belongs in an agent. Three options: (a) ship a
  thin client-side parser for the simplest "每天 X 点提醒" cases,
  (b) wire it to the reminder agent via `sessions.send`, or (c)
  remove the input UI and replace with "请跟 reminder 助手说一句"
  copy. Pick one + add child items.

- [ ] **B4.** **/memory add-fact real-mode.** Similar gap: the UI
  only shows facts; users can't add their own. Spec calls for
  "用户手动加" via a button. Build the add-fact path + DB INSERT
  + e2e.

- [ ] **B5.** **Cross-browser sanity.** All current real-mode specs
  run on Chromium. Add the same auth-stub-based smoke pass on
  WebKit + Firefox for `/`, `/intent/<id>` chat-send, `/settings`
  signout (3 specs × 2 browsers = 6 new tests).

- [ ] **B6.** **Mobile real-mode chat with markdown.** Mobile chat
  works; verify markdown also renders correctly on mobile viewport
  (existing markdown spec is desktop-only).

## Phase C — Multi-agent orchestration polish

`main` can already delegate to specialists. Surface this in the UI.

- [ ] **C1.** **Show subagent attribution in chat.** When `main`
  delegates and the specialist's reply comes back, the assistant
  bubble should show the SPECIALIST's emoji/name, not main's.
  Listen for `agent` events with `stream=assistant` + read the
  sub-session's owning agent id from the runId. Write an e2e:
  send "帮我做计划,叫规划员来" → expect a turn attributed to
  `planner` 🗺️.

- [ ] **C2.** **"Team is working" inline strip.** While a delegation
  is in flight, show a small "🗺️ 规划员 正在拆步骤..." badge in
  the chat right after the user message. Disappears when the
  specialist's reply lands. Drives off the `agent` lifecycle
  events.

- [ ] **C3.** **Forbid orchestrator removal in TeamPanel.** Already
  has UX guard in `useRemoveTeamMember` (`'Claw 是默认主理人,不能
  移除'`). Add e2e that asserts: clicking the (hidden but DOM-
  present) remove button on main → friendly toast, no DB change.

- [ ] **C4.** **AgentPicker disabled state.** When the gateway is
  not connected (sentinel-only user / WS down), the picker should
  visually communicate "switching agents has no effect right now."
  Today it still opens and selecting still routes; in mock-mode
  the user picks but the route doesn't fire. Pick a behavior +
  test it.

## Phase D — Production-readiness

Things that must be solid before sharing the URL with anyone.

- [ ] **D1.** **`gateway_token` Vault key provisioning.** The
  migration `20260520000001_gateway_token_encryption.sql` is
  applied but the Vault secret `aios_gateway_token_key` hasn't
  been INSERT-ed (pooler role can't). Write
  `docs/handoff/vault-key-provision.md` with the exact Dashboard-
  SQL-Editor commands. Then mark this `[x]` only after the
  human confirms it's done.

- [ ] **D2.** **Token refresh under real load.** L11 covers mint
  401 / 409 / signed-out. Add: WS connection drops + reconnect
  picks up a fresh JWT (simulate by route-intercepting `/ws` to
  close after first frame).

- [ ] **D3.** **Sentry / observability.** Wire `@sentry/react`
  (production-only via `env.isProd` gate). Add a `__sentry_test_throw`
  button in `/settings/engines` (dev-mode-only) that throws + verify
  the error reaches Sentry. Skip if Sentry account creation requires
  human action — write a hand-off instead.

- [ ] **D4.** **GitHub Actions secrets check.** `.github/workflows/
  ci.yml` references `REAL_TEST_EMAIL` + `SUPABASE_*` secrets. Open
  https://github.com/microblue/myclaw-aios/settings/secrets/actions
  via `gh` CLI, list configured secrets, append missing ones to
  `docs/handoff/github-secrets.md` for human action.

- [ ] **D5.** **Rate-limit + abuse smoke.** Make sure 100 rapid
  message sends from one user don't crash the SPA + don't bypass
  OpenClaw's per-session rate limit (would burn LLM tokens). Add
  a test that fires 20 messages in quick succession + asserts the
  client surfaces a backoff toast.

## Phase E — Self-audit findings

Ralph appends discovered-during-self-audit items here. Each item must
include: surface, step that triggered it, expected vs actual.

(none yet)

---

## Done (for context, not for re-execution)

- [x] Phase 0-7: bootstrap → live at `app.myclaw.one` with real-mode chat,
  approvals, persistence, RLS, agent picker, agent team, markdown
  rendering, subagent delegation, custom domain + SSL.
- [x] 12 OpenClaw agents provisioned on cool-brook with full
  IDENTITY/SOUL/AGENTS files + Chinese display names.
- [x] CI pipeline `.github/workflows/ci.yml`.
