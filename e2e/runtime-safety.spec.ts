import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TinyBaseStore } from '../server/store/tinybase-store';
import { runTurn, cancelTurn, type AgentDeps } from '../server/agent/turn';
import { FakeSearch } from '../server/agent/fake';
import type { ChatResult, ToolCallWire } from '../server/agent/provider';

const call = (name: string, args: unknown): ToolCallWire => ({ id: name, type: 'function', function: { name, arguments: JSON.stringify(args) } });
const result = (toolCalls: ToolCallWire[], text: string | null = null): ChatResult => ({ text, toolCalls, costMicros: 0, citations: [] });

test('terminal approval card prevents tools later in the same response executing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'intent-safety-'));
  try {
    const store = await TinyBaseStore.open(dir);
    const thing = await store.createThing('test', { title: 'Synthetic task', emoji: '🧪' });
    const deps: AgentDeps = { store, search: new FakeSearch(), models: { main: 'test' }, chat: { id: 'test', complete: async () => result([
      call('propose_plan', { steps: ['Ask permission'], eta: 'One minute' }),
      call('remember', { fact: 'THIS MUST NOT BE SAVED BEFORE APPROVAL' }),
      call('finish', { status_line: 'Wrongly finished' }),
    ]) } };
    await runTurn(deps, 'test', thing.id);
    expect((await store.getThing('test', thing.id))?.status).toBe('plan');
    expect(await store.listMemories('test')).toHaveLength(0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('cancelled model result cannot write into a restarted task', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'intent-cancel-'));
  try {
    const store = await TinyBaseStore.open(dir);
    const thing = await store.createThing('test', { title: 'Synthetic task', emoji: '🧪' });
    let release!: (value: ChatResult) => void;
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const deps: AgentDeps = { store, search: new FakeSearch(), models: { main: 'test' }, chat: { id: 'test', complete: async () => { started(); return new Promise<ChatResult>(resolve => { release = resolve; }); } } };
    const old = runTurn(deps, 'test', thing.id);
    await ready;
    cancelTurn(thing.id);
    await store.updateThing('test', thing.id, { busy: false });
    await runTurn({ ...deps, chat: { id: 'new', complete: async () => result([call('finish', { status_line: 'New task finished' })]) } }, 'test', thing.id);
    release(result([call('deliver', { title: 'Old output', body: 'Must not appear' })]));
    await old;
    expect((await store.getThing('test', thing.id))?.statusLine).toBe('New task finished');
    expect((await store.listEntries(thing.id)).some(e => e.kind === 'result')).toBe(false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('anonymous sessions isolate data and forged headers do not authenticate', async ({ playwright, baseURL }) => {
  const a = await playwright.request.newContext({ baseURL });
  const b = await playwright.request.newContext({ baseURL });
  try {
    const denied = await b.get('/api/me', { headers: { 'x-intent-user': '00000000-0000-4000-8000-000000000000' } });
    expect(denied.status()).toBe(401);
    await a.post('/api/session'); await b.post('/api/session');
    const created = await a.post('/api/things', { data: { text: '这是不是骗子？' } });
    expect(created.status()).toBe(201);
    const thing = await created.json();
    expect((await b.get('/api/things/' + thing.id)).status()).toBe(404);
    const forged = await b.post('/api/things', { headers: { Origin: 'https://attacker.invalid' }, data: { text: 'test' } });
    expect(forged.status()).toBe(403);
  } finally { await a.dispose(); await b.dispose(); }
});

test('a changed spending cap is rechecked at approval, not only proposal', async ({ playwright, baseURL }) => {
  const client = await playwright.request.newContext({ baseURL });
  try {
    await client.post('/api/session');
    const thing = await (await client.post('/api/things', { data: { text: '帮我挑礼物' } })).json();
    const read = async () => (await client.get('/api/things/' + thing.id)).json();
    await expect.poll(async () => (await read()).thing.busy).toBe(false);
    let data = await read();
    await client.post('/api/things/' + thing.id + '/input', { data: { type: 'answer', entryId: data.entries.find((e: any) => e.kind === 'question').id, answer: '5岁' } });
    await expect.poll(async () => (await read()).thing.busy).toBe(false);
    data = await read();
    await client.post('/api/things/' + thing.id + '/input', { data: { type: 'plan', entryId: data.entries.find((e: any) => e.kind === 'plan').id, decision: 'accepted' } });
    await expect.poll(async () => (await read()).thing.busy).toBe(false);
    data = await read();
    await client.patch('/api/me', { data: { perPurchaseLimitCents: 0 } });
    const rejected = await client.post('/api/things/' + thing.id + '/input', { data: { type: 'approval', entryId: data.entries.find((e: any) => e.kind === 'approval').id, decision: 'approved' } });
    expect(rejected.status()).toBe(409);
    expect((await (await client.get('/api/me')).json()).spentThisMonthCents).toBe(0);
  } finally { await client.dispose(); }
});


test('restart recovers an interrupted task without deleting its timeline', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'intent-restart-'));
  try {
    const before = await TinyBaseStore.open(dir);
    const thing = await before.createThing('test', { title: 'Synthetic', emoji: '🧪' });
    await before.addEntry(thing.id, { by: 'user', kind: 'text', payload: { text: 'Keep this synthetic message' } });
    await before.updateThing('test', thing.id, { busy: true });
    await before.close();
    const after = await TinyBaseStore.open(dir);
    expect((await after.getThing('test', thing.id))?.busy).toBe(false);
    expect((await after.getThing('test', thing.id))?.status).toBe('asking');
    expect(await after.listEntries(thing.id)).toHaveLength(1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
