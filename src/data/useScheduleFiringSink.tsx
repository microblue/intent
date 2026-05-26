import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import type { Database, Json } from '@/lib/db-types';

/**
 * useScheduleFiringSink — the in-SPA polling sink that turns
 * `schedule_events` rows into real, user-visible reminders.
 *
 * Today the SPA INSERTs schedule_events rows just fine, but nothing
 * ever read them back at fire_at to notify the user. This hook closes
 * that loop while the user is online:
 *
 *   1. Every POLL_MS, scan the user's `status='pending'` rows.
 *   2. Filter to rows whose `fire_at <= Date.now()` (client clock —
 *      lets `page.clock.fastForward` drive the journey test).
 *   3. For each due row: toast with `data-testid="reminder-fired"`
 *      + optional browser notification + UPDATE the row.
 *        - One-shot row: status='fired'.
 *        - Recurring row: advance `fire_at` to the next slot and
 *          keep status='pending' so the next slot fires too.
 *
 * Phase B (cron + push for offline users) lives in `~/myclaw`; see
 * `docs/handoff/schedule-firing-offline.md` (filed alongside this).
 *
 * Mount once at the AppShell level — running on every route ensures
 * the user sees their reminder even when they're not on /schedule.
 */

const POLL_MS = 15_000;

type DbScheduleEvent = Database['public']['Tables']['schedule_events']['Row'];

interface PendingRow {
  id: string;
  intent_id: string;
  title: string;
  fire_at: string;
  recurrence: DbScheduleEvent['recurrence'];
  status: string;
}

interface Recurrence {
  kind: 'daily' | 'weekly' | 'monthly' | 'cron';
  spec?: string;
  label?: string;
}

function asRecurrence(r: Json | null): Recurrence | null {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  const kind = (r as { kind?: unknown }).kind;
  if (kind === 'daily' || kind === 'weekly' || kind === 'monthly' || kind === 'cron') {
    return r as unknown as Recurrence;
  }
  return null;
}

/**
 * Compute the next fire timestamp for a recurring reminder. We advance
 * from `current` (the row's last fire_at) preserving the original
 * time-of-day, then keep jumping by the period until we land strictly
 * after `fromMs` — so a row that's been silently overdue for many
 * cycles resyncs to the future without flooding the user with toasts.
 */
function computeNextFireAt(current: Date, recurrence: Recurrence, fromMs: number): Date | null {
  const next = new Date(current);
  let stepDays: number;
  switch (recurrence.kind) {
    case 'daily':
      stepDays = 1;
      break;
    case 'weekly':
      stepDays = 7;
      break;
    case 'monthly':
      // Coarse — advance one calendar month per cycle.
      next.setMonth(next.getMonth() + 1);
      while (next.getTime() <= fromMs) next.setMonth(next.getMonth() + 1);
      return next;
    default:
      return null;
  }
  next.setDate(next.getDate() + stepDays);
  while (next.getTime() <= fromMs) next.setDate(next.getDate() + stepDays);
  return next;
}

export function useScheduleFiringSink() {
  const { signedIn, user } = useSession();
  const useReal = env.useRealData && signedIn;
  const queryClient = useQueryClient();
  // Dedupe key combines row id + the fire_at value that fired. This
  // lets a recurring row fire many times — the key changes after we
  // advance fire_at — without ever double-firing the same slot
  // within one session (e.g. if a tick lands while the UPDATE is
  // still in flight).
  const firedKeys = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!useReal || !user?.id) return undefined;
    let cancelled = false;
    let inFlight = false;

    const tick = async () => {
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        const { data, error } = await supabase
          .from('schedule_events')
          .select('id,intent_id,title,fire_at,recurrence,status')
          .eq('status', 'pending')
          .limit(200);
        if (cancelled || error || !data) return;

        const nowMs = Date.now();
        const due = (data as PendingRow[]).filter(
          (r) => new Date(r.fire_at).getTime() <= nowMs,
        );
        if (due.length === 0) return;

        let touchedAny = false;
        for (const row of due) {
          const key = `${row.id}:${row.fire_at}`;
          if (firedKeys.current.has(key)) continue;
          firedKeys.current.add(key);

          toast(
            <span data-testid="reminder-fired" className="inline-flex items-center gap-2">
              <span aria-hidden>⏰</span>
              <span>{row.title}</span>
            </span>,
            { duration: 12_000 },
          );

          // Optional browser-level ping. Only fires if the user
          // already granted permission elsewhere — we never auto-
          // request here. This is best-effort: failures are silent.
          try {
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              new Notification('提醒', { body: row.title });
            }
          } catch {
            // Notifications API unavailable / blocked — toast is enough.
          }

          const recurrence = asRecurrence(row.recurrence);
          if (recurrence) {
            const next = computeNextFireAt(new Date(row.fire_at), recurrence, nowMs);
            if (next) {
              await supabase
                .from('schedule_events')
                .update({ fire_at: next.toISOString() })
                .eq('id', row.id);
            } else {
              await supabase
                .from('schedule_events')
                .update({ status: 'fired' })
                .eq('id', row.id);
            }
          } else {
            await supabase
              .from('schedule_events')
              .update({ status: 'fired' })
              .eq('id', row.id);
          }
          touchedAny = true;
        }

        if (touchedAny) {
          queryClient.invalidateQueries({ queryKey: ['schedule_events'] });
        }
      } catch {
        // Network blip / RLS transient — next tick will retry.
      } finally {
        inFlight = false;
      }
    };

    void tick();
    const interval = setInterval(() => {
      void tick();
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [useReal, user?.id, queryClient]);
}
