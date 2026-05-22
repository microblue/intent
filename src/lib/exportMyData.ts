import { supabase } from './supabase';
import type { Database } from './db-types';

/**
 * Collect every row the calling user owns in the SPA's user-data tables.
 *
 * RLS is the security boundary — each query is restricted to the caller's
 * rows by the policies on the underlying tables, so the anon-key client
 * is safe here. No service-role key is needed; no Edge Function either.
 *
 * Output is a single JSON-serialisable object. We omit `user_id` columns
 * since they would all match `user.id` anyway, and we tag the blob with
 * a schema version so a future importer can branch on it.
 */

const EXPORT_SCHEMA_VERSION = 1 as const;

type Intent = Database['public']['Tables']['intents']['Row'];
type Message = Database['public']['Tables']['messages']['Row'];
type MemoryFact = Database['public']['Tables']['memory_facts']['Row'];
type ScheduleEvent = Database['public']['Tables']['schedule_events']['Row'];
type UserPreferences = Database['public']['Tables']['user_preferences']['Row'];

export interface ExportedData {
  schema_version: typeof EXPORT_SCHEMA_VERSION;
  exported_at: string;
  user: { id: string; email: string | null };
  counts: {
    intents: number;
    messages: number;
    memory_facts: number;
    schedule_events: number;
  };
  intents: Omit<Intent, 'user_id'>[];
  messages: Omit<Message, 'user_id'>[];
  memory_facts: Omit<MemoryFact, 'user_id'>[];
  schedule_events: Omit<ScheduleEvent, 'user_id'>[];
  user_preferences: Omit<UserPreferences, 'user_id'> | null;
}

function strip<T extends { user_id?: string }>(rows: T[]): Omit<T, 'user_id'>[] {
  return rows.map(({ user_id: _user_id, ...rest }) => rest);
}

export async function fetchExportData(user: {
  id: string;
  email: string | null;
}): Promise<ExportedData> {
  const [intentsRes, messagesRes, factsRes, schedulesRes, prefsRes] =
    await Promise.all([
      supabase.from('intents').select('*').order('created_at', { ascending: true }),
      supabase.from('messages').select('*').order('created_at', { ascending: true }),
      supabase.from('memory_facts').select('*').order('created_at', { ascending: true }),
      supabase.from('schedule_events').select('*').order('created_at', { ascending: true }),
      supabase.from('user_preferences').select('*').maybeSingle(),
    ]);

  const firstErr =
    intentsRes.error ||
    messagesRes.error ||
    factsRes.error ||
    schedulesRes.error ||
    prefsRes.error;
  if (firstErr) throw new Error(firstErr.message);

  const intents = (intentsRes.data ?? []) as Intent[];
  const messages = (messagesRes.data ?? []) as Message[];
  const memory_facts = (factsRes.data ?? []) as MemoryFact[];
  const schedule_events = (schedulesRes.data ?? []) as ScheduleEvent[];
  const prefs = (prefsRes.data ?? null) as UserPreferences | null;

  const userPreferences = prefs
    ? (() => {
        const { user_id: _user_id, ...rest } = prefs;
        return rest;
      })()
    : null;

  return {
    schema_version: EXPORT_SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    user: { id: user.id, email: user.email },
    counts: {
      intents: intents.length,
      messages: messages.length,
      memory_facts: memory_facts.length,
      schedule_events: schedule_events.length,
    },
    intents: strip(intents),
    messages: strip(messages),
    memory_facts: strip(memory_facts),
    schedule_events: strip(schedule_events),
    user_preferences: userPreferences,
  };
}

/**
 * Trigger a browser download of the given blob. Uses an off-DOM anchor
 * so we don't pollute the React tree. Safe to call from a click handler
 * synchronously after the data has resolved.
 */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  // Some browsers (Safari, older Firefox) require the anchor to be in the
  // DOM for the click to take effect; append + remove keeps the tree clean.
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revocation so the browser has a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function buildExportFilename(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `myclaw-export-${stamp}.json`;
}
