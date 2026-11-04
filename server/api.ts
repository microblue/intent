/**
 * HTTP API, written against the Web Request/Response types so the same
 * handler runs in the Vite dev server and in a Vercel function.
 */
import { z } from 'zod';
import type { Entry, ThingDetail, UserInput } from '../shared/types';
import type { AgentDeps } from './agent/turn';
import { checkPurchase } from './agent/policy';
import { isSameOrigin, newSession, sessionUser } from './session';
import { cancelTurn, runTurn } from './agent/turn';
import { serverText } from './agent/text';

type WaitUntil = (p: Promise<unknown>) => void;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const fail = (status: number, error: string) => json({ error }, status);

const profilePatch = z
  .object({
    name: z.string().max(40),
    lang: z.enum(['zh', 'en']),
    fontScale: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    timezone: z.string().max(64),
    country: z.string().max(2),
    perPurchaseLimitCents: z.number().int().min(0).max(1_000_000),
    monthlyLimitCents: z.number().int().min(0).max(5_000_000),
  })
  .partial();

const userInput = z.discriminatedUnion('type', [
  z.object({ type: z.literal('say'), text: z.string().min(1).max(4000) }),
  z.object({ type: z.literal('answer'), entryId: z.string(), answer: z.string().min(1).max(500) }),
  z.object({ type: z.literal('plan'), entryId: z.string(), decision: z.enum(['accepted', 'change']), note: z.string().max(2000).optional() }),
  z.object({ type: z.literal('approval'), entryId: z.string(), decision: z.enum(['approved', 'declined']) }),
  z.object({ type: z.literal('paid'), entryId: z.string() }),
  z.object({ type: z.literal('stop') }),
]);

const mutations = new Map<string, Promise<Response>>();
/** Serialize one user's mutations so simultaneous approvals cannot exceed a shared cap. */
export async function handle(req: Request, deps: AgentDeps, waitUntil: WaitUntil): Promise<Response> {
  const id = sessionUser(req);
  if (!id || req.method === 'GET' || req.method === 'HEAD') return handleInner(req, deps, waitUntil);
  const previous = mutations.get(id);
  const current = (previous ? previous.catch(() => undefined) : Promise.resolve()).then(() => handleInner(req, deps, waitUntil));
  mutations.set(id, current);
  try { return await current; }
  finally { if (mutations.get(id) === current) mutations.delete(id); }
}

async function handleInner(req: Request, deps: AgentDeps, waitUntil: WaitUntil): Promise<Response> {
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  if (!isSameOrigin(req)) return fail(403, 'cross-origin request');
  if (url.pathname === '/api/session' && req.method === 'POST') return newSession(req);
  const userId = sessionUser(req);
  if (!userId) return fail(401, 'missing identity');
  const { store } = deps;
  const body = async () => (req.method === 'GET' || req.method === 'DELETE' ? {} : await req.json().catch(() => ({})));

  try {
    if (url.pathname === '/api/runtime' && req.method === 'GET') {
      return json({ provider: deps.chat.id, model: deps.models.main, scripted: deps.chat.id === 'fake', search: deps.search.id });
    }
    // /api/me
    if (parts[0] === 'me' && parts.length === 1) {
      if (req.method === 'GET') return json(await store.getProfile(userId));
      if (req.method === 'PATCH') {
        const p = profilePatch.safeParse(await body());
        if (!p.success) return fail(400, 'bad profile');
        return json(await store.updateProfile(userId, p.data));
      }
    }
    if (parts[0] === 'me' && parts[1] === 'data' && req.method === 'DELETE') {
      for (const thing of await store.listThings(userId)) cancelTurn(thing.id);
      await store.deleteUserData(userId);
      return json({ ok: true });
    }

    // /api/memories
    if (parts[0] === 'memories') {
      if (parts.length === 1 && req.method === 'GET') return json(await store.listMemories(userId));
      if (parts.length === 2 && req.method === 'DELETE') {
        await store.deleteMemory(userId, parts[1]);
        return json({ ok: true });
      }
    }

    // /api/things
    if (parts[0] === 'things') {
      if (parts.length === 1 && req.method === 'GET') return json(await store.listThings(userId));
      if (parts.length === 1 && req.method === 'POST') {
        const p = z.object({ text: z.string().min(1).max(4000) }).safeParse(await body());
        if (!p.success) return fail(400, 'bad request');
        const text = p.data.text.trim();
        const thing = await store.createThing(userId, { title: shortTitle(text), emoji: '✨' });
        await store.addEntry(thing.id, { by: 'user', kind: 'text', payload: { text } });
        const started = await store.updateThing(userId, thing.id, { busy: true });
        waitUntil(runTurn(deps, userId, thing.id));
        return json(started, 201);
      }

      const thingId = parts[1];
      const thing = thingId ? await store.getThing(userId, thingId) : null;
      if (!thing) return fail(404, 'not found');

      if (parts.length === 2 && req.method === 'GET') {
        const detail: ThingDetail = { thing, entries: await store.listEntries(thingId) };
        return json(detail);
      }
      if (parts.length === 2 && req.method === 'DELETE') {
        if (thing.busy) return fail(409, 'busy');
        await store.deleteThing(userId, thingId);
        return json({ ok: true });
      }
      if (parts[2] === 'archive' && req.method === 'POST') {
        if (thing.busy) return fail(409, 'busy');
        const p = z.object({ archived: z.boolean() }).safeParse(await body());
        if (!p.success) return fail(400, 'bad request');
        return json(await store.updateThing(userId, thingId, { status: p.data.archived ? 'archived' : 'done' }));
      }
      if (parts[2] === 'input' && req.method === 'POST') {
        const p = userInput.safeParse(await body());
        if (!p.success) return fail(400, 'bad input');
        const input = p.data as UserInput;
        const t = serverText((await store.getProfile(userId)).lang);

        if (input.type === 'stop') {
          cancelTurn(thingId);
          const stopped = await store.updateThing(userId, thingId, { busy: false, status: 'asking', statusLine: t.stopped });
          return json({ thing: stopped, entries: await store.listEntries(thingId) });
        }
        if (thing.busy) return fail(409, 'busy');

        const applied = await applyInput(deps, userId, thingId, input);
        if (!applied.ok) return fail(409, applied.error);
        if (applied.runTurn) {
          await store.updateThing(userId, thingId, { busy: true });
          waitUntil(runTurn(deps, userId, thingId));
        }
        return json({ thing: await store.getThing(userId, thingId), entries: await store.listEntries(thingId) });
      }
    }
    return fail(404, 'not found');
  } catch (err) {
    console.error('[intent] api error', err);
    return fail(500, 'server error');
  }
}

async function applyInput(
  deps: AgentDeps,
  userId: string,
  thingId: string,
  input: Exclude<UserInput, { type: 'stop' }>,
): Promise<{ ok: true; runTurn: boolean } | { ok: false; error: string }> {
  const { store } = deps;
  if (input.type === 'say') {
    await store.addEntry(thingId, { by: 'user', kind: 'text', payload: { text: input.text.trim() } });
    return { ok: true, runTurn: true };
  }
  const entry = (await store.listEntries(thingId)).find((e) => e.id === input.entryId);
  if (!entry) return { ok: false, error: 'no such card' };

  if (input.type === 'answer') {
    if (!isKind(entry, 'question') || entry.payload.answer) return { ok: false, error: 'already answered' };
    await store.updateEntry(thingId, entry.id, { answer: input.answer });
    return { ok: true, runTurn: true };
  }
  if (input.type === 'plan') {
    if (!isKind(entry, 'plan') || entry.payload.decision) return { ok: false, error: 'already decided' };
    await store.updateEntry(thingId, entry.id, { decision: input.decision });
    if (input.decision === 'change') {
      // Wait for the user to say what to change, unless they already did.
      if (input.note?.trim()) {
        await store.addEntry(thingId, { by: 'user', kind: 'text', payload: { text: input.note.trim() } });
        return { ok: true, runTurn: true };
      }
      await store.updateThing(userId, thingId, { status: 'asking', statusLine: serverText((await store.getProfile(userId)).lang).yourTurn });
      return { ok: true, runTurn: false };
    }
    await store.updateThing(userId, thingId, { status: 'working' });
    return { ok: true, runTurn: true };
  }
  if (input.type === 'approval') {
    if (!isKind(entry, 'approval') || entry.payload.decision) return { ok: false, error: 'already decided' };
    if (input.decision === 'approved') {
      const profile = await store.getProfile(userId);
      const verdict = checkPurchase(entry.payload, profile, profile.lang);
      if (!verdict.ok) return { ok: false, error: verdict.reason };
      // Spend is counted at approval: conservative against the monthly cap.
      await store.updateProfile(userId, {
        spentThisMonthCents: profile.spentThisMonthCents + entry.payload.amountCents,
        knownMerchants: Array.from(new Set([...profile.knownMerchants, entry.payload.merchant])),
      });
      await store.updateThing(userId, thingId, { status: 'needs_you', statusLine: serverText(profile.lang).waitingPay });
    }
    await store.updateEntry(thingId, entry.id, { decision: input.decision });
    return { ok: true, runTurn: true };
  }
  if (input.type === 'paid') {
    if (!isKind(entry, 'approval') || entry.payload.decision !== 'approved' || entry.payload.paid) {
      return { ok: false, error: 'not payable' };
    }
    await store.updateEntry(thingId, entry.id, { paid: true });
    // Recorded as the user's own words so the timeline order stays true.
    await store.addEntry(thingId, { by: 'user', kind: 'text', payload: { text: serverText((await store.getProfile(userId)).lang).paid } });
    return { ok: true, runTurn: true };
  }
  return { ok: false, error: 'unknown input' };
}

function isKind<K extends Entry['kind']>(e: Entry, k: K): e is Extract<Entry, { kind: K }> {
  return e.kind === k;
}

function shortTitle(text: string): string {
  const firstLine = text.split(/\n/)[0];
  return firstLine.length > 18 ? `${firstLine.slice(0, 18)}…` : firstLine;
}
