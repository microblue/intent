import { join, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { newSecret, TinyBaseStore } from './store/tinybase-store';
import { OpenAICompatProvider } from './agent/provider';
import { MetaWebSearch, PluginWebSearch } from './agent/search';
import { FakeProvider, FakeSearch } from './agent/fake';
import type { AgentDeps } from './agent/turn';
import { setSessionSecret } from './session';

/**
 * Model ids live here only, per role. Use Meta Muse Spark by default;
 * override with INTENT_MODEL_MAIN when explicitly configuring a provider.
 */
export const MODELS = {
  main: process.env.INTENT_MODEL_MAIN ?? (process.env.INTENT_PROVIDER === 'openrouter' ? 'meta/muse-spark-1.3' : 'muse-spark-1.3'),
  search: process.env.INTENT_MODEL_SEARCH ?? 'meta/muse-spark-1.3',
};

export type Deps = AgentDeps & { store: TinyBaseStore };
let cached: Promise<Deps> | undefined;

/** Data directory: INTENT_DATA_DIR, default ./intent_data. */
export function dataDir(): string {
  return resolve(process.env.INTENT_DATA_DIR ?? join(process.cwd(), 'intent_data'));
}

export function getDeps(): Promise<Deps> {
  return (cached ??= open().catch((e) => { cached = undefined; throw e; }));
}

async function open(): Promise<Deps> {
  const models = provider(); // fail fast on missing model config, before touching data
  const dir = dataDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const store = await TinyBaseStore.open(dir);
  let secret = process.env.INTENT_SESSION_SECRET ?? store.getSetting('sessionSecret');
  if (!secret) { secret = newSecret(); await store.setSetting('sessionSecret', secret); }
  setSessionSecret(secret);
  console.info(`[intent] provider=${models.chat.id} model=${MODELS.main} data=${store.file} runtime=${store.runtime}`);
  return { store, ...models, models: MODELS };
}

function provider(): Pick<AgentDeps, 'chat' | 'search'> {
  const p = process.env.INTENT_PROVIDER ?? 'meta';
  if (p === 'fake') return { chat: new FakeProvider(), search: new FakeSearch() };
  if (p === 'meta') {
    const key = process.env.MODEL_API_KEY;
    if (!key) throw new Error('MODEL_API_KEY is not set. Configure Meta or OpenRouter, or set INTENT_PROVIDER=fake for scripted tests.');
    return { chat: new OpenAICompatProvider('meta', 'https://api.meta.ai/v1', key), search: new MetaWebSearch(key, MODELS.main) };
  }
  if (p === 'openrouter') {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new Error('OPENROUTER_API_KEY is not set');
    const chat = new OpenAICompatProvider('openrouter', 'https://openrouter.ai/api/v1', key, { 'X-Title': 'Intent' });
    return { chat, search: new PluginWebSearch(chat, MODELS.search) };
  }
  throw new Error('Unknown INTENT_PROVIDER: ' + p);
}
