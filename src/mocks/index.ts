// Single-source mock barrel: import once, re-export, build helpers on top.

import {
  intents,
  messages,
  outline,
  files,
  agentTraces,
  threadOutline,
} from './intents';
import { scheduleEvents } from './schedule';
import { memoryFacts } from './memory';
import { capabilities, capabilityGrants } from './permissions';
import { agents, hermesProfiles, intentBindings } from './agents';
import { approvals, nowActivities } from './now';
import type { Intent, MemoryFact, Agent, Capability } from './types';

export type * from './types';

// Re-export raw mock data
export {
  intents,
  messages,
  outline,
  files,
  agentTraces,
  threadOutline,
  scheduleEvents,
  memoryFacts,
  capabilities,
  capabilityGrants,
  agents,
  hermesProfiles,
  intentBindings,
  approvals,
  nowActivities,
};

/* ─── Intent / message lookups ─── */
export const findIntent = (id: string) => intents.find((i) => i.id === id);
export const messagesFor = (intentId: string) => messages.filter((m) => m.intentId === intentId);
export const outlineFor = (intentId: string) => outline.filter((o) => o.intentId === intentId);
export const filesFor = (intentId: string) => files.filter((f) => f.intentId === intentId);
export const threadOutlineFor = (intentId: string) =>
  threadOutline.filter((t) => t.intentId === intentId);
export const tracesForMessage = (messageId: string) =>
  agentTraces.filter((t) => t.messageId === messageId);

export const sortedIntents = (): Intent[] =>
  [...intents].sort((a, b) => {
    if (a.lifecycle === 'pinned' && b.lifecycle !== 'pinned') return -1;
    if (b.lifecycle === 'pinned' && a.lifecycle !== 'pinned') return 1;
    return new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime();
  });

/* ─── v1.5 lookups ─── */
export const sortedSchedule = () =>
  [...scheduleEvents].sort((a, b) => new Date(a.fireAt).getTime() - new Date(b.fireAt).getTime());

export const memoryByCategory = (): Record<MemoryFact['category'], MemoryFact[]> => {
  const groups: Record<MemoryFact['category'], MemoryFact[]> = {
    'about-you': [],
    preferences: [],
    people: [],
    project: [],
  };
  for (const f of memoryFacts) groups[f.category].push(f);
  return groups;
};

export const findAgent = (key: string): Agent | undefined => agents.find((a) => a.key === key);

export const findMemoryFact = (id: string): MemoryFact | undefined =>
  memoryFacts.find((f) => f.id === id);

export const findCapability = (id: string): Capability | undefined =>
  capabilities.find((c) => c.id === id);

export const bindingsFor = (intentId: string) => intentBindings[intentId];

/** Combined approvals + running + recent for the Now panel. */
export const nowSorted = () =>
  [...nowActivities].sort((a, b) => {
    const order = { awaiting_approval: 0, running: 1, completed: 2 } as const;
    if (a.kind !== b.kind) return order[a.kind] - order[b.kind];
    return new Date(b.since).getTime() - new Date(a.since).getTime();
  });

export const pendingApprovalCount = () =>
  nowActivities.filter((a) => a.kind === 'awaiting_approval').length;

export const runningCount = () => nowActivities.filter((a) => a.kind === 'running').length;

/**
 * One-shot summary of everything attached to an Intent — used by the concept
 * ribbon on Intent home and by the status badges on Intent cards. Each count
 * traces back to a concrete data source so the ribbon stays honest:
 *   agents       ← intentBindings
 *   outline      ← OutlineNode[]
 *   files        ← IntentFile[]
 *   schedule     ← ScheduleEvent[]
 *   memoryFacts  ← MemoryFact[] (filtered by originIntentId)
 *   approvals    ← NowActivity.kind = awaiting_approval
 *   running      ← NowActivity.kind = running
 */
export const conceptCountsFor = (intentId: string) => {
  const intentOutline = outline.filter((o) => o.intentId === intentId);
  return {
    agents: intentBindings[intentId]?.agentKeys.length ?? 0,
    outlineDone: intentOutline.filter((o) => o.done).length,
    outlineTotal: intentOutline.length,
    files: files.filter((f) => f.intentId === intentId).length,
    schedule: scheduleEvents.filter((s) => s.intentId === intentId).length,
    memoryFacts: memoryFacts.filter((m) => m.originIntentId === intentId).length,
    pendingApprovals: nowActivities.filter(
      (a) => a.kind === 'awaiting_approval' && a.intentId === intentId,
    ).length,
    running: nowActivities.filter((a) => a.kind === 'running' && a.intentId === intentId).length,
  };
};
