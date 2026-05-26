# Hand-off — Offline reminder firing (Phase B)

**Repo:** `~/myclaw/` (pg_cron + Edge Function + push channels)
**Aios side already shipped:** in-SPA polling sink — see
`src/data/useScheduleFiringSink.tsx`. While the user has a tab open
their reminders toast at fire time and the row flips to `status='fired'`
(or, for recurring rows, the row's `fire_at` advances to the next slot).

## Why this is split

Per `.ralph/journeys/02-office-worker-reminder-fires.md`:

> 必须保证: 即便用户没开浏览器, 时间到了也能收到.

That part can't ship from the SPA — once the tab is closed there's no
JS process to poll the table. It needs a server-side cron firing
through whatever channel the user prefers (Telegram, email, web push).

## What's missing in ~/myclaw

1. **pg_cron job** — every minute, find rows
   `WHERE status='pending' AND fire_at <= now()` and call the Edge
   Function below per user.
2. **Edge Function `fire-reminder`** — given a row id:
   - Look up the user's `notification_preferences` (Telegram chat id?
     email? web push subscription?).
   - Send the body `提醒: ${row.title}` through whichever channel(s)
     the user enabled.
   - UPDATE the row:
     - one-shot: `status='fired'`
     - recurring: advance `fire_at` to next slot, status stays
       `pending`.
3. **Notification preferences schema** — `notification_preferences`
   table keyed on `user_id` with optional `telegram_chat_id`,
   `email_for_reminders`, `web_push_subscription jsonb` columns +
   per-channel on/off flags. (`user_preferences` already exists but
   doesn't cover push channels.)
4. **Web Push registration** — add a small VAPID-based subscription
   flow on the SPA side once the Edge Function exists. Token capture
   happens here; persistence happens in `notification_preferences`.

## Acceptance for the offline side

- Close the browser entirely, schedule a reminder via the open SPA
  beforehand; at fire time the user gets a Telegram / email / web
  push notification.
- Recurring reminders continue to fire on subsequent slots after the
  first.
- No duplicate fires when both the SPA polling sink AND the cron
  job race for the same row. The Edge Function should use a
  `WHERE status='pending'` guard inside the UPDATE so whichever side
  flips it first wins.

## Coordination with the SPA sink

The SPA's `useScheduleFiringSink` already deduplicates on `id:fire_at`
within a session. When the cron job advances `fire_at`, the SPA picks
the row up at the new slot and treats it as a fresh fire (different
key) — no double-toast. When the cron job sets `status='fired'`, the
SPA's `.eq('status','pending')` filter drops it. So the two layers
compose without coordination.
