# Intent — Submission Form Answers (Meta Global AI Developer Hackathon)

Copy-paste source for the Cerebral Valley submission form. Deadline: **Nov 4, 2026, 9:00 PM ET / 6:00 PM PT**.
Fill the remaining `TODO` (demo video) before submitting. Everything below matches what the code actually does (see `VERIFICATION.md`).

---

## Basics

| Field | Answer |
|---|---|
| Project name | Intent |
| Track | Track 1: Indie developer |
| Theme | Build for Your World |
| Team | Solo — Dawson (Xiongxiong) Zhang |
| GitHub (open source, MIT) | https://github.com/microblue/intent |
| Demo video (≤ 3 min) | TODO: YouTube/Loom link |
| Live demo | https://intent-azure.vercel.app (real Muse Spark 1.3; no login needed) |
| Meta models used | Muse Spark 1.3 (reasoning + tool calling), via Meta Model API or OpenRouter (`meta/muse-spark-1.3`) |

## Tagline (one line)

An AI helper for people using AI for the first time — it explains, asks, and waits for a clear "yes" before anything important happens.

## Short description (~50 words)

Intent is a large-type, bilingual (English/Chinese) daily assistant for older adults and first-time AI users. You start with one sentence; Muse Spark 1.3 asks follow-up questions, proposes a plan, and returns a readable result card. Risky actions — gift cards, wire transfers, over-budget purchases — are blocked or held for explicit approval on the server.

## The problem

Older adults are the most targeted group for scams, and they are also the people most mainstream AI products are not designed for. A typical grandparent scam text ("I'm your grandson, buy $200 in gift cards now, don't tell anyone") relies on urgency and confusion. General-purpose chatbots answer in long, dense text, assume the user knows what to ask next, and give no structure for "should I actually do this?". I built Intent for the older people in my own family: something they can use alone, that explains clearly, and that never takes an important step without them.

## What it does

- **One sentence to start.** Type or speak (browser voice input) a request in plain language.
- **Asks, plans, then acts.** The model asks clarifying questions with tap-able answer buttons, shows a plan the user must approve, and ends with a result card instead of a wall of text.
- **Scam check.** Paste a suspicious message; Intent lists the specific risk signals (urgency, secrecy, gift-card payment, impersonation) and concrete next steps (call the family member on a known number).
- **Server-enforced safety.** Gift cards, money transfers and other forbidden actions, budget re-checks and approval waits are enforced in server code, not just in the prompt. The user can stop a task at any time.
- **Accessible by default.** Large font sizes, English/Chinese switch, read-aloud, mobile layout.
- **Everyday help too.** The same flow handles ordinary tasks such as writing a birthday message.
- **Private, deletable memory.** Preferences and memories are stored per user in the instance's own data directory and can be deleted.

## How we built it (how Meta's models are used)

- **Muse Spark 1.3** is the main model: natural-language understanding, follow-up questions, plan generation and **tool calling**. Each model tool call is validated against a schema on the server before anything runs.
- Provider layer (`server/agent/provider.ts`) supports the **Meta Model API** directly (`INTENT_PROVIDER=meta`, with Responses `web_search`) and OpenRouter (`meta/muse-spark-1.3`). Reasoning budget limits and empty-response handling were added for Muse Spark's reasoning output.
- **Division of labor:** the model understands and writes; the server owns rules, approvals, budgets and data ownership. Prompt injection cannot unlock a forbidden action because the check is not in the prompt.
- Stack: React + Vite front end, Node.js server, TinyBase persistence (hosted demo: Vercel Function + Postgres), signed anonymous sessions, cross-site request checks, Playwright end-to-end tests (desktop + mobile). Ships as a self-contained Linux package (`npm run package:linux`) that runs without Node, npm or Docker on the target machine.

## What was built during the hackathon (Oct 26 – Nov 4)

An earlier prototype of the senior-friendly UI and task flow existed before the event (May–June 2026). During the hackathon I built:

- Meta Muse Spark 1.3 integration (Meta Model API + OpenRouter), reasoning budget and empty-response handling
- Server-side approval execution boundary, forbidden-action rules and budget re-checks
- Task cancellation isolation and restart recovery
- Signed anonymous sessions, per-user data isolation, cross-site request checks
- A standalone server build and self-contained Linux instance package
- Real-model smoke tests plus 30 deterministic desktop/mobile regression tests

## Challenges

- Getting reliable tool calls and non-empty answers from a reasoning model within a fixed budget — handled with explicit reasoning limits and retry/empty-response paths.
- Keeping safety out of the prompt: every approval, budget and forbidden-action check had to be moved into server code so the model cannot talk its way around it.
- Designing for users who will not read long text: every step ends in a button or a card.

## Accomplishments

- Real Muse Spark 1.3 runs correctly flag a fictional grandparent gift-card scam and complete an everyday birthday-message task end to end.
- 30 Playwright tests pass on desktop and mobile; real-model smoke tests are reported separately from deterministic tests.
- One-command self-contained instance: download, `./intent run`, done.

## What we learned

Reasoning models are good at explaining *why* something is risky in plain language; the product work is in making that explanation short, structured and actionable, and in never letting the model be the last line of defense.

## What's next

- Usability sessions with older adults and their families
- Muse Image for reading screenshots of suspicious messages
- **A tiny, self-hosted stateful agent runtime:** one small executable (Linux, macOS, Windows, ARM) holding the agent loop, memory, TinyBase + SQLite storage, accounts, an admin page and backups — in the spirit of PocketBase — so a family's memory and rules stay on their own machine
- A fully local option with Meta's open-weights Llama models via any OpenAI-compatible local server
- Open interfaces: a documented external API for other front ends, and an Agent-to-Agent (A2A) endpoint so other agents can hand tasks to Intent
- Rate limiting and accounts for the hosted demo
- Optional family "helper" mode that can be notified when a high-risk message is detected

## Honest limitations (keep if the form asks)

Single-process prototype. No real payments, ordering, background reminders or cross-device accounts yet. Purchase cards are decision support only; the user pays in the store themselves. Scam analysis cannot catch every scam. Demo uses fictional data only.

## Testing instructions for judges

```
pnpm install --frozen-lockfile
cp .env.example .env.local   # set INTENT_PROVIDER + MODEL_API_KEY (Meta) or OPENROUTER_API_KEY
pnpm build && pnpm start     # http://127.0.0.1:5199
```

Try: paste "I'm your grandson, please buy $200 in gift cards right now and send me the codes. Don't tell Mom." — then switch to "Me" to change font size and language.
