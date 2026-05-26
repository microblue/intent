# myclaw-aios — Build Plan (v3, persona+journey)

Top to bottom, one item per loop. Mark `[x]` only when:
- code on `main` + deployed to `app.myclaw.one`,
- the relevant journey spec passes against prod,
- mock-guard fired 0 times in the related real-mode walkthrough.

**No punting** — see PROMPT.md "Hard ban: no punting." Failing a
`pass_criteria` line is not an option to be debugged into a softer
assertion; the criterion is the contract.

`EXIT_SIGNAL: true` only when (a) zero open `[ ]` and `## Deferred`
items, (b) all journeys pass on prod, (c) mock-guard 0 firings in any
real-mode run, (d) three consecutive full cycles produce zero new
findings.

Previously-completed work lives in `docs/ralph-completed.md`.

---

## Phase K — Journey specs (build these first)

For each journey file under `.ralph/journeys/`, write the matching
Playwright spec. Each `pass_criteria` line is a separate `expect(...)`.

- [x] **K1.** `e2e/journey-01-mom-remember-allergy.spec.ts` —
  cross-intent memory recall. Will fail until L1 lands the auto-extract path.
- [x] **K2.** `e2e/journey-02-reminder-fires.spec.ts` — schedule
  firing with `page.clock` mocked forward. Will fail until L2 lands a
  firing sink.
- [x] **K3.** `e2e/journey-03-new-intent-handoff.spec.ts` — /new
  clarifying answers must reach /intent's chat as user message. Will
  fail until L3 lands.
- [x] **K4.** `e2e/journey-04-rail-honest-numbers.spec.ts` —
  cross-component number consistency + zero mock-guard firings on
  /intent. Will fail until L4–L7 land.
- [x] **K5.** `e2e/journey-05-overlay-and-interactivity.spec.ts` —
  click-stress every interactive element + overlap check on every
  opened dropdown. Will fail until L8 lands.

## Phase L — Make the journeys pass (one bug per item)

### L1. Memory auto-record (closes journey 01)

- [x] **L1.** UI promises "我会顺手把重要的事写下来" but no code path
  extracts memory candidates from chat. Build it:
  - On each user message INSERT, run a lightweight candidate
    extractor (keyword + LLM call via existing gateway path).
  - For each candidate, render a "我把这件事记下来好吗?" confirm
    card next to the message. On ✓ → INSERT into `memory_facts` with
    `origin_intent_id = current_intent.id`.
  - Cross-intent recall: before sending any chat message, fetch the
    user's `memory_facts` (categories `about-you` / `people` /
    `preferences`) and prepend a compact summary into the gateway's
    system context.
  - Acceptance: journey 01 passes — sending "对花生过敏" in intent A
    then "给女儿带零食" in intent B causes assistant to acknowledge
    the allergy.
  - If LLM extraction is too heavy for this scope, fall back to a
    regex-based "remember that I/my <noun>" detector; ship that
    first.

### L2. Schedule firing (closes journey 02)

- [x] **L2.** Reminders never fire today. Build the firing sink:
  - Phase A (in-SPA polling): `useScheduleEvents` starts a
    `setInterval(60_000)` that scans for rows WHERE `user_id = me AND
    status='pending' AND fire_at <= NOW()`, surfaces an in-app toast +
    optional browser notification, and UPDATEs `status='fired'`.
  - Phase B (offline reach): hand-off to `~/myclaw` for a pg_cron
    job + Edge Function that pushes via the user's preferred channel
    (Telegram if set, else email). Hand-off doc OK for the cron
    piece; SPA polling must ship in this repo.
  - Acceptance: journey 02 passes — submitted reminder lands a
    toast within the polling window with `data-testid="reminder-fired"`.

### L3. /new → /intent chat handoff (closes journey 03)

- [x] **L3.** /new flow discards prompt + clarifying answers on
  navigate. Build the handoff:
  - intentRoute `validateSearch` accepts `kickoff?: string`.
  - NewIntent's `goSpawn` composes a markdown kickoff message
    (`{prompt}\n\n我已经准备好了:\n- {q1}: {a1}\n- {q2}: {a2}\n…`)
    and navigates with `search: { kickoff }`.
  - IntentHome reads `useSearch().kickoff` in a once-only effect,
    calls `chat.send(kickoff)`, then navigates `replace: true` with
    `search: {}` to prevent re-sending on refresh.
  - Acceptance: journey 03 passes.

### L4. TeamPanel ↔ AgentPicker consistency (closes part of journey 04)

- [x] **L4.** AgentPicker imports `BUILTIN_AGENTS` (12 personas);
  TeamPanel reads `intent_agents` (variable, 1–N). They disagree.
  Fix:
  - AgentPicker consumes the same `useIntentTeam(intentId)` hook
    TeamPanel uses; its dropdown lists ONLY the team.
  - Add an explicit "+ 加入助手" CTA at the bottom of TeamPanel that
    opens the full BUILTIN_AGENTS catalog as a picker (existing
    `AgentCatalogPicker` already does this — wire it).
  - Acceptance: journey 04 step 2 vs step 3 — AgentPicker list ⊆
    TeamPanel list and equal in size.

### L5. TeamPanel rows clickable → switch active agent (closes journey 04 step 6)

- [x] **L5.** Add an onClick to each TeamPanel member row:
  - Click row → `onPickAgent(agentKey)` → updates `useChatThread`'s
    `activeAgentId`.
  - Visual: active member shows a `ring-2 ring-primary` and a "正在
    说话" badge.
  - Long-press / right-click → opens a per-agent info popover (name,
    emoji, what-it's-good-at, recent traces with this intent).
  - Acceptance: journey 04 step 6 passes — clicking specialist in
    TeamPanel changes AgentPicker's selected value and the next
    chat send routes to that specialist.

### L6. Real-mode rail data — agent count (closes part of journey 04)

- [x] **L6.** Add `useIntentTeam(intentId)` real-mode read (already
  exists per L4) and replace the `counts.agents` call site at
  `IntentHome.tsx:1339` with `useIntentTeam(intent.id).team.length`.
  - Acceptance: 助手团队 stat row meta reads N where N = real
    `intent_agents` row count; mock-guard fires 0 times for this
    path.

### L7. Real-mode rail data — outline / files (closes rest of journey 04)

- [ ] **L7.** Build `useIntentArtifacts(intentId, kind?)`:
  - Real mode reads `public.intent_artifacts` filtered by user + intent
    + optional kind ∈ `{outline_node, file, plan_step, …}`.
  - Mock mode returns the existing mock arrays via `outlineFor` /
    `filesFor` so mock-mode pages still render.
  - Replace every IntentHome call site of `outline.length` /
    `files.length` / `counts.outlineDone` / `counts.outlineTotal` /
    `counts.files` with the hook's data.
  - If `intent_artifacts` is empty (most real intents are early in
    their lifecycle), the UI shows the empty state, not "0/0" or
    "0 个" — there's no plan/file YET, not "no plan."
  - Acceptance: journey 04 steps 4–5 pass; mock-guard fires 0 times
    for outlineFor / filesFor in real-mode walkthrough.

### L8. Overlay + interactivity sweep (closes journey 05)

- [ ] **L8.** Sidebar collapsed account dropdown extends past sidebar
  right edge and gets covered by chat composer. Plus assorted
  decorative-only buttons. Fix in one sweep:
  - AppShell sidebar Panel gets `relative z-10`, content Panel gets
    `relative z-0` (stacking context for dropdowns).
  - Bump all `dropdown-content` from `z-50` to `z-[60]`.
  - StickyComposer's `z-10` stays (needed inside chat pane) but
    chat-pane's parent gets `relative z-0` so it can't overlay
    sidebar.
  - Audit every element with cursor-pointer / hover-highlight / ring
    classes that lacks an onClick → either add a handler or remove
    the visual affordance.
  - Acceptance: journey 05 passes — overlap check across every
    opened dropdown returns 0 overlaps > 4px.

## Phase M — Honest UI copy

If a feature's implementation is genuinely deferred (e.g. user accepts
delay on memory auto-record), the UI copy must reflect that — don't
promise what we can't keep.

- [ ] **M1.** Audit every `subtitle` / hint / empty-state copy on
  `/memory`, `/schedule`, `/now`, `/permissions` for promises that
  imply automation. For each, EITHER build the implementation (Phase
  L) OR rewrite the copy to match what actually happens. The bar:
  if a user reads the copy and waits 5 minutes for it to happen, the
  expected thing must happen.

## Phase N — Self-audit findings (append-only)

Append items discovered during journey runs or walkthroughs.

(none yet)

---

## ## Deferred (read PROMPT.md "Explicit defer protocol" before adding)

### I3 (D3) — Sentry observability signup

> reason: User does not want third-party error monitoring right now.
> Code wired (`src/lib/sentry.ts` + dev-only test button); no-op
> without DSN, so no UI to remove.
> reopen when: User decides production error visibility is worth the
> third-party dependency.
> accepted-by: DZ (microblue@gmail.com), 2026-05-22.

---

## Notes (rationale, only read when picking the item)

**Why journeys come first (Phase K before L):**
Writing the spec first locks the acceptance contract. When the fix
ships, we already have the proof-of-correctness ready. This also
prevents lowering criteria mid-fix.

**Why mock-guard is non-negotiable:**
The previous run shipped pages that displayed "0 位 / 0 个" in real
mode because the data layer was silently reading mocks. The guard
makes this impossible to ship — any walkthrough that triggers a guard
firing fails CI.

**L4 vs L5 ordering:**
L4 fixes the data inconsistency; L5 fixes interactivity. Together
they make journey 04 pass. Land L4 first because a clickable row that
points to a phantom agent (i.e. one in BUILTIN_AGENTS but not in the
team) would be worse than nothing.
