/**
 * One turn of work on a thing: rebuild context from our store, run the
 * model/tool loop, write every visible effect back to the store.
 */
import type { z } from 'zod';
import type { Entry, Lang, Profile, Thing, ThingStatus } from '../../shared/types';
import type { Store } from '../store/types';
import type { ChatMessage, ChatProvider, ToolCallWire } from './provider';
import { ProviderError } from './provider';
import type { SearchProvider } from './search';
import { checkPurchase } from './policy';
import { systemPrompt } from './prompt';
import { TERMINAL_TOOLS, TOOL_SPECS, toolArgs, type ToolName } from './tools';
import { entriesToMessages } from './transcript';
import { serverText } from './text';

export interface AgentDeps {
  store: Store;
  chat: ChatProvider;
  search: SearchProvider;
  models: { main: string };
}

const MAX_STEPS = 10;
const activeTurns = new Map<string, symbol>();
export function cancelTurn(thingId: string) { activeTurns.delete(thingId); }
/** Card numbers, long digit runs, verification codes: never stored as memories. */
const SECRET_LIKE = /\b(?:\d[ -]?){8,}\b|password|密码|验证码|verification code|ssn|社保号|身份证/i;

export async function runTurn(deps: AgentDeps, userId: string, thingId: string): Promise<void> {
  const { store } = deps;
  let thing = await store.getThing(userId, thingId);
  if (!thing) return;
  const profile = await store.getProfile(userId);
  const lang: Lang = profile.lang;
  const t = serverText(lang);

  const token = Symbol();
  activeTurns.set(thingId, token);
  const active = () => activeTurns.get(thingId) === token;
  await store.updateThing(userId, thingId, { busy: true });
  let cost = 0;
  try {
    const memories = await store.listMemories(userId);
    const entries = await store.listEntries(thingId);
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: systemPrompt({
          lang,
          profile,
          memories,
          today: new Date().toISOString().slice(0, 10),
          thingTitle: thing.title,
        }),
      },
      ...entriesToMessages(entries),
    ];

    let ended = false;
    for (let step = 0; step < MAX_STEPS && !ended; step++) {
      // The user pressed "stop": busy was cleared from outside.
      if (step > 0 && !(await store.getThing(userId, thingId))?.busy) break;
      const res = await deps.chat.complete({ model: deps.models.main, messages, tools: TOOL_SPECS, maxTokens: 4096 });
      if (!active() || !(await store.getThing(userId, thingId))?.busy) break;
      cost += res.costMicros;
      const text = res.text?.trim();
      if (text) await store.addEntry(thingId, { by: 'intent', kind: 'text', payload: { text } });
      messages.push({ role: 'assistant', content: res.text ?? null, tool_calls: res.toolCalls.length ? res.toolCalls : undefined });

      if (!res.toolCalls.length) {
        // Talked without a closing tool: the next move is the user's.
        // Keep states that already say what the user should do next.
        if (thing.status !== 'done' && thing.status !== 'needs_you') {
          thing = await store.updateThing(userId, thingId, { status: 'asking', statusLine: t.yourTurn });
        }
        break;
      }

      for (const call of res.toolCalls) {
        if (!active() || !(await store.getThing(userId, thingId))?.busy) { ended = true; break; }
        const out = await execTool(deps, { userId, thing, profile, lang, call });
        cost += out.costMicros;
        thing = out.thing;
        messages.push({ role: 'tool', tool_call_id: call.id, content: out.result });
        if (out.terminal) { ended = true; break; }
      }
    }
    if (!ended && (await store.getThing(userId, thingId))?.busy && thing.status === 'thinking') {
      await store.updateThing(userId, thingId, { status: 'asking', statusLine: t.yourTurn });
    }
  } catch (err) {
    const retryable = err instanceof ProviderError ? err.retryable : true;
    console.error('[intent] turn failed', err instanceof ProviderError ? err.message : 'request interrupted');
    if (!active() || !(await store.getThing(userId, thingId))?.busy) return;
    await store.addEntry(thingId, {
      by: 'system',
      kind: 'refusal',
      payload: { text: retryable ? t.errorRetry : t.errorGeneric },
    });
  } finally {
    const latest = await store.getThing(userId, thingId);
    if (latest && active()) {
      activeTurns.delete(thingId);
      await store.updateThing(userId, thingId, { busy: false, costMicros: latest.costMicros + cost });
    }
  }
}

interface ToolCtx {
  userId: string;
  thing: Thing;
  profile: Profile;
  lang: Lang;
  call: ToolCallWire;
}

interface ToolOut {
  result: string;
  terminal: boolean;
  thing: Thing;
  costMicros: number;
}

async function execTool(deps: AgentDeps, ctx: ToolCtx): Promise<ToolOut> {
  const { store } = deps;
  const { userId, profile, lang } = ctx;
  const t = serverText(lang);
  const thingId = ctx.thing.id;
  const name = ctx.call.function.name as ToolName;
  const schema = toolArgs[name];
  if (!schema) return { result: `Unknown tool ${name}`, terminal: false, thing: ctx.thing, costMicros: 0 };

  let raw: unknown;
  try {
    raw = JSON.parse(ctx.call.function.arguments || '{}');
  } catch {
    return { result: 'Invalid JSON arguments. Call the tool again with valid JSON.', terminal: false, thing: ctx.thing, costMicros: 0 };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { result: `Invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`, terminal: false, thing: ctx.thing, costMicros: 0 };
  }

  const setThing = (status: ThingStatus, statusLine: string, extra: Partial<Thing> = {}) =>
    store.updateThing(userId, thingId, { status, statusLine, ...extra });
  const ok = (thing: Thing, result = 'ok', terminal = TERMINAL_TOOLS.includes(name), costMicros = 0): ToolOut => ({
    result,
    terminal,
    thing,
    costMicros,
  });

  switch (name) {
    case 'set_title': {
      const a = parsed.data as z.infer<typeof toolArgs.set_title>;
      return ok(await store.updateThing(userId, thingId, { title: a.title, emoji: a.emoji }));
    }
    case 'ask_user': {
      const a = parsed.data as z.infer<typeof toolArgs.ask_user>;
      await store.addEntry(thingId, { by: 'intent', kind: 'question', payload: { question: a.question, options: a.options } });
      return ok(await setThing('asking', a.question));
    }
    case 'propose_plan': {
      const a = parsed.data as z.infer<typeof toolArgs.propose_plan>;
      await store.addEntry(thingId, {
        by: 'intent',
        kind: 'plan',
        payload: { steps: a.steps.map((text) => ({ text, state: 'todo' as const })), eta: a.eta },
      });
      return ok(await setThing('plan', t.planReady));
    }
    case 'progress': {
      const a = parsed.data as z.infer<typeof toolArgs.progress>;
      await store.addEntry(thingId, { by: 'intent', kind: 'activity', payload: { text: a.status_line } });
      if (a.done_step) await markPlanStep(store, thingId, a.done_step);
      return ok(await setThing('working', a.status_line));
    }
    case 'search_web': {
      const a = parsed.data as z.infer<typeof toolArgs.search_web>;
      await store.addEntry(thingId, { by: 'intent', kind: 'activity', payload: { text: t.searchingShort } });
      const thing = await setThing('working', t.searchingShort);
      try {
        const r = await deps.search.search(a.query);
        const links = r.sources.map((s) => `- ${s.title}: ${s.url}`).join('\n');
        return ok(thing, `${r.text}\n\nSources:\n${links}`, false, r.costMicros);
      } catch (err) {
        console.error('[intent] search failed', err instanceof ProviderError ? err.message : 'search unavailable');
        return ok(thing, 'Search failed this time. Tell the user plainly if you cannot continue without it.', false);
      }
    }
    case 'deliver': {
      const a = parsed.data as z.infer<typeof toolArgs.deliver>;
      await store.addEntry(thingId, { by: 'intent', kind: 'result', payload: { title: a.title, body: a.body } });
      return ok(await setThing('working', t.resultReady));
    }
    case 'request_purchase': {
      const a = parsed.data as z.infer<typeof toolArgs.request_purchase>;
      const amountCents = Math.round(a.total_price * 100);
      const verdict = checkPurchase({ item: a.item, merchant: a.merchant, amountCents, category: a.category, currency: a.currency }, profile, lang);
      if (!verdict.ok) {
        await store.addEntry(thingId, { by: 'system', kind: 'refusal', payload: { text: verdict.reason } });
        return ok(
          ctx.thing,
          `REFUSED by the safety rules: ${verdict.reason} The user has already seen this message. Do not try to buy it another way. Offer a safe alternative or finish.`,
          false,
        );
      }
      const firstTimeMerchant = !profile.knownMerchants.some((m) => m.toLowerCase() === a.merchant.toLowerCase());
      await store.addEntry(thingId, {
        by: 'intent',
        kind: 'approval',
        payload: {
          kind: 'purchase',
          item: a.item,
          merchant: a.merchant,
          amountCents,
          currency: a.currency.toUpperCase(),
          why: a.why,
          undo: a.return_policy,
          url: a.url,
          category: a.category,
          firstTimeMerchant,
        },
      });
      return ok(await setThing('needs_you', t.needsApproval));
    }
    case 'remember': {
      const a = parsed.data as z.infer<typeof toolArgs.remember>;
      if (SECRET_LIKE.test(a.fact)) return ok(ctx.thing, 'Not saved: looks like private or secret information.', false);
      await store.addMemory(userId, a.fact);
      return ok(ctx.thing, 'saved', false);
    }
    case 'finish': {
      const a = parsed.data as z.infer<typeof toolArgs.finish>;
      const unpaid = (await store.listEntries(thingId)).some((e) => e.kind === 'approval' && e.payload.decision === 'approved' && !e.payload.paid);
      if (unpaid) {
        return ok(
          ctx.thing,
          'Not finished: the user approved a purchase but has not paid yet. Do not call finish. Briefly tell them to pay on the store page with the button on the card and to tap "I\'ve paid" afterwards.',
          false,
        );
      }
      await markAllPlanSteps(store, thingId);
      if (a.keep_watching) return ok(ctx.thing, 'Automatic monitoring is not implemented. Explain that you cannot keep watching or send reminders; do not promise it.', false);
      return ok(await setThing('done', a.status_line));
    }
  }
}

async function markPlanStep(store: Store, thingId: string, oneBased: number) {
  const plan = await latestPlan(store, thingId);
  if (!plan) return;
  const steps = plan.payload.steps.map((s, i) => (i < oneBased ? { ...s, state: 'done' as const } : i === oneBased ? { ...s, state: 'doing' as const } : s));
  await store.updateEntry(thingId, plan.id, { steps });
}

async function markAllPlanSteps(store: Store, thingId: string) {
  const plan = await latestPlan(store, thingId);
  if (!plan || plan.payload.decision !== 'accepted') return;
  await store.updateEntry(thingId, plan.id, { steps: plan.payload.steps.map((s) => ({ ...s, state: 'done' as const })) });
}

async function latestPlan(store: Store, thingId: string) {
  const entries = await store.listEntries(thingId);
  return [...entries].reverse().find((e): e is Extract<Entry, { kind: 'plan' }> => e.kind === 'plan');
}

