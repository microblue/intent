import { join } from 'node:path';
import { TinyBaseStore } from './store/file-store';
import { SupabaseStore } from './store/supabase-store';
import type { Store } from './store/types';
import { OpenAICompatProvider } from './agent/provider';
import { MetaWebSearch, PluginWebSearch } from './agent/search';
import { FakeProvider, FakeSearch } from './agent/fake';
import type { AgentDeps } from './agent/turn';

/**
 * Model ids live here only, per role. Use Meta Muse Spark by default;
 * override with INTENT_MODEL_MAIN when explicitly configuring a provider.
 */
export const MODELS = {
  main: process.env.INTENT_MODEL_MAIN ?? (process.env.INTENT_PROVIDER === 'openrouter' ? 'meta/muse-spark-1.3' : 'muse-spark-1.3'),
  search: process.env.INTENT_MODEL_SEARCH ?? 'meta/muse-spark-1.3',
};

let cached: AgentDeps | undefined;

export function getDeps(): AgentDeps {
  if (cached) return cached;
  // Hosted (Vercel) uses Supabase because function instances share no disk;
  // local dev, tests and the Linux package keep the TinyBase file.
  const store: Store = process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY
    ? new SupabaseStore(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY)
    : new TinyBaseStore(process.env.INTENT_DATA_FILE ?? join(process.cwd(), '.data', 'intent-dev.json'));
  const provider = process.env.INTENT_PROVIDER ?? 'meta';
  if (provider === 'fake') {
    cached = { store, chat: new FakeProvider(), search: new FakeSearch(), models: MODELS };
  } else if (provider === 'meta') {
    const key = process.env.MODEL_API_KEY;
    if (!key) throw new Error('MODEL_API_KEY is not set. Configure Meta or explicitly select INTENT_PROVIDER=fake for scripted tests.');
    const chat = new OpenAICompatProvider('meta', 'https://api.meta.ai/v1', key);
    cached = { store, chat, search: new MetaWebSearch(key, MODELS.main), models: MODELS };
  } else if (provider === 'openrouter') {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new Error('OPENROUTER_API_KEY is not set');
    const chat = new OpenAICompatProvider('openrouter', 'https://openrouter.ai/api/v1', key, {
      'X-Title': 'Intent',
    });
    cached = { store, chat, search: new PluginWebSearch(chat, MODELS.search), models: MODELS };
  }
  if (!cached) throw new Error('Unknown INTENT_PROVIDER');
  console.info(`[intent] provider=${cached.chat.id} model=${MODELS.main}`);
  return cached;
}
