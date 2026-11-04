# Intent

**Live:** https://intent.microvalley.io · **Demo video:** https://microvalley.io/intent/demo/ · **Submission notes:** [docs/submission/SUBMISSION_FORM.md](docs/submission/SUBMISSION_FORM.md)

An AI helper for people using AI for the first time, especially older adults. Say one sentence; Intent asks simple questions, proposes a plan, and returns a clear result card. It spots scams, asks before spending, and refuses gift cards and money transfers in server code, not just in the prompt. Built on **Meta Muse Spark 1.3**.

Intent is also a **tiny, self-contained runtime for a stateful agent**: one executable holds the web UI, API, agent loop, database, accounts, admin page and backups. No Docker, no external database, no hosted backend. Its memory and rules live wherever you run it.

## What's in the one file

| Part | How |
|---|---|
| Agent loop | Muse Spark 1.3 calling Intent's own tools (`ask_user`, `propose_plan`, `deliver`, `request_purchase`, `remember`, `finish`, …), arguments validated with Zod |
| Guardrails | Never-do list (gift cards, transfers, loans, investments), per-purchase and monthly limits re-checked on approval |
| Database | [TinyBase](https://tinybase.org) tables in memory, persisted row by row to the runtime's built-in SQLite (WAL). Indexes and change listeners come from TinyBase |
| Live updates | Server-sent events driven by TinyBase listeners; polling is only a fallback |
| Users | Anonymous signed HttpOnly session by default; optional username + password (scrypt) to come back from another device |
| Admin | `/_/` dashboard: first-run setup link, memory/uptime/db size, users, request log, one-click SQLite backup |
| Ops | `intent serve`, `intent admin`, `intent backup`; one data directory per instance, process lock, clean shutdown |

Measured on the live instance (GCP e2-micro, 1 GB RAM, free tier): ~55–80 MB resident memory, ~5 MB JS heap, a 36 KB database after the first tasks. Idle on a desktop: 59 MB RSS of which 21 MB is private memory; the rest is the executable's own code pages.

## Run it

Download the binary for your platform (or build it, below), then:

```sh
mkdir intent_data
printf 'INTENT_PROVIDER=openrouter\nOPENROUTER_API_KEY=...\nINTENT_MODEL_MAIN=meta/muse-spark-1.3\n' > intent_data/config.env
./intent-linux-x64 serve --dir intent_data --http 127.0.0.1:5199
```

Open http://127.0.0.1:5199. The console prints a one-time link to set the admin password for `/_/`.
Meta direct: `INTENT_PROVIDER=meta`, `MODEL_API_KEY`, `INTENT_MODEL_MAIN=muse-spark-1.3`. Behind HTTPS (proxy or tunnel), set `INTENT_PUBLIC_ORIGIN=https://your.domain`.
`INTENT_PROVIDER=fake` is a scripted model for tests only; the UI labels it.

Back up with the admin page's **Download backup**, or `intent backup out.db --dir intent_data` while stopped. Move an instance by moving its directory.

## Build from source

Node 22 and pnpm 10 (`npx pnpm@10` works). Bun 1.3+ for the single binary.

```sh
pnpm install --frozen-lockfile
pnpm dev                    # Vite dev server with the API mounted
pnpm build && pnpm start    # Node: dist-server/cli.js serve
pnpm build:binary           # release/intent-<os>-<arch> for this machine; --all for 5 platforms
```

## Tests

- `pnpm typecheck`
- `pnpm test:e2e` — 30 desktop + mobile Playwright tests with the scripted fake model (flow, not model quality).
- `pnpm test:binary` — runs the built executable end to end: UI, task, live events, accounts, isolation, admin setup, backup, single-process lock, restart persistence.
- `INTENT_SMOKE_URL=https://intent.microvalley.io node scripts/smoke-real.mjs` — real model, fictional scam text and birthday message.

Release builds exist for linux x64/arm64, macOS x64/arm64 and Windows x64; only linux-x64 has been run and tested so far.

## Scope

Intent does not pay, order, send messages or run background reminders. "I've paid" is the user's own report. The model can miss scams. One process per data directory. No public API docs or Agent-to-Agent endpoint yet. Demo data is fictional.

MIT licensed.
