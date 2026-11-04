/**
 * Domain types shared by the browser and the server.
 * The user-facing unit is a "thing" (一件事). Everything that happens in it
 * is an entry on its timeline: what people said, and the cards Intent shows.
 */

export type Lang = 'zh' | 'en';

export type ThingStatus =
  | 'thinking' // just said, Intent is working out what to ask
  | 'asking' // waiting for the user to answer a question
  | 'plan' // plan waiting for the user's OK
  | 'working' // doing it in the background
  | 'needs_you' // waiting for an approval
  | 'done'
  | 'watching' // keeping an eye on something for the user
  | 'archived';

export interface Thing {
  id: string;
  userId: string;
  title: string;
  emoji: string;
  status: ThingStatus;
  /** One plain sentence shown on the home screen. */
  statusLine: string;
  /** True while a turn is running; the client polls while this is set. */
  busy: boolean;
  createdAt: string;
  updatedAt: string;
  /** Model + search spend for this thing, in micro-dollars. */
  costMicros: number;
}

export type Actor = 'user' | 'intent' | 'system';

export interface QuestionPayload {
  question: string;
  options: string[];
  answer?: string;
}

export interface PlanStep {
  text: string;
  state: 'todo' | 'doing' | 'done';
}

export interface PlanPayload {
  steps: PlanStep[];
  /** e.g. "大概 2 分钟" / "tomorrow morning" */
  eta: string;
  decision?: 'accepted' | 'change';
}

export type PurchaseCategory =
  | 'goods'
  | 'service'
  | 'travel'
  | 'food'
  | 'subscription'
  | 'gift_card'
  | 'money_transfer'
  | 'investment'
  | 'loan'
  | 'other';

export interface ApprovalPayload {
  kind: 'purchase';
  /** What: "LEGO City Fire Station 60414" */
  item: string;
  /** To whom: merchant / store */
  merchant: string;
  amountCents: number;
  currency: string;
  /** Why this one */
  why: string;
  /** Can it be undone: "30 天内可以退" */
  undo: string;
  url?: string;
  category: PurchaseCategory;
  firstTimeMerchant: boolean;
  decision?: 'approved' | 'declined';
  /** Set after approval once the user confirms they paid (payment rail step 1). */
  paid?: boolean;
}

export interface ResultPayload {
  title: string;
  /** Plain text with light markdown (lists, bold). */
  body: string;
  sources?: { title: string; url: string }[];
}

export type Entry =
  | EntryBase<'text', { text: string }>
  | EntryBase<'question', QuestionPayload>
  | EntryBase<'plan', PlanPayload>
  | EntryBase<'approval', ApprovalPayload>
  | EntryBase<'result', ResultPayload>
  | EntryBase<'activity', { text: string }>
  | EntryBase<'refusal', { text: string }>;

interface EntryBase<K extends string, P> {
  id: string;
  thingId: string;
  at: string;
  by: Actor;
  kind: K;
  payload: P;
}

export type EntryKind = Entry['kind'];

export interface Memory {
  id: string;
  userId: string;
  text: string;
  createdAt: string;
}

export interface Profile {
  userId: string;
  name: string;
  lang: Lang;
  fontScale: 1 | 2 | 3;
  /** IANA timezone from the browser, e.g. America/Los_Angeles. */
  timezone: string;
  /** ISO country code if known, e.g. US. Drives stores and currency. */
  country: string;
  perPurchaseLimitCents: number;
  monthlyLimitCents: number;
  spentThisMonthCents: number;
  /** Merchants the user has already approved a purchase from. */
  knownMerchants: string[];
}

export interface ThingDetail {
  thing: Thing;
  entries: Entry[];
}

/** What the client can send into a thing. */
export type UserInput =
  | { type: 'say'; text: string }
  | { type: 'answer'; entryId: string; answer: string }
  | { type: 'plan'; entryId: string; decision: 'accepted' | 'change'; note?: string }
  | { type: 'approval'; entryId: string; decision: 'approved' | 'declined' }
  | { type: 'paid'; entryId: string }
  | { type: 'stop' };

export const DEFAULT_PROFILE: Omit<Profile, 'userId'> = {
  name: '',
  lang: 'zh',
  fontScale: 1,
  timezone: '',
  country: '',
  perPurchaseLimitCents: 10_000,
  monthlyLimitCents: 30_000,
  spentThisMonthCents: 0,
  knownMerchants: [],
};
