# myclaw-aios — Build & Run (for Ralph)

Short, scannable. Ralph re-reads this each loop. Update the "Key
Learnings" section when you discover something non-obvious.

## What it is

The MyClaw Personal AI OS — a Vite + React 19 + TypeScript SPA
served at `https://app.myclaw.one` (Vercel prod, custom domain).
Same bundle later embeds in `~/myclaw-desk` (Tauri shell, Phase 8).

Locked stack — **do not substitute:**
- Vite 6 · React 19 · TypeScript · TanStack Router · TanStack Query
- Zustand · Tailwind v4 + DaisyUI 5
- `cmdk` (Cmd+K launcher) · `react-resizable-panels`
- `@supabase/supabase-js` (anon key on the client; service-role
  only used in server-side edge functions in the `~/myclaw` repo)
- react-hook-form + zod · sonner · react-markdown + remark-gfm
- native WebSocket with our own reconnect adapter (no socket.io)

## Prereqs (already set up on this machine)

- Node 22+ via nvm, pnpm 9+
- `vercel` CLI, `supabase` CLI, `gh` CLI (all authed)
- `VERCEL_TOKEN` in shell env
- Supabase creds at `~/.openclaw/credentials/myclaw-supabase.env`
- Lightsail SSH key at `~/.ssh/lightsail/LightsailDefault.pem` (for
  cool-brook = the pilot OpenClaw VM)
- GitHub repo: `microblue/myclaw-aios` (origin)

## Local development

```bash
pnpm install
pnpm dev               # http://localhost:5173, mock-mode
pnpm typecheck         # tsc --noEmit
pnpm build             # tsc -b + vite build
pnpm exec playwright test               # full mock-mode e2e suite
pnpm exec playwright test --project=chromium e2e/<spec>.spec.ts
```

## Real-mode e2e against prod

Use the wrapper script — handles credential loading without needing
permission for `set -a; source ...` compounds:

```bash
./scripts/realmode-test.sh e2e/walkthrough-foo.spec.ts
./scripts/realmode-test.sh e2e/phase6-realmode-*.spec.ts e2e/phase7-*.spec.ts
./scripts/realmode-test.sh e2e/phaseL*.spec.ts --project=chromium
```

The wrapper sources `~/.openclaw/credentials/myclaw-supabase.env`,
exports `PLAYWRIGHT_BASE_URL=https://app.myclaw.one`, sets
`REAL_TEST_EMAIL=microblue@gmail.com`, and execs `pnpm exec playwright
test` with whatever args you pass. Never echoes secrets.

The real-mode suite uses `microblue@gmail.com` (DZ's account) which
owns the `cool-brook` claw. Sessions are minted via the Supabase
admin API + injected into localStorage (`e2e/helpers/real-session.ts`).
Magic-link rate limits get worked around by a process-scoped cache;
specs that follow a long chain call `clearCachedSession()` first.

## Deploy

```bash
git add -A && git commit -m "feat(<scope>): <what>"
git push origin main
vercel deploy --prod --token "$VERCEL_TOKEN" --yes --non-interactive
```

The custom-domain alias is auto-applied. The bundle inlines
`VITE_USE_REAL_DATA=true` on production (verified in
`vercel env ls`); preview deploys also have the flag, but they're
SSO-protected — only accessible via the automation bypass header.

## Cross-repo hand-offs

If a change requires modifying schema or an Edge Function, **do not
cd into the sibling repo from this loop.** Instead:

1. Write a hand-off prompt at `docs/handoff/<topic>.md` describing
   what needs to change in `~/myclaw`, with the exact migration SQL
   or function source.
2. Append a `[ ] hand-off pending: <topic>` item to `fix_plan.md` so
   the next loop knows it's gated on human action.
3. Move on to the next unblocked item.

Pattern of past hand-offs:
- `docs/phase6-myclaw-prompt.md` (Edge Function `mint-claw-token`)
- `docs/phase6-coolbrook-prompt.md` (Caddyfile `/ws` reverse proxy)
- `docs/openclaw-subagent-enable.md` (cool-brook agent allowlist)

## cool-brook (test claw) access

Detailed runbook at `docs/runbooks/cool-brook.md` — open only when the
current fix_plan item explicitly touches the gateway VM, agent personas,
or Caddy. Key path: `ubuntu@54.218.209.8` via
`~/.ssh/lightsail/LightsailDefault.pem`.

## Key Learnings (append-only — Ralph updates this section)

- Mock-mode tests have a `skipIfRealMode` helper that auto-skips when
  the build inlines `VITE_USE_REAL_DATA=true`. Don't add new
  mock-only tests without this guard.
- The real-mode test user (`microblue@gmail.com`) shares one Supabase
  session across the whole spec run. Magic-link rotation can
  invalidate cached JWTs mid-run — call `clearCachedSession()` at
  the top of a fragile test if needed.
- L8 (cross-context Realtime) is intermittent — the retry:1 set in
  `playwright.config.ts` for real-mode runs absorbs the flake.
- OpenClaw subagent delegation needs TWO gates open in `openclaw.json`:
  `group:sessions` in each agent's `tools.alsoAllow` AND
  `tools.agentToAgent.enabled = true`. Both are on for cool-brook.
- Bundle is large (~1MB). Don't add deps casually — many "nice to
  have" libraries duplicate code we already have.
- `intent_agents` table uses `agent_key` (not `agent_id`) and
  `is_orchestrator` (not `role`). DB trigger auto-seeds `main`.
- Supabase Realtime channels are cached by topic in the client. React 19
  strict-mode mount → cleanup → mount can return the same channel
  instance to the second mount before `removeChannel`'s network
  round-trip completes, causing `cannot add postgres_changes callbacks
  ... after subscribe()`. Fix: use a per-effect-run UUID in the channel
  name (see `src/data/useApprovals.ts`).
- Stale spec tests from the punt era can survive past their rebuild
  (e.g. phase11-14-data-swap + phaseL2 still asserted B3 hint-card
  even though G2 shipped the real composer). When a Phase-G rebuild
  closes, grep the entire e2e/ tree for the dropped testid/placeholder
  it was matching against — not just the file the rebuild lives in.
- Sidebar.tsx:294 statically renders "演示模式 · 数据不保存" in
  mock-mode. Toast assertions in mock-mode that use bare "演示模式"
  will hit a strict-mode locator collision; scope to a toast-only
  substring like "记下的事不会被保存" instead.
- Realmode-walkthrough screenshots show DZ's actual prod state. Some
  tests (phase7-prod-readiness fills `smoke-<ts>` into display_name,
  phaseL3 sets `preferred_lang=ja` then resets to zh-CN) leave
  `user_preferences` rows dirty if the run is interrupted or the
  upsert lands out of order — so walkthrough-settings-desktop.png
  may show "smoke-…" as the name and "日本語" as the lang. This is
  test hygiene, not a UI bug. Future fix candidates: have
  phase7/phase8 specs reset display_name to a known good value in a
  `finally`, and audit phaseL3's await-after-selectOption for the
  upsert round-trip.
- A clean cycle = full-product walkthrough across both
  `--project=chromium` and `--project=mobile` against prod with
  zero new Phase F items. Loop #3 (2026-05-22) ran both and got
  18+14 passes / 0 failures; this is clean_cycles_in_a_row=1
  toward the EXIT_SIGNAL gate of 3.
- Loop #4 (2026-05-22) cycle 2: mock 155 + realmode chromium 18 +
  realmode mobile 14 = 187 pass / 0 fail. Read 6 mobile +
  the 5 desktop screenshots from cycle 1 (cycle 2 alternated to
  read schedule / memory / permissions / help / archive /
  new-prompt / signin on mobile to cover surfaces cycle 1 hadn't
  scrutinized). Zero new findings. clean_cycles_in_a_row=2.
- Loop #5 (2026-05-22) cycle 3: mock 155 + realmode chromium 18 +
  realmode mobile 14 = 187 pass / 0 fail. Cycle 3 read the
  remaining mobile surfaces (engines / sentinel / new-clarifying /
  reset-password). Across all three cycles Ralph has read 16
  unique screenshots covering every F-route + sentinel/multi-claw/
  agent-picker. Zero new findings. clean_cycles_in_a_row=3.
  EXIT_SIGNAL=true: (a) zero [ ] items, (b) 0-fail e2e, (c) three
  clean cycles in a row.
