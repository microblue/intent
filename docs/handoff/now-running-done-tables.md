# Hand-off — restore `/now` running + done buckets when `agent_calls` / `agent_traces` exist

**Repo:** `~/myclaw/` (schema + Edge Function source of truth)
**Aios side will follow once tables land.**

## Why this is deferred

`aios-design.md §6` describes the `/now` activity feed as the
cross-Intent view of "正在做" + "刚刚做完" activity, driven by
`agent_calls` / `agent_traces` tables that don't exist in the shipped
Supabase schema yet. Until then, `~/myclaw-aios` was mixing real
approvals with **mock** running/done activity — signed-in users saw
fabricated rows.

Ralph B2 collapsed those buckets behind `useApprovals().isMock` so
real-mode shows approvals only. The mock-mode demo behavior is
unchanged. See `src/routes/Now.tsx` (the `approvalsMock ? items… :
[]` gate) and `e2e/phaseB2-now-realmode.spec.ts` for the lock-in.

## What `~/myclaw` needs to ship

1. Schema migration creating `agent_calls` and `agent_traces` (shapes
   per `aios-design.md §4` — `agent_calls(id, intent_id, user_id,
   agent_key, status: 'running'|'completed'|'failed', summary,
   started_at, completed_at, ...)`; `agent_traces(id, call_id,
   step_index, kind, payload, created_at, ...)`).
2. RLS: `user_id = auth.uid()` for SELECT; only service-role INSERTs
   (claws push these as agents emit lifecycle events).
3. Realtime publication on `agent_calls` so the SPA can subscribe
   without polling.
4. A claw-side emitter (likely cool-brook's OpenClaw runtime) that
   `INSERT`s a row on `agent.start` and `UPDATE`s on `agent.done` /
   `agent.error`. Gateway events already carry the data — see
   `src/gateway/protocol.ts` for the `agent` event shape today.

## What `~/myclaw-aios` will do once tables exist

- Add `src/data/useAgentCalls.ts` (RLS-scoped SELECT + Realtime
  INSERT/UPDATE subscription) returning `{ running, done }`.
- Replace the `approvalsMock ? items… : []` gates in
  `src/routes/Now.tsx` with the real hook output.
- Restore subtitle to `N 件等你点头 · N 件在跑 · N 件刚做完` (the
  string is already there — the conditional in Now.tsx just flips).
- Extend `phaseB2-now-realmode.spec.ts` (or add a sibling) to assert
  the "正在做" / "刚刚做完" sections come back when seeded.

Delete this file when (1) the tables land in `~/myclaw` AND (2) the
aios-side hook is wired up.
