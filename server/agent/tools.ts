/**
 * Intent's own tools. Every business action is ours, executed by our server,
 * so it behaves the same on any model platform (runtime design §2).
 */
import { z } from 'zod';
import type { ToolSpec } from './provider';

const purchaseCategories = [
  'goods',
  'service',
  'travel',
  'food',
  'subscription',
  'gift_card',
  'money_transfer',
  'investment',
  'loan',
  'other',
] as const;

export const toolArgs = {
  set_title: z.object({ title: z.string().min(1).max(40), emoji: z.string().min(1).max(8) }),
  ask_user: z.object({ question: z.string().min(1), options: z.array(z.string().min(1)).min(2).max(4) }),
  propose_plan: z.object({ steps: z.array(z.string().min(1)).min(1).max(5), eta: z.string().min(1) }),
  progress: z.object({ status_line: z.string().min(1).max(60), done_step: z.number().int().optional() }),
  search_web: z.object({ query: z.string().min(2) }),
  deliver: z.object({ title: z.string().min(1), body: z.string().min(1) }),
  request_purchase: z.object({
    item: z.string().min(1),
    merchant: z.string().min(1),
    total_price: z.number().positive(),
    currency: z.string().length(3).default('USD'),
    why: z.string().min(1),
    return_policy: z.string().min(1),
    url: z.string().url().optional(),
    category: z.enum(purchaseCategories),
  }),
  remember: z.object({ fact: z.string().min(2).max(200) }),
  finish: z.object({ status_line: z.string().min(1).max(40), keep_watching: z.boolean().optional() }),
};

export type ToolName = keyof typeof toolArgs;

/** Tools that end the turn: the next move belongs to the user. */
export const TERMINAL_TOOLS: ToolName[] = ['ask_user', 'propose_plan', 'request_purchase', 'finish'];

export const TOOL_SPECS: ToolSpec[] = [
  {
    name: 'set_title',
    description: 'Give this thing a short name (max 12 Chinese characters or 5 English words) and one emoji. Call once at the start.',
    parameters: {
      type: 'object',
      properties: { title: { type: 'string' }, emoji: { type: 'string' } },
      required: ['title', 'emoji'],
    },
  },
  {
    name: 'ask_user',
    description: 'Ask the user ONE question with 2-4 short answer buttons. Ends your turn.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        options: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4 },
      },
      required: ['question', 'options'],
    },
  },
  {
    name: 'propose_plan',
    description: 'Show the plan (max 5 one-sentence steps) and a rough time, then wait for the user to approve. Ends your turn.',
    parameters: {
      type: 'object',
      properties: {
        steps: { type: 'array', items: { type: 'string' }, maxItems: 5 },
        eta: { type: 'string', description: 'Rough time until the result, in plain words.' },
      },
      required: ['steps', 'eta'],
    },
  },
  {
    name: 'progress',
    description: 'Tell the user in one short sentence what you are doing now. Optionally mark a plan step (1-based) as done.',
    parameters: {
      type: 'object',
      properties: { status_line: { type: 'string' }, done_step: { type: 'integer' } },
      required: ['status_line'],
    },
  },
  {
    name: 'search_web',
    description: 'Search the web for current facts: prices, products, stores, places, schedules, rules. Returns a digest with links.',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name: 'deliver',
    description: 'Give the user a result card: title, then body (conclusion first, then a short list; light markdown allowed).',
    parameters: {
      type: 'object',
      properties: { title: { type: 'string' }, body: { type: 'string' } },
      required: ['title', 'body'],
    },
  },
  {
    name: 'request_purchase',
    description:
      'Ask the user to approve buying something. Fill in every field truthfully from what you found. The server checks the never-do list and spending limits. Ends your turn if accepted.',
    parameters: {
      type: 'object',
      properties: {
        item: { type: 'string', description: 'Exact product or service name' },
        merchant: { type: 'string', description: 'Store or company' },
        total_price: { type: 'number', description: 'Total including shipping and tax if known, in currency units (e.g. 49.99)' },
        currency: { type: 'string', description: 'ISO code, e.g. USD' },
        why: { type: 'string', description: 'Why this one, one sentence' },
        return_policy: { type: 'string', description: 'Can it be returned/cancelled, one sentence' },
        url: { type: 'string', description: 'Product or checkout page' },
        category: { type: 'string', enum: [...purchaseCategories] },
      },
      required: ['item', 'merchant', 'total_price', 'currency', 'why', 'return_policy', 'category'],
    },
  },
  {
    name: 'remember',
    description: 'Save one lasting fact about the user (never secrets, card numbers, passwords, ID numbers).',
    parameters: { type: 'object', properties: { fact: { type: 'string' } }, required: ['fact'] },
  },
  {
    name: 'finish',
    description: 'Mark this thing as done. status_line: a very short line for the home screen (max 15 Chinese characters or 8 English words), e.g. "买好了，周五送到". keep_watching: true if you promised to keep an eye on something.',
    parameters: {
      type: 'object',
      properties: { status_line: { type: 'string' }, keep_watching: { type: 'boolean' } },
      required: ['status_line'],
    },
  },
];
