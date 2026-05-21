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

```bash
PROD_URL="https://app.myclaw.one"
set -a; source ~/.openclaw/credentials/myclaw-supabase.env; set +a
PLAYWRIGHT_BASE_URL="$PROD_URL" \
REAL_TEST_EMAIL="microblue@gmail.com" \
SUPABASE_URL="$SUPABASE_URL" \
SUPABASE_PUB_KEY="${SUPABASE_PUB_KEY:-$SUPABASE_ANON_KEY}" \
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$SUPABASE_SECRET_KEY}" \
pnpm exec playwright test e2e/phase6-realmode-*.spec.ts \
                          e2e/phase7-*.spec.ts \
                          e2e/phase8-realmode-*.spec.ts \
                          e2e/phaseL*.spec.ts
```

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
