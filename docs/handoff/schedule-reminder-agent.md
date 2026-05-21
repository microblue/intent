# Hand-off — wire `/schedule` reminders to a real reminder agent

**Repo:** `~/myclaw/` (Edge Function + reminder-agent source of truth)
**Aios side will follow once the agent + routing land.**

## Why this is deferred

`aios-design.md` says natural-language time parsing belongs in a
reminder agent, not in the SPA. Ralph B3 removed the toast-only NL
composer on `/schedule` because it was lying to users — "已记下" surfaced
even though nothing persisted. `/schedule` is now a read-only view of
`schedule_events` rows, plus a hint card pointing at the chat path
(open any project → tell its assistant "到时候提醒我..." → the agent
will INSERT the row on the user's behalf).

## What's missing

For `/schedule` to host a first-class quick-add, two pieces need to land
in `~/myclaw`:

1. **Reminder agent.** A claw-side agent that parses Chinese-language
   time expressions ("每周一 9 点", "下周二下午 3 点", "6/10 前") into a
   `fire_at timestamptz` + optional `recurrence` jsonb, and INSERTs a
   `schedule_events` row scoped to the user.
2. **Non-intent gateway send.** `sessions.send` today is intent-bound
   (`useGatewayChat.ts`). A reminder add from `/schedule` isn't tied to
   any specific intent, so we need either:
   - a system-level "reminders" pseudo-intent the claw auto-creates per
     user, or
   - a new gateway method like `agents.invoke("reminder", { text })`
     that routes to the named agent without an intent context.

Pick one when implementing. The system-intent route is simpler (reuses
existing message + agent plumbing); the dedicated method is cleaner
long-term once we have more cross-intent flows (memory facts, file
operations, etc.).

## What `~/myclaw-aios` will do once that lands

- Add `useAddReminder(text)` mutation in `src/data/` that calls the
  gateway with the user's free-text input.
- Replace the hint card in `src/routes/Schedule.tsx` with a form that
  uses `useAddReminder`; on success the React-Query cache invalidates
  and the new row pops into the right bucket.
- Update `e2e/phaseL2-data-surfaces.spec.ts` and
  `e2e/phase11-14-data-swap.spec.ts` to assert the new form flow.
- Delete this hand-off doc.

Until then the chat path is canonical and discoverable from the hint
card, so users aren't blocked — they just have one indirection.
