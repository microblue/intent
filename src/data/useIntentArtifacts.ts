import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import {
  outline as mockOutlineAll,
  files as mockFilesAll,
} from '@/mocks';
import type { IntentFile, OutlineNode } from '@/mocks/types';
import type { Database } from '@/lib/db-types';

/**
 * useIntentArtifacts — outline nodes + produced files attached to an
 * Intent. Drives the IntentHome "计划/大纲" + "产出文件" rail sections
 * plus the count badges (进度 X/N, 文件 K) on the stat row.
 *
 * Schema (existing in myclaw `intent_artifacts`):
 *   id text, intent_id text, kind text, name text, pointer text,
 *   sha256 text?, size_bytes int?, created_by_agent text?,
 *   verified_at timestamptz?, created_at timestamptz
 *
 * `kind` is a free-form discriminator; this hook recognizes:
 *   - `outline_node` → maps to OutlineNode (label = name)
 *   - `file` / `doc` / `image` / `link` → maps to IntentFile
 *
 * Mock mode reads the existing prototype arrays so mock-mode pages keep
 * rendering with the rich seeded fixtures (multi-level outline, file
 * previews, etc.) — only real mode goes to the DB. The mock fixtures
 * carry `parentId` + `done` + `steps` which the DB schema doesn't carry
 * yet; in real mode those default to empty/false until the schema
 * evolves.
 *
 * Empty real mode = the user genuinely has no outline/files for this
 * intent yet. Callers should render an onboarding empty state, not
 * "0/0" → "no plan." Most early-stage intents will be in this state.
 */

type DbIntentArtifact = Database['public']['Tables']['intent_artifacts']['Row'];

export interface IntentArtifactsResult {
  outline: OutlineNode[];
  files: IntentFile[];
  /** Convenience: `outline.filter(o => o.done).length`. */
  outlineDone: number;
  isLoading: boolean;
  error: Error | null;
  isMock: boolean;
}

function fileKindFromName(name: string, pointer: string): IntentFile['kind'] {
  if (/^https?:\/\//i.test(pointer)) return 'link';
  if (/\.(png|jpe?g|gif|webp|svg|heic|heif)$/i.test(name)) return 'image';
  return 'doc';
}

function dbRowToOutline(row: DbIntentArtifact): OutlineNode {
  return {
    id: row.id,
    intentId: row.intent_id,
    parentId: null,
    label: row.name,
    done: Boolean(row.verified_at),
  };
}

function dbRowToFile(row: DbIntentArtifact): IntentFile {
  return {
    id: row.id,
    intentId: row.intent_id,
    name: row.name,
    kind: fileKindFromName(row.name, row.pointer),
    preview: row.pointer,
    updatedAt: row.created_at,
  };
}

const queryKey = (intentId: string, real: boolean, userId: string | null) =>
  ['intent_artifacts', { real, userId, intentId }] as const;

export function useIntentArtifacts(intentId: string | null): IntentArtifactsResult {
  const { signedIn, user, loading: sessionLoading } = useSession();
  const useReal = env.useRealData && signedIn && Boolean(intentId);
  const queryClient = useQueryClient();
  const key = queryKey(intentId ?? '', useReal, user?.id ?? null);

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<DbIntentArtifact[]> => {
      if (!intentId) return [];
      if (!useReal) return [];
      const { data, error } = await supabase
        .from('intent_artifacts')
        .select('*')
        .eq('intent_id', intentId)
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !sessionLoading && Boolean(intentId),
  });

  // Realtime: any insert/delete on intent_artifacts for this intent →
  // refetch. Per-mount UUID channel name avoids React 19 strict-mode
  // collision (same pattern as useIntentAgents).
  useEffect(() => {
    if (!useReal || !intentId) return;
    const channel = supabase
      .channel(`intent_artifacts:${intentId}:${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'intent_artifacts',
          filter: `intent_id=eq.${intentId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: key });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useReal, intentId, queryClient]);

  return useMemo<IntentArtifactsResult>(() => {
    if (!intentId) {
      return {
        outline: [],
        files: [],
        outlineDone: 0,
        isLoading: false,
        error: null,
        isMock: !useReal,
      };
    }
    if (!useReal) {
      // Mock mode: use the raw arrays directly (no mock-guard wrapper)
      // so we don't trip the guard from this central read path. The
      // guarded `outlineFor` / `filesFor` exports remain so legacy
      // call sites that still slip through are still caught.
      const outline = mockOutlineAll.filter((o) => o.intentId === intentId);
      const files = mockFilesAll.filter((f) => f.intentId === intentId);
      return {
        outline,
        files,
        outlineDone: outline.filter((o) => o.done).length,
        isLoading: false,
        error: null,
        isMock: true,
      };
    }
    const rows = query.data ?? [];
    const outline = rows
      .filter((r) => r.kind === 'outline_node')
      .map(dbRowToOutline);
    const files = rows
      .filter((r) => r.kind !== 'outline_node')
      .map(dbRowToFile);
    return {
      outline,
      files,
      outlineDone: outline.filter((o) => o.done).length,
      isLoading: query.isLoading || sessionLoading,
      error: (query.error as Error | null) ?? null,
      isMock: false,
    };
  }, [intentId, useReal, query.data, query.isLoading, query.error, sessionLoading]);
}
