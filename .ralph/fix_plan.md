# myclaw-aios — Build Plan (revised after first-run audit)

Top to bottom, one item per loop. Mark `[x]` only when: code on `main`
+ deployed to `app.myclaw.one` + relevant e2e green + **headless
browser walkthrough clean** (see PROMPT.md "Walkthrough protocol").

**No punting** — see PROMPT.md "Hard ban: no punting." Items previously
"closed" by deleting the UI or writing a deferral have been reopened
below.

`EXIT_SIGNAL: true` only when (a) zero open `[ ]` and `## Deferred`
items, (b) mock + realmode e2e 0-fail on prod, (c) 3 consecutive full
walkthrough cycles produce zero new findings.

Pre-Ralph baseline + first-run completed items in
`docs/ralph-completed.md`.

---

## Phase F — Deep surface walkthrough (do this first)

For each route, write `e2e/walkthrough-<route>.spec.ts` that:
- Signs in with `injectRealSession()`
- Navigates and takes a full-page screenshot at desktop + mobile viewport
- Enumerates every interactive element via the selector in PROMPT.md
- For each element, asserts visible label OR aria-label is non-empty
- Clicks each element (or a representative subset) and asserts something
  observable happens (URL change, modal opens, network request, toast)
- Ralph then **reads the screenshots** and looks for: placeholder copy
  ("敬请期待" / "Coming soon" / "TODO"), English leakage, broken
  layouts, decorative buttons that do nothing, mock data visible in
  real-mode.

Each `[ ]` here closes when (a) the spec passes, (b) the screenshots
look correct under Ralph's read, (c) every finding it surfaces has
either been fixed or filed as a new Phase H/J item.

- [x] **F1.** `/` (IntentHome) — desktop + mobile
  - Spec: `e2e/walkthrough-home.spec.ts`. Real-mode chromium + mobile.
  - Asserts every interactive element has aria-label or visible text.
  - Screenshots: `test-results/walkthrough-home-{desktop,mobile}.png`.
  - Ralph read both — no placeholder copy, no English leakage, no
    decorative buttons. Click smoke opens Launcher.
- [x] **F2.** `/intent/<id>` — chat surface, both empty and with history
  - Spec: `e2e/walkthrough-intent.spec.ts`. Real-mode chromium + mobile,
    creates throwaway intents (empty + 2-turn seeded) per pass and
    cleans up in finally.
  - Asserts every interactive element has an accessible name.
  - Screenshots: `test-results/walkthrough-intent-{desktop,mobile}-{empty,history}.png`.
  - Ralph read all four — empty-state copy is friendly, chrome buttons
    all labelled, message bubbles render correctly, composer send button
    is disabled-correctly when empty. No findings.
- [ ] **F3.** `/new` (NewIntent)
- [ ] **F4.** `/schedule`
- [ ] **F5.** `/memory`
- [ ] **F6.** `/permissions`
- [ ] **F7.** `/now`
- [ ] **F8.** `/settings`
- [ ] **F9.** `/help`
- [ ] **F10.** `/archive`
- [ ] **F11.** `/settings/engines` (dev mode)
- [ ] **F12.** `/auth/signin`
- [ ] **F13.** `/auth/reset-password`

## Phase G — Reopened (was punted in run 1)

Previous Ralph closed these by deleting / collapsing / hint-text. Build
the real feature. If you genuinely cannot, follow the explicit defer
protocol in PROMPT.md — **do not delete** the UI surface again.

- [ ] **G1.** `/now` activity feed — real implementation. Either:
  - Build `agent_calls` + `agent_traces` tables (hand-off to `~/myclaw`
    is acceptable for the migration, but the SPA-side wiring + insert
    on gateway events lives here), OR
  - Source the data from the `messages` table grouped by session.
  No "collapse in real-mode" allowed.
- [ ] **G2.** `/schedule` add-reminder — real NL parser. Either:
  - Client-side regex for "每天 X 点 / 每周 X / X 月 X 日 X 点" cases
    covering ≥80% of typical user inputs, parse → insert into
    `schedule_events`, OR
  - Route through `sessions.send` to the reminder agent which returns a
    structured reminder spec → client inserts the row.
  No "swap to chat hint" allowed.
- [ ] **G3.** Voice input on `/new` (and on chat composers). Previous
  voice button was deleted. Build it for real:
  - Web Speech API (`window.SpeechRecognition` /
    `webkitSpeechRecognition`), Chinese locale, push-to-talk button
    with mic permission prompt, inserts transcription into the composer.
  - Graceful fallback if browser doesn't support: hide the button.
  - Cover with e2e using a mocked SpeechRecognition.
- [ ] **G4.** Attachment in chat (the 📎 button that was deleted).
  Build for real:
  - Upload to Supabase Storage `chat-attachments/<user_id>/<intent_id>/...`
    with RLS,
  - Insert into `messages.content` as
    `{type:'image'|'file', url, name, size}` (the jsonb shape was
    designed for multimodal — see plan §"messages jsonb"),
  - Render in MessageBubble (image preview / file chip),
  - Pass through to gateway as a multimodal turn (gateway accepts
    vision turns per OpenClaw docs; verify).
- [ ] **G5.** Settings export row. Build for real:
  - "导出我的数据" button → calls `/api/export` (write a thin Edge
    Function in `~/myclaw` — hand-off acceptable for the function
    source; client wiring + UI lives here),
  - Returns a ZIP of intents + messages + memory_facts as JSON.

## Phase H — Lay-user readiness

These come from the user's "UI 上面很多功能就没有实现" feedback. Walk
each surface as a non-technical user and verify the user-visible
controls are all functional. Open Phase F items will produce more
Phase H items as they run.

- [ ] **H1.** Sentinel-claw install flow end-to-end UX. Today the
  sentinel banner exists but the path from "I see the banner" to "I
  have a real claw" may be broken. Walk it as a new user:
  - Click the install CTA → does it lead anywhere useful?
  - If "ssh + curl install-claw.sh", is there one-click copy?
  - Does the activation-code field actually redeem to a real claw?
  - Once a claw is connected, does the banner go away?
  Fix every step that isn't smooth.
- [ ] **H2.** Multi-claw picker UI. Today the sidebar shows one claw.
  If a user has more than one, can they switch? If not, build the
  picker (`ClawPicker` already exists for sentinel handling — extend
  for the multi-real case).
- [ ] **H3.** AgentPicker icon-only buttons need names. Audit every
  trigger and ensure the agent name + emoji are both visible.
- [ ] **H4.** Empty state copy audit. Every empty list/feed/grid
  must have onboarding copy + a primary CTA, not a blank panel.
  Surfaces to check: `/`, `/schedule`, `/memory`, `/now`, `/archive`,
  `/permissions`.
- [ ] **H5.** Loading state audit. Every async render must show a
  skeleton or spinner ≥150ms in, never a blank flash.
- [ ] **H6.** Error state audit. Network failure on every page → does
  the user see a friendly retry, or a blank/broken view?
- [ ] **H7.** Mobile audit. Every surface in Phase F must also render
  correctly at 375×667.

## Phase I — Remaining hand-off-blocked items

Genuinely cross-repo or human-action only. Hand-off is the correct
completion here.

- [ ] **I1.** A3 — append 3 routes to `aios-ui-spec.md §3.1` (sibling
  `~/myclaw`). Hand-off: `docs/handoff/aios-ui-spec-3.1-extra-routes.md`.
- [ ] **I2.** D1 — INSERT Vault secret `aios_gateway_token_key` via
  Supabase Dashboard SQL Editor (pooler role can't). Hand-off:
  `docs/handoff/vault-key-provision.md`.
- [ ] **I3.** D3 — create Sentry account + add `VITE_SENTRY_DSN` to
  Vercel env. Hand-off: `docs/handoff/sentry-setup.md`.
- [ ] **I4.** D4 — `gh secret set` × 4 for the CI realmode-e2e job.
  Hand-off: `docs/handoff/github-secrets.md`.

## Phase J — Self-audit findings (append-only)

Append discovered items during walkthroughs here. Format:
`### J<n>. <surface>` body: step that triggered · expected · actual.

(none yet)

---

## ## Deferred (read PROMPT.md "Explicit defer protocol" before adding)

(none yet)

---

## Notes (rationale, only read when picking the item)

**F1-F13** are not optional polish — they are the only mechanism that
catches features that look done in commits but don't actually work for
a user. Don't skip them to chase G/H items.

**G1-G5** were closed in run 1 via patterns now banned in PROMPT.md.
The git log will show the deletion commits; do not revert them
mechanically — rebuild the feature correctly with the gateway/storage
wiring described above.

**H4-H7** can be filled partially from a single walkthrough cycle —
work them in parallel with Phase F, not sequentially.

**Phase I hand-offs** stay `[ ]` until the human confirms the external
action is done. They do not block EXIT_SIGNAL — but the user must
explicitly accept that the build ships with these pending.
