# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo status

**Phase 0 (repo bootstrap) complete. Phase 1 (UX prototype) is the active phase.** The repo currently contains only `README.md` and `.gitignore` — no `package.json`, no source, no toolchain yet. Phase 1 work will scaffold the Vite app and lay down the v1 surfaces. Until then there is nothing to build, lint, or test.

## Canonical plan

`~/myclaw-studio/docs/aios-plan.md` is the source of truth for architecture, phasing, schema, auth flow, and the UX rationale. Read it before making non-trivial decisions — this file is a pointer, not a replacement.

## What this repo is

The MyClaw AIOS frontend. A single Vite + React SPA that ships to **two shells**:
- **Web**: `app.myclaw.one` (Vercel static)
- **Desktop**: `myclaw-desk` (Tauri 2 webview, planned for Phase 8 — currently still Electron)

A `src/shell/` adapter detects which shell it's running in. Same dist, different host.

## Locked stack (do not substitute)

Vite 6 · React 19 · TypeScript · TanStack Router · TanStack Query · Zustand · **DaisyUI + Tailwind v4** (DaisyUI loaded as a Tailwind plugin — no `components/ui` directory, no shadcn) · `cmdk` (Cmd+K launcher) · `react-resizable-panels` · `@supabase/supabase-js` (anon key only on the client) · react-hook-form + zod · sonner · Sentry (prod only) · native WebSocket with a thin reconnect adapter (never socket.io).

When you need a primitive DaisyUI doesn't cover, reach for `@floating-ui/react` or `react-aria-components` on demand — don't preinstall.

## Phase 1 hard constraints

Phase 1 is a **mock-only UX prototype** with the real production stack. The whole point is that the prototype becomes the v1 scaffold without rewriting.

- **Three surfaces only**: (1) Intent home — 3-pane chat / outline / files, main chat reads like ChatGPT; (2) Intent list — card grid with cover + emoji + colors; (3) Cmd+K launcher **with a visible search-button fallback** (the visible fallback is mandatory, not optional).
- **No backend wiring**: no Supabase client calls, no WebSocket, no `apps/api`. Auth is a mocked logged-in state. All data is hardcoded.
- **Time budget**: 2–3 days.
- **Acceptance gate**: DZ sign-off → write `aios-ui-spec.md` (into `~/myclaw/docs/`) → commit message contains the literal word `approved` → Phase 2 unblocked. Do not start Phase 2 work in this repo before that gate fires.

Out of scope until the Phase 1.5 replan: schema migrations, Edge Functions, `apps/api` endpoints, Caddy `/ws` route on cool-brook, the Tauri shell switch. Don't preemptively scaffold any of these.

## UX is lay-user-first, not power-user

This constraint overrides surface descriptions when they conflict.

Target user = non-technical consumer. Reference apps: ChatGPT, Pi (Inflection), Notion AI, Apple Intelligence. **Anti-references**: Cursor, Linear, Raycast, VS Code — those are power-user tools.

Practical rules when writing UI:
- Never expose internal terms in copy. The data model can call things `Intent` / `Agent` / `Orchestrator` / `Skill`; the UI says "项目" / "助手" / "对话" or lets the user name it.
- Low information density. One main thing per surface, large cards, generous whitespace. No dashboards.
- No CLI / terminal / monospace aesthetic. Looks like a consumer app, not a devtool.
- Cmd+K is a power-user accelerator; every Cmd+K action must also be reachable by a visible button.
- Errors are friendly natural-language suggestions, not status codes.
- Empty states have onboarding copy, not blank panels.
- Settings/advanced are folded away, not in the primary nav.
- Big buttons, big text, large hit targets — even on desktop.

If a design choice would make a non-technical relative bounce, it's wrong, even if it would delight a developer.

## Architectural rules to preserve through the prototype

Even though Phase 1 is mock-only, structure the code so Phase 6 (mock → real data) is a swap, not a rewrite:

- **SPA reads Supabase directly** (anon key + RLS) when real data lands. Do **not** funnel reads through `apps/api` — that's the BFF anti-pattern the plan explicitly rejects. `apps/api` is reserved for writes that need the service-role key (open claw / Polar webhook / admin / email).
- Keep agent output in its own data shape (`agent_calls` / `agent_traces`), not hard-coded inside chat messages — multi-agent orchestration is coming.
- `messages.content` is `jsonb`-shaped (object, not raw string) from day one — multi-modal is coming.
- Gateway tokens never reach the browser. Short-lived tokens are minted by an Edge Function and live in SPA memory only. Don't design any mock that contradicts this.
- Mobile is v1.5, not v3 — use responsive layouts, don't hard-code desktop-only assumptions.

## Repo conventions

- **Python rule from user-global CLAUDE.md does not apply here** — this is a Node/Vite project. When it has a `package.json`, use `pnpm` (the plan specifies `pnpm dev`).
- Supabase types are generated, not hand-written: once wired up, `pnpm gen:types` will run `supabase gen types typescript --project-id <id> > src/lib/db-types.ts`. Don't edit `db-types.ts` by hand.
- Supabase credentials live in `~/.openclaw/credentials/myclaw-supabase.env` — reference by env var, never paste values into code or commit messages.

## Sibling repos (context only — do not modify from here)

- `~/myclaw` — Turborepo monorepo with `apps/api` (Hono + Supabase service-role) and the canonical Supabase migrations (`supabase/migrations/20260504000001_initial_schema.sql`). New AIOS-required tables (`user_preferences`, `devices`, `notifications`, `claw_grants`) land here in Phase 3, not here.
- `~/myclaw-desk` — desktop shell. Electron 39 today, Tauri 2 after Phase 8. AIOS is consumed as a git submodule during dev, CI artifact later.
- `~/myclaw-studio` — predecessor; frozen after Phase 0. Don't extend it.
