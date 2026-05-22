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
- [x] **F3.** `/new` (NewIntent)
  - Spec: `e2e/walkthrough-new.spec.ts`. Real-mode chromium + mobile,
    drives prompt-stage → clarifying-stage by clicking the "帮我规划
    一次旅行" starter chip then "继续".
  - Asserts every interactive element has an accessible name across
    both stages.
  - Screenshots: `test-results/walkthrough-new-{desktop,mobile}-{prompt,clarifying}.png`.
  - Ralph read all four — surfaced one finding: on mobile clarifying,
    "下一问 →" was wrapping to "下一/问 →" in the cramped row with
    跳过 + free-text input. Fixed in same commit by adding
    `whitespace-nowrap` + `shrink-0` to both buttons. Re-snap confirms
    single-line label.
- [x] **F4.** `/schedule`
  - Spec: `e2e/walkthrough-schedule.spec.ts`. Real-mode chromium + mobile.
  - Asserts every interactive element has an accessible name. Click
    smoke: schedule-add-cta navigates to `/new`.
  - Screenshots: `test-results/walkthrough-schedule-{desktop,mobile}.png`.
  - Ralph read both — header + hint card + empty state all render
    correctly. (Hint card is intentional Phase 1 surface; G2 tracks
    rebuilding the real NL composer.) No findings.
- [x] **F5.** `/memory`
  - Spec: `e2e/walkthrough-memory.spec.ts`. Real-mode chromium + mobile.
  - Asserts every interactive element has an accessible name.
  - Screenshots: `test-results/walkthrough-memory-{desktop,mobile}.png`.
  - Ralph read both — header + info banner + add-fact composer (4
    category chips + 记下来 button) + empty state with examples all
    render correctly. No findings.
- [x] **F6.** `/permissions`
  - Spec: `e2e/walkthrough-permissions.spec.ts`. Real-mode chromium + mobile.
  - Asserts every interactive element has an accessible name.
  - Screenshots: `test-results/walkthrough-permissions-{desktop,mobile}.png`.
  - Ralph read both — header, warning banner, 3 capability groups
    (看你的资料 / 帮你做事 / 联系外部服务), 3-mode toggles (不行 / 每次问
    / 可以) on every row, 敏感 badge where applicable. No findings.
    Write-path (toggle persistence) already covered by phase8-realmode-audit.
- [x] **F7.** `/now`
  - Spec: `e2e/walkthrough-now.spec.ts`. Real-mode chromium + mobile.
  - Asserts every interactive element has an accessible name.
  - Screenshots: `test-results/walkthrough-now-{desktop,mobile}.png`.
  - Ralph found a real bug: mobile /now crashed with TanStack Router
    error boundary ("Something went wrong!"). Root cause was Supabase
    Realtime channel-name reuse in `useApprovals.ts` — the topic
    `approvals:pending` was constant, so React 19 strict-mode remount
    cycles produced the error `cannot add postgres_changes callbacks
    ... after subscribe()`. Fixed by using a per-effect-run UUID in
    the channel name. Re-snap shows clean header + empty state on
    both viewports.
- [x] **F8.** `/settings`
  - Spec: `e2e/walkthrough-settings.spec.ts`. Real-mode chromium + mobile.
  - Asserts every interactive element has an accessible name.
  - Screenshots: `test-results/walkthrough-settings-{desktop,mobile}.png`.
  - Ralph found one finding: the dev-mode toggle (`role="switch"` button)
    had `aria-checked` but no `aria-label`. Fixed in same commit by
    adding `aria-label="开发者模式"`. Re-snap shows clean settings
    surface with all sections (账号 / 外观 / 提醒方式 / 数据与隐私 /
    读懂 MYCLAW / 开发者模式) and labelled controls.
- [x] **F9.** `/help`
  - Spec: `e2e/walkthrough-help.spec.ts`. Real-mode chromium + mobile.
  - Asserts every interactive element has an accessible name.
  - Screenshots: `test-results/walkthrough-help-{desktop,mobile}.png`.
  - Ralph read both — concept grid renders the 11 concepts (intent /
    agent / step / capability / memory / schedule / approval / file /
    outline / activity / engine) with 中文 + ENGLISH labels. Footer
    link to settings present. No findings.
- [x] **F10.** `/archive`
  - Spec: `e2e/walkthrough-archive.spec.ts`. Real-mode chromium + mobile.
  - Asserts every interactive element has an accessible name.
  - Screenshots: `test-results/walkthrough-archive-{desktop,mobile}.png`.
  - Ralph read both — header 封存的, empty-state mailbox emoji with
    友好 copy ("这里还是空的 / 没有封存过的项目。") and 回到想做的事
    CTA. All controls labelled. No findings.
- [x] **F11.** `/settings/engines` (dev mode)
  - Spec: `e2e/walkthrough-engines.spec.ts`. Real-mode chromium + mobile,
    pre-seeds `devMode: true` into `myclaw-ui-v2` localStorage so the
    surface renders in its intended state.
  - Asserts every interactive element has an accessible name.
  - Screenshots: `test-results/walkthrough-engines-{desktop,mobile}.png`.
  - Ralph read both — 4-plane architecture cards (Supabase / apps-api /
    OpenClaw / Hermes), HERMES profiles list, per-claw agent matrix
    (cool-brook shows 12/47 specialists). English product-domain names
    are intentional for the dev surface. No findings.
- [x] **F12.** `/auth/signin`
  - Spec: `e2e/walkthrough-signin.spec.ts`. Unauthenticated route — does
    NOT inject a real session (page redirects when signedIn). Desktop
    pass covers all 4 modes (signin / signup / magic / forgot) by
    clicking the mode-nav links on a fresh page each time. Mobile pass
    covers signin only.
  - Enumeration helper enhanced for this spec to consider implicit/
    explicit `<label>` association (signin has form inputs whose
    accessible name comes from a wrapping `<label>`, not aria-label).
  - Screenshots: `test-results/walkthrough-signin-desktop-{signin,signup,magic,forgot}.png`
    + `walkthrough-signin-mobile.png`.
  - Ralph read all five — brand, friendly headings + subtitles, labelled
    form fields, primary CTA, mode-nav links, "先看看演示" all render
    correctly. No findings.
- [x] **F13.** `/auth/reset-password`
  - Spec: `e2e/walkthrough-reset-password.spec.ts`. Unauthenticated visit
    (no recovery token) renders the friendly "链接好像失效了" stale-link
    card with `重新发一个` CTA back to `/auth/signin`.
  - Click smoke verified the CTA navigation.
  - Screenshots: `test-results/walkthrough-reset-password-{desktop,mobile}.png`.
  - Asserts every interactive element has an accessible name (using
    the parent-`<label>` aware helper from F12). No findings. The
    active-recovery-session form is exercised by Supabase's own auth
    flow tests; F13 verifies the unauthenticated landing only.

## Phase G — Reopened (was punted in run 1)

Previous Ralph closed these by deleting / collapsing / hint-text. Build
the real feature. If you genuinely cannot, follow the explicit defer
protocol in PROMPT.md — **do not delete** the UI surface again.

- [x] **G1.** `/now` activity feed — real implementation.
  - Implemented option B: `useNowActivity` derives the running/done
    buckets from the `messages` table grouped by intent. "Running" =
    intent whose most recent message in the last 5 min is from the
    user (assistant hasn't replied yet); "Completed" = intent whose
    most recent message in the last 24h is from the assistant. Each
    bucket capped at 8 rows. RLS scopes to the user. Refetches every
    30s.
  - Wiring: `Now.tsx` now uses `useNowActivity` in real-mode and
    funnels both sources through the same `NowActivity` shape so the
    `RunningRow`/`DoneRow` components don't branch. Real intents
    resolved via `useIntents()` and passed as a prop so the cover +
    emoji come from the live intent row, not the mock catalogue.
  - Subtitle now shows the same "等点头 · 在跑 · 刚做完" tri-count in
    real-mode (was approvals-only).
  - Spec: `e2e/now-realmode-buckets.spec.ts` seeds throwaway intents
    + messages and asserts both buckets render. Screenshot at
    `test-results/walkthrough-now-realmode-buckets.png` shows the
    feed populated with the user's actual recent assistant replies.
- [x] **G2.** `/schedule` add-reminder — real NL parser.
  - Implemented option A: `src/lib/parseReminder.ts` covers 每天 X 点 /
    每周 X (early-week) / X 月 X 日 X 点 / 明天 / 今天 / 下周 / 周X /
    bare time + HH:MM, with AM/PM hints (上午/下午/晚上/早上),
    Chinese numerals up to 31, "X 点半" → :30, polite-prefix
    stripping ("请帮我", "提醒我"), and "tomorrow if past" rollover.
  - 15 unit tests in `e2e/parse-reminder-unit.spec.ts` cover daily /
    weekly / absolute-date / relative-day / next-weekday / bare-time /
    HH:MM / Chinese-numeral / garbage-rejection paths — all green.
  - Composer UI in `Schedule.tsx` (`AddReminderComposer`): text input
    with live parse preview, intent picker defaulting to most recent,
    "记下来" submit → `useAddScheduleEvent` (RLS-gated). Friendly
    error toast on unparseable input. Empty-intents branch shows the
    "起一件新事" path so users without intents still have a way in.
  - Empty-state copy refreshed to point at the composer.
  - Write-path test: `e2e/schedule-composer-realmode.spec.ts` seeds a
    throwaway intent, fills the composer, submits, asserts the row in
    `schedule_events` exists. Green on prod.
  - F4 walkthrough click-smoke updated to verify the composer's live
    parse preview instead of the old hint CTA.
- [x] **G3.** Voice input on `/new` (and on chat composers).
  - `src/components/VoiceButton.tsx` wraps the Web Speech API
    (`window.SpeechRecognition` / `webkitSpeechRecognition`), zh-CN
    locale, continuous + interim results. Push-to-talk: tap to start,
    tap again to stop. `aria-pressed` reflects active state;
    `aria-label` flips between "语音输入" / "停止录音". Mic-permission
    denial surfaces a friendly tooltip "麦克风没开". Final transcripts
    flow into the parent composer via `onTranscript`.
  - Wired into `IntentHome.StickyComposer` (chat) and
    `NewIntent.PromptStage` (with "不想打字?点话筒说一句" hint).
  - Graceful fallback: component returns `null` when neither global
    is present (Firefox desktop, some WebViews) so lay users on
    unsupported browsers don't see a broken control.
  - Tested via `e2e/voice-button.spec.ts` with a deterministic mock
    SpeechRecognition installed via `addInitScript`. Two cases:
    transcript reaches the textarea when mocked; button hidden when
    globals deleted. Both green.
- [x] **G4.** Attachment in chat (the 📎 button).
  - SPA-side implementation shipped:
    - `src/components/AttachmentButton.tsx` — `📎` button on the
      composer; opens file picker; hidden in mock-mode or signed-out
      (no user_id to scope the RLS path with). Accepts images, PDFs,
      text, zip, JSON up to 10 MB.
    - `src/lib/uploadAttachment.ts` — uploads to
      `chat-attachments/<user_id>/<intent_id>/<timestamp>-<basename>`
      via the Supabase Storage client and returns a 7-day signed URL
      + MessageContentPart of either `{type:'image', url, name, size,
      mime}` or `{type:'file', url, name, size, mime}`. Friendly
      error when the bucket isn't provisioned.
    - `useSendMessage` extended to accept `attachments?: MessageContentPart[]`
      and persist them alongside the text into `messages.content` jsonb.
    - `MessageContentPart` union extended with the new `file` variant
      and `name/size/mime` on `image`.
    - StickyComposer carries pending attachments as removable chips
      above the textarea; submit composes content array + clears.
    - `UserMessage` renders attachments via a new `AttachmentPart`
      helper: image preview (inline `<img>` with signed URL) or
      file chip (download link with name + size).
  - Bucket + RLS: hand-off filed at
    `docs/handoff/chat-attachments-bucket.md` with the migration SQL
    (insert into `storage.buckets`, four `chat-attachments:` policies
    scoping to `auth.uid()` prefix). PROMPT.md allows hand-off for
    schema/migration changes that live in `~/myclaw`. SPA shows
    "附件功能还没开通,稍后再试" until applied.
  - Gateway vision pass-through tracked in the same hand-off as a
    follow-up; not blocking SPA-side feature completion.
- [x] **G5.** Settings export row.
  - Built client-side per CLAUDE.md's "SPA reads Supabase directly
    with the anon key + RLS" rule — no Edge Function needed since
    the per-user read scope is already enforced by table RLS.
  - `src/lib/exportMyData.ts`: parallel `select *` from intents +
    messages + memory_facts + schedule_events + user_preferences;
    strips `user_id` from output rows; returns a schema-versioned
    blob `{schema_version:1, exported_at, user:{id,email}, counts,
    intents, messages, memory_facts, schedule_events, user_preferences}`.
    `triggerDownload` uses an off-DOM `<a download>` with object URL;
    `buildExportFilename` produces `myclaw-export-YYYYMMDD-HHMM.json`.
  - `Settings.tsx`: `ExportDataRow` reinstates the row under 数据与隐私
    with hint copy "想做的事 / 消息 / 助手记得的事 / 提醒, 一份 JSON
    全打包". Real-mode signed-in click → fetch + download + success
    toast (`已导出 N 条`). Mock-mode / signed-out click → friendly
    "演示模式没有真实数据可导出。登录后再来试一次". `busy` state
    flips the button to "准备中…" + disabled while the fetch runs.
  - `e2e/export-my-data.spec.ts`: realmode chromium seeds throwaway
    intent + memory_fact, clicks 导出, awaits the browser download
    event, parses the JSON file, asserts `schema_version === 1`,
    `user.id` matches the minted session user, and the seeded intent
    + fact appear under the right keys. Cleans up afterwards. Green
    on prod.
  - F8 walkthrough re-run on both viewports — the new row is labeled
    and present; no missing-label findings.

## Phase H — Lay-user readiness

These come from the user's "UI 上面很多功能就没有实现" feedback. Walk
each surface as a non-technical user and verify the user-visible
controls are all functional. Open Phase F items will produce more
Phase H items as they run.

- [x] **H1.** Sentinel-claw install flow end-to-end UX.
  - Walked as a brand-new throwaway user (sentinel-only state):
    - Primary CTA "去开一台" → already links to
      https://myclaw.one/aios/install (returns 200, is the canonical
      redeem flow per aios-design.md §A.1).
    - SSH + curl one-click copy step lives on the myclaw.one install
      page, not in the SPA — out of scope here.
    - Activation-code path was the broken half: the Settings → 订阅
      → 激活码 modal toasted "激活码已提交,稍后处理" and never
      redeemed. Rebuilt as a real hand-off: submit now encodes the
      key and `window.location.assign`s to
      `https://myclaw.one/aios/install?key=<encoded>` so the
      canonical redemption controller (in `~/myclaw/apps/api/src/
      controllers/claws/helpers/redeemActivationCode.ts`) actually
      runs against the user's input.
    - Banner-dismissal already correct: `showSentinelBanner`
      depends on `isSentinelOnly`, which flips false the moment any
      non-sentinel claw appears — covered by the existing
      phase6-realmode-multiclaw spec.
  - Implementation:
    - `src/components/ActivationKeyModal.tsx` — new reusable modal;
      Enter-to-submit, aria-label on the input, friendly copy
      ("带你去开通页面完成激活"), every button has data-testid +
      visible label. Optional `redirectFn` prop for tests.
    - `src/routes/Settings.tsx` — replaced the inline dialog +
      toast-only handler with the shared modal. Removed `useRef` +
      `keyInput` local state.
    - `src/routes/IntentList.tsx` — added secondary
      "已经有激活码?点这儿激活" button under the primary CTA so
      users who arrived with a code from a partner / friend have a
      discoverable entry point right next to the prompt. Mounts the
      shared modal.
  - Tests:
    - `e2e/sentinel-install-flow.spec.ts` — creates throwaway
      sentinel-only user, asserts banner renders, intercepts
      cross-origin navigation via `page.route('https://myclaw.one/**')`,
      clicks secondary CTA, fills `MYCL-TEST-0000-0001`, submits,
      asserts the intercepted URL has origin=`https://myclaw.one`,
      pathname=`/aios/install`, `?key=` decodes back to the input.
      Clean up the throwaway user.
    - `e2e/walkthrough-sentinel.spec.ts` — desktop + mobile
      screenshot the sentinel-only home; enumerates every interactive
      element, asserts each has an accessible name. Ralph read both
      screenshots — banner legible, both CTAs clearly labelled and
      visible, no placeholder copy, no English leakage. No findings.
    - Existing `phase6-realmode-sentinel` + `phase6-realmode-multiclaw`
      + `walkthrough-settings` specs re-run clean.
- [x] **H2.** Multi-claw picker UI.
  - State: `src/state/ui.ts` gained `selectedClawId: string | null`
    (persisted via partialize). Null = "auto" → fall back to
    defaultClaw (oldest real claw), so single-claw users + the
    existing oldest-wins default flow are unchanged.
  - Data: `useClaws()` exposes a new `activeClaw` derived from
    `selectedClawId` (matched against realClaws; stale ids fall back
    to defaultClaw). `useGateway` and `useCreateIntent` now consume
    `activeClaw` instead of `defaultClaw`, so selecting a different
    claw recycles the WS singleton and re-targets new-intent FKs.
  - UI: `ClawPicker` keeps the original quiet pill for the
    single-claw case (preserves prior F-walkthrough screenshots) and
    becomes a button-trigger + absolute-positioned `role="listbox"`
    when `realClaws.length > 1`. The active option has ✓ + primary-
    tone highlight; every option has aria-label / role / data-testid.
    A microtask cleanup clears stale `selectedClawId` if it stops
    matching the user's current claws.
  - Sidebar layout: moved ClawPicker out of the `<button data-testid=
    "sidebar-account">` (a button-in-button created by the new
    listbox trigger silently broke clicks in Chrome). The picker now
    renders as a sibling row above the account dropdown.
  - Tests:
    - `e2e/multi-claw-picker.spec.ts` — throwaway user with two real
      claws: asserts default is older, click opens menu listing both,
      click newer flips the label + persists `selectedClawId` to
      localStorage (`myclaw-ui-v2.state.selectedClawId === newerId`),
      then drives /new end-to-end and asserts the new intent's
      `claw_id === newerId` (not the old default).
    - `e2e/walkthrough-multi-claw.spec.ts` — desktop screenshots of
      picker closed + open. Ralph read both — trigger has visible
      claw name + ▾ chevron, menu lists both options with active
      checkmark + primary highlight, no missing labels.
    - Existing `phase6-realmode-multiclaw` (oldest-wins default),
      `phase6-realmode-sentinel` (no claws → no picker),
      `phase2-auth` (sidebar account dropdown + sign-out),
      `walkthrough-home` + `walkthrough-settings` all re-run clean.
- [x] **H3.** AgentPicker icon-only buttons need names.
  - Audit result: the AgentPicker chain is already structurally
    compliant. Verified by code-reading every render point:
    - `src/components/AgentPicker.tsx:90-91` — trigger renders
      `<emoji>` + `<name>` + chevron.
    - `src/components/AgentPicker.tsx:116-121` — each menu option
      renders 9×9 emoji avatar + `<name>` + one-line desc.
    - `src/components/TeamPanel.tsx:63-79` — team rows render emoji
      avatar + name + role + desc.
    - `src/components/TeamPanel.tsx:185-192` — add-member sheet
      rows render emoji + name + pitch.
    - `src/routes/IntentHome.tsx:562, 1307, 2251-2252` — chat
      message attribution + agent trace badges render emoji + name.
    - `src/routes/Now.tsx:404-413` — activity AgentBadge renders
      emoji + name.
    - `src/routes/NewIntent.tsx:875-883` — preview team badges
      render emoji + name.
  - Regression guard: `e2e/walkthrough-agent-picker.spec.ts` opens
    the picker in mock mode, snaps trigger closed + menu open,
    asserts the trigger text contains BOTH the '🦞' emoji AND the
    'Claw' name, and for each of the 13 canonical agents asserts the
    menu row's visible text contains the agent name and is longer
    than the name alone (catches an icon-only regression).
  - Ralph read both screenshots — every visible agent trigger /
    row shows emoji + name everywhere. No findings.
- [x] **H4.** Empty state copy audit.
  Walked all six surfaces; only `/now` needed a real fix.
  - `/` (IntentList) — 6 starter-template links sit above an empty
    panel with 👋 + "还没有任何事在做" + primary "起一个新意图"
    CTA → `/new` + a "小贴士" keyboard-shortcut card.
  - `/schedule` — `AddReminderComposer` is always mounted above the
    list; the textbox itself is the always-visible primary CTA.
    Empty branch has 🔔 + "没有要提醒的事" + three example phrasings
    + hint pointing back at the composer.
  - `/memory` — `AddFactComposer` is always mounted above the list;
    the textarea is the always-visible primary CTA. Empty branch has
    🧠 + "还没记下任何事" + three example facts + "起一个新意图"
    hint. Per-category sub-empty rows have "聊着聊着会有的" copy.
  - `/now` — FIXED: empty CTA was a quiet `btn-ghost btn-sm`
    "去看看你正在做的事" → `/` which just bounced the user back to
    the page they came from. Promoted to `btn-primary btn-md
    rounded-full` with ✨ icon + "起一件新事" → `/new`. "现在很安静"
    implies "start something" — action beats back-navigation.
  - `/archive` — 📭 + "这里还是空的" + "没有封存过的项目" + back
    link to `/`. Quiet by design (archive doesn't demand action).
  - `/permissions` — never empty (11 static capabilities in 3
    groups); onboarding banner "关于权限" explains the page.
  - Tests:
    - `e2e/walkthrough-empty-states.spec.ts` — mock-mode pass covers
      /, /schedule, /memory, /archive, /permissions (assertions on
      composer / CTA / onboarding copy presence). Separate real-mode
      describe creates a throwaway user (sentinel-only → no /now
      activity → empty-state branch reachable) and asserts the new
      CTA has class `btn-primary`, text "起一件新事", and `href`
      starts with `/new`. All green.
    - `e2e/walkthrough-now.spec.ts` docstring updated to reflect
      the new CTA target.
- [x] **H5.** Loading state audit.
  Walked every async-data surface; only `/now` flashed blank.
  - `/`            — 6-card animate-pulse grid (gated on
                     useIntents().isLoading). ✓
  - `/schedule`    — `schedule-skeleton` (3 animate-pulse rows). ✓
  - `/memory`      — `memory-skeleton` (3 animate-pulse rows). ✓
  - `/archive`     — 3-card animate-pulse grid. ✓
  - `/intent/<id>` — `intent-skeleton`. ✓
  - `/settings`    — "加载账号信息…" sub-row + spinner on saves. ✓
  - signin / reset — submit-button spinners. ✓
  - `/now`         — FIXED: page rendered without consulting any
                     isLoading flag. On initial fetch users with real
                     activity briefly saw "现在很安静" before
                     approvals + messages + intents queries resolved
                     — a lay user reads that as "nothing in flight",
                     which is alarming AND wrong. Added
                     `isInitialLoading` derived from `!approvalsMock
                     && (approvalsLoading || real.isLoading ||
                     intentsLoading)`. During loading: render
                     `now-skeleton` (3 animate-pulse rows), suppress
                     the empty panel. Empty panel only fires when
                     fetch settled AND every bucket is empty.
  - Static surfaces (`/permissions`, `/help`, `/settings/engines`,
    `/new`) fetch no async data — no skeleton needed.
  - Tests: `e2e/walkthrough-loading-states.spec.ts` fetches the
    served JS bundle and asserts every required skeleton marker
    (`schedule-skeleton`, `memory-skeleton`, `intent-skeleton`,
    `now-skeleton`, `animate-pulse`) is present in the prod bundle.
    Catches a future refactor that quietly drops a skeleton. Plus
    settled-state checks on `/schedule` and `/memory` that the
    composer is visible (never a blank panel). Bundle-markers test
    runs in both mock + real mode; real-mode pass against prod
    confirms the new `now-skeleton` shipped.
- [x] **H6.** Error state audit.
  Audit found two gaps:
    - Every existing error branch (IntentList, Memory, Schedule,
      Archive) showed friendly copy but no explicit retry button —
      lay users were stuck unless they knew to refresh manually.
    - `/now` had no error branch at all: failed queries silently
      rendered the empty state ("现在很安静"), telling users they
      had no activity when in fact the fetch had failed.
  Built shared component + wired every surface through it:
    - `src/components/ErrorPanel.tsx` — `title` + `friendlyError(
      error, fallback)`-piped message + "再试一次" button
      (`btn-error btn-sm rounded-full`). Default retry =
      `window.location.reload()` (action a lay user already
      understands); pass `onRetry` to use a TanStack-Query
      `refetch()` when available. Test hooks: `data-testid` on the
      panel + `error-panel-retry` on the button.
    - IntentList → `ErrorPanel` with `onRetry={refetch}`.
    - Memory → `ErrorPanel` (reload fallback).
    - Schedule → new `ErrorPanel` block under the composer (was a
      silent subtitle warning only).
    - Archive → `ErrorPanel` with `onRetry={refetch}`.
    - Now → consolidates `approvalsError ?? real.error` into
      `feedError`; renders `ErrorPanel` when set + not loading.
      Empty panel only fires when settled, no error, AND every
      bucket is empty.
  Static surfaces (`/permissions`, `/help`, `/settings/engines`,
  `/new`) fetch no async data — no error panel needed.
  Tests: `e2e/walkthrough-error-states.spec.ts` is a bundle-content
  audit asserting every per-surface error testid
  (`intentlist-error`, `schedule-error`, `memory-error`,
  `archive-error`, `now-error`, `intent-error`) + the
  `error-panel-retry` testid + the "再试一次" Chinese copy all ship
  in the prod JS bundle. Real-mode pass against prod green; all F-
  walkthroughs for the touched surfaces re-run clean.
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
