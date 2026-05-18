import { createClient } from '@supabase/supabase-js';
import { env } from './env';
import type { Database } from './db-types';

/**
 * Browser-side Supabase client — anon key only.
 *
 * Architectural rule (from CLAUDE.md): the SPA reads Supabase directly with
 * the anon key and RLS guards. Writes that need service-role go through
 * `apps/api` (Hono) in the sibling repo, never from here. Don't import
 * a service-role key into this client.
 *
 * Session persistence uses localStorage by default. Phase 6 may switch
 * to IndexedDB for the Tauri shell if size becomes a concern; for now
 * the default is fine.
 */
export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // for magic-link callbacks
    flowType: 'pkce',
  },
});
