# MyClaw AIOS

The AIOS GUI for MyClaw. Vite + React + DaisyUI + Tailwind v4 + Supabase. Shipped to web (`app.myclaw.one`) and desktop (`myclaw-desk` Tauri shell).

**Status**: Phase 0 (repo bootstrap). Phase 1 starts here — UX prototype with mock data, lay-user-first design.

**Canonical plan**: see [`~/myclaw-studio/docs/aios-plan.md`](../myclaw-studio/docs/aios-plan.md).

## Target user

Non-technical user, not power user / developer. Reference apps: ChatGPT app, Pi (Inflection), Notion AI, Apple Intelligence. **Not** Cursor / Linear / Raycast / VS Code.

## Phase 1 scope (UX prototype)

Three v1 surfaces, mock-only, real stack:

1. **Intent home** — 3-pane (chat / outline / files), main chat feels like ChatGPT
2. **Intent list** — card grid (cover + emoji + colors)
3. **Cmd+K Launcher** with visible search-button fallback

No backend wiring. No Supabase. No WS. All data hardcoded. Time budget: 2-3 days.

Acceptance gate: DZ sign-off → `aios-ui-spec.md` written → `approved` literal in commit message → Phase 2 unblocked.

## Out of scope until Phase 1.5 replan

- Schema migrations
- Edge Functions
- Caddy `/ws` route on cool-brook
- apps/api endpoints
- Tauri shell switch in myclaw-desk

These get replanned based on what Phase 1 reveals.
