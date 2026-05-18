// Mock-layer types. Shape mirrors what Phase 6 will fetch from Supabase + WS,
// so swapping mocks for real data later is a data-source swap, not a remodel.
//
// In particular: `Message.content` is jsonb-shaped (array of typed parts), and
// agent traces live in their own record type — not embedded inside messages.

export type Intent = {
  id: string;
  emoji: string;
  title: string;
  /** Inline CSS gradient string, applied as the card cover. */
  cover: string;
  /** ISO timestamp of the most recent activity. */
  lastActiveAt: string;
  /** Short friendly subtitle on the card. */
  preview: string;
  /** Forward-compat: what kicks this Intent off (lay-user UI may hide). */
  trigger: 'manual' | 'cron' | 'event';
  lifecycle: 'pinned' | 'active' | 'dormant' | 'archived';
  /** Engine binding (developer-mode UI only). */
  boundAgentKeys?: string[];
  boundProfileKey?: string;
};

export type MessageContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; url: string; alt?: string }
  | { type: 'file_ref'; fileId: string; name: string };

export type Message = {
  id: string;
  intentId: string;
  role: 'user' | 'assistant';
  content: MessageContentPart[];
  createdAt: string;
  /** IDs of agent traces produced while replying. Empty for user messages. */
  agentTraceIds?: string[];
  /** Memory facts this reply drew on — surfaced as "我记得..." annotation. */
  usedFactIds?: string[];
  /** Capabilities exercised while replying — surfaced as small "用了…" chips. */
  usedCapabilityIds?: string[];
};

/**
 * Agent activity is its own record type, not glued to messages. Phase 1
 * surfaces only `summary`; later phases can expand the trace into substeps.
 */
export type AgentTrace = {
  id: string;
  messageId: string;
  agentKey: string;
  /** Short, lay-user-friendly description of what the helper did. */
  summary: string;
  status: 'running' | 'done' | 'error';
};

export type OutlineNode = {
  id: string;
  intentId: string;
  parentId: string | null;
  label: string;
  done?: boolean;
  /**
   * Execution steps an agent walked through (or plans to walk) to complete
   * this outline item. Phase 1 surfaces these inline as expandable detail
   * under the outline node so users can see *how* a task got done, not
   * just *that* it got done.
   */
  steps?: OutlineStep[];
};

/**
 * Thread-level Outline (大纲) — distinct from per-Plan task lists.
 *
 * An Intent thread accumulates many Plans, decisions, and pivots over time.
 * The thread outline is the bird's-eye TOC of the whole conversation: from
 * the original "想做的事" through every major milestone, decision, or new
 * Plan. Click an entry → chat scrolls to the anchor message. This is the
 * navigation surface for long-lived threads.
 *
 * Note: this is intentionally separate from OutlineNode (which represents
 * tactical task items inside a single Plan). The naming overlap is a
 * tradeoff — OutlineNode is internal nomenclature inherited from earlier
 * data design; the user-facing UI calls the per-plan items "计划" and the
 * thread-level ones "大纲".
 */
export type ThreadOutlineEntry = {
  id: string;
  intentId: string;
  /** Anchor — the message this entry points to. */
  messageId: string;
  kind: 'origin' | 'decision' | 'idea' | 'milestone' | 'plan' | 'pinned';
  text: string;
  at: string;
};

export type OutlineStep = {
  id: string;
  label: string;
  status: 'done' | 'running' | 'todo' | 'error';
  /** Which agent executed (or will execute) this step. */
  agentKey?: string;
  /** ISO timestamp when the step ran (or null if still queued). */
  at?: string;
  /** Short human-readable outcome — "找到 3 个候选", "起草了 240 字". */
  result?: string;
};

export type IntentFile = {
  id: string;
  intentId: string;
  name: string;
  kind: 'doc' | 'image' | 'link';
  /** Friendly one-line preview. */
  preview: string;
  updatedAt: string;
};

/* ─────── v1.5 / v2 concepts ─────── */

/**
 * Time- or event-triggered reminder linked to an Intent.
 * Lay-user UI calls these "提醒"; the underlying model carries cron metadata.
 */
export type ScheduleEvent = {
  id: string;
  intentId: string;
  /** Friendly natural-language title shown to lay users. */
  title: string;
  fireAt: string;
  recurrence?: { kind: 'daily' | 'weekly' | 'monthly' | 'cron'; spec: string; label: string };
  status: 'pending' | 'done' | 'snoozed';
};

/**
 * User-level memory fact that crosses Intent boundaries.
 * Lay-user UI calls these "助手记得的事"; data model groups by category.
 */
export type MemoryFact = {
  id: string;
  category: 'about-you' | 'people' | 'preferences' | 'project';
  text: string;
  /** Which Intent contributed this fact (if any). */
  originIntentId?: string;
  createdAt: string;
};

/**
 * What an agent is allowed to do. Sensitive caps default to "ask each time".
 */
export type Capability = {
  id: string;
  label: string;
  description: string;
  group: 'read' | 'do' | 'external';
  sensitive: boolean;
  icon: string;
};

export type CapabilityGrant = {
  capabilityId: string;
  mode: 'allow' | 'ask' | 'deny';
};

/**
 * An underlying agent worker. `source` tells us which engine hosts it —
 * OpenClaw (per-claw, runtime-resident) or Hermes (gateway profile).
 *
 * Lay-user UI never surfaces this type. Developer-mode UI does.
 */
export type Agent = {
  key: string;
  source: 'openclaw' | 'hermes';
  /** Lay-user-safe name. */
  displayName: string;
  /** Single emoji as the agent's visual identity in lay-user UI. */
  emoji: string;
  description: string;
  /** Which claw this agent lives on (openclaw only). */
  clawId?: string;
  /** Capability ids this agent declares. */
  capabilityIds: string[];
};

/**
 * Hermes profile = a configured gateway process (provider routing + env).
 */
export type HermesProfile = {
  key: string;
  displayName: string;
  description: string;
  /** Primary provider this profile routes to. */
  primaryProvider: 'openrouter' | 'anthropic' | 'openai' | 'groq';
};

/**
 * Pending approval the assistant is waiting on the user for.
 * These bubble up into the Now panel as the most urgent items.
 */
export type Approval = {
  id: string;
  intentId: string;
  prompt: string;
  detail?: string;
  agentKey?: string;
  createdAt: string;
  options?: { label: string; kind: 'primary' | 'secondary' }[];
};

/**
 * A single row in the Now panel. Bridges running agent activity,
 * pending approvals, and recent completions into one cross-Intent feed.
 */
export type NowActivity = {
  id: string;
  kind: 'running' | 'awaiting_approval' | 'completed';
  intentId: string;
  summary: string;
  agentKey?: string;
  since: string;
  approvalId?: string;
};
