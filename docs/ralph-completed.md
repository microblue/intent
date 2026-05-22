# Ralph completed work — historical log

Items Ralph has marked `[x]` and the upstream context for them. Append
here when an item closes; do not keep this in `.ralph/fix_plan.md`
where it would be re-read every loop.

## Pre-Ralph (Phase 0-7 baseline)

- Bootstrap → live at `app.myclaw.one` with real-mode chat, approvals,
  persistence, RLS, agent picker, agent team, markdown rendering,
  subagent delegation, custom domain + SSL.
- 12 OpenClaw agents provisioned on cool-brook with full
  IDENTITY/SOUL/AGENTS files + Chinese display names.
- CI pipeline `.github/workflows/ci.yml`.

## Run 1 (2026-05-21, 132 loops) — genuinely completed

These items were validated by reviewing the actual code change in git
log; they shipped real feature work, not deletion/punt:

- **A1** Supabase schema audit vs `aios-design.md §4` — no gaps.
- **A2** intent → claw → session coverage for sentinel/single/multi.
- **A4** Lay-user-first rules pass (rule-by-rule code audit).
- **B1** Real-mode chat markdown edge cases (code, table, long URL, reload).
- **B4** `/memory` add-fact composer with direct `memory_facts` INSERT.
- **B5** Cross-browser smoke (Firefox + WebKit, 6 tests).
- **B6** Mobile-viewport markdown render spec.
- **C1** Subagent attribution propagated from gateway payload.
- **C2** Inline subagent in-flight badge.
- **C3** Orchestrator-removal guard in TeamPanel (e2e).
- **C4** AgentPicker disables when gateway not connected.
- **D2** WS-close → re-mint → reconnect verified.
- **D5** Client-side send rate-limit + backoff toast.
- **E2** `/now` empty-state CTA is a real link.
- **E5** Dock 我的 avatar derived from session.
- **E6** Modal close buttons get sr-only 关闭 + aria-label.
- **E7** `friendlyError()` helper unifies 14 toast sites.
- **E8** Friendly errors propagated to JSX/toast error blocks.
- **E9** Memory + Schedule render skeletons during in-flight load.
- **E10** Launcher mock 最近的对话 + 文件 groups hidden in real-mode.
- **E11** Dock 通知 badge driven by `useApprovals()`.
- **E12** Disconnected-send toast.
- **E13** Chat auto-scroll to latest message.
- **E14** ClawPicker + ClawStatus tooltips routed through friendlyError.
- **E15** Approval action buttons promoted to btn-md.
- **E16** Schedule add-hint CTA promoted to btn-md primary.
- **L2** Memory category-headings spec seeds a fact first.
- **Phase 3 launcher** test waits for page render before Cmd+K press.

## Run 1 — closed via patterns now banned (reopened as G1-G5)

These were marked `[x]` by deleting / collapsing / replacing-with-hint.
The PROMPT was updated post-run to ban this; they live in Phase G of
the new fix_plan to be rebuilt for real:

- **B2** → `/now` activity feed (was: collapsed in real-mode). Reopened as G1.
- **B3** → `/schedule` NL reminder composer (was: chat-path hint). Reopened as G2.
- **E1** → voice button on `/new` (was: deleted). Reopened as G3.
- **E3** → 📎 chat attachment (was: deleted). Reopened as G4.
- **E4** → 导出 row in Settings (was: deleted). Reopened as G5.

## Run 1 — hand-offs still open (Phase I)

- A3 — `aios-ui-spec.md §3.1` extra-routes append (sibling repo).
- D1 — Vault secret INSERT (Supabase Dashboard owner role).
- D3 — Sentry account + DSN env var (human signup).
- D4 — `gh secret set` × 4 (CI secrets).

## Run 2 (2026-05-22, ~80 loops) — genuinely completed

PROMPT v2 hardened against punting. Net delivered:
- F1-F13 walkthroughs (13 specs)
- G1-G5 reopened items built for real (`/now` activity feed real, `/schedule` NL parser, voice via Web Speech API, attachments via Supabase Storage + multimodal jsonb, Settings 导出 client-side)
- H1-H7 lay-user readiness (install flow, multi-claw picker, AgentPicker name+emoji audit, empty-state CTAs, skeleton loading, ErrorPanel/retry on every async surface, mobile fixes)
- I1, I2, I4 hand-offs satisfied (sibling spec, Vault key INSERT, GH secrets)

EXIT_SIGNAL fired Loop #5 (cycle 3) but methodology had blind spots —
real-mode pages were silently reading mocks, journey-level promises
were unchecked, and decorative-but-non-functional buttons passed
walkthroughs because they had aria-labels.

## Run 2 — gaps that motivated v3

These were not in fix_plan but were found in DZ's hands-on session:
- Sidebar collapsed account dropdown overlaid by chat composer
- /new clarifying answers discarded on navigate to /intent
- Memory copy promises auto-recording, no code path exists
- Schedule reminders never fire (no sink, no cron)
- TeamPanel rows look clickable, no handler
- TeamPanel agent count and AgentPicker list disagree
- 助手团队 stat row shows "0 位" (reads conceptCountsFor mock)
- 大纲/进度/文件 all show 0 in real mode (read mocks)

→ v3 introduces mock-guard, persona journeys, cross-component
consistency checks, interactivity follow-through assertions.
