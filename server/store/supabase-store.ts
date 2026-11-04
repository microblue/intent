import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { DEFAULT_PROFILE, type Entry, type Memory, type Profile, type Thing } from '../../shared/types';
import type { NewEntry, Store } from './types';

const now = () => new Date().toISOString();

/**
 * Hosted store for serverless deployments (Vercel), where function instances
 * share no disk. Rows hold the same JSON shapes as the file store. Only the
 * server's secret key can reach these tables; RLS blocks the public key.
 */
export class SupabaseStore implements Store {
  private readonly db: SupabaseClient;

  constructor(url: string, secretKey: string) {
    this.db = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async getProfile(userId: string): Promise<Profile> {
    const { data, error } = await this.db.from('intent_profiles').select('data').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return { ...DEFAULT_PROFILE, ...(data?.data as Partial<Profile> | undefined), userId };
  }

  async updateProfile(userId: string, patch: Partial<Omit<Profile, 'userId'>>): Promise<Profile> {
    const next = { ...(await this.getProfile(userId)), ...patch, userId };
    const { error } = await this.db.from('intent_profiles').upsert({ user_id: userId, data: next, updated_at: now() });
    if (error) throw error;
    return next;
  }

  async listThings(userId: string): Promise<Thing[]> {
    const { data, error } = await this.db.from('intent_things').select('data').eq('user_id', userId).order('updated_at', { ascending: false });
    if (error) throw error;
    return data.map((r) => r.data as Thing);
  }

  async getThing(userId: string, thingId: string): Promise<Thing | null> {
    if (!isUuid(thingId)) return null;
    const { data, error } = await this.db.from('intent_things').select('data').eq('id', thingId).eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return (data?.data as Thing | undefined) ?? null;
  }

  async createThing(userId: string, init: Pick<Thing, 'title' | 'emoji'>): Promise<Thing> {
    const t: Thing = {
      id: randomUUID(),
      userId,
      title: init.title,
      emoji: init.emoji,
      status: 'thinking',
      statusLine: '',
      busy: false,
      createdAt: now(),
      updatedAt: now(),
      costMicros: 0,
    };
    const { error } = await this.db.from('intent_things').insert({ id: t.id, user_id: userId, data: t, updated_at: t.updatedAt });
    if (error) throw error;
    return t;
  }

  async updateThing(userId: string, thingId: string, patch: Partial<Omit<Thing, 'id' | 'userId'>>): Promise<Thing> {
    const t = await this.getThing(userId, thingId);
    if (!t) throw new Error('thing not found');
    const next = { ...t, ...patch, updatedAt: now() };
    const { error } = await this.db.from('intent_things').update({ data: next, updated_at: next.updatedAt }).eq('id', thingId).eq('user_id', userId);
    if (error) throw error;
    return next;
  }

  async deleteThing(userId: string, thingId: string): Promise<void> {
    if (!isUuid(thingId)) return;
    const { error } = await this.db.from('intent_things').delete().eq('id', thingId).eq('user_id', userId);
    if (error) throw error;
  }

  async listEntries(thingId: string): Promise<Entry[]> {
    if (!isUuid(thingId)) return [];
    const { data, error } = await this.db.from('intent_entries').select('data').eq('thing_id', thingId).order('seq');
    if (error) throw error;
    return data.map((r) => r.data as Entry);
  }

  async addEntry(thingId: string, entry: NewEntry): Promise<Entry> {
    const e = { ...entry, id: randomUUID(), at: now(), thingId } as Entry;
    const { error } = await this.db.from('intent_entries').insert({ id: e.id, thing_id: thingId, data: e });
    if (error) throw error;
    return e;
  }

  async updateEntry(thingId: string, entryId: string, payloadPatch: Record<string, unknown>): Promise<Entry> {
    if (!isUuid(entryId)) throw new Error('entry not found');
    const { data, error } = await this.db.from('intent_entries').select('data').eq('id', entryId).eq('thing_id', thingId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('entry not found');
    const old = data.data as Entry;
    const e = { ...old, payload: { ...old.payload, ...payloadPatch } } as Entry;
    const { error: upErr } = await this.db.from('intent_entries').update({ data: e }).eq('id', entryId);
    if (upErr) throw upErr;
    return e;
  }

  async listMemories(userId: string): Promise<Memory[]> {
    const { data, error } = await this.db.from('intent_memories').select('data').eq('user_id', userId).order('created_at');
    if (error) throw error;
    return data.map((r) => r.data as Memory);
  }

  async addMemory(userId: string, text: string): Promise<Memory> {
    const m: Memory = { id: randomUUID(), userId, text, createdAt: now() };
    const { error } = await this.db.from('intent_memories').insert({ id: m.id, user_id: userId, data: m, created_at: m.createdAt });
    if (error) throw error;
    return m;
  }

  async deleteMemory(userId: string, memoryId: string): Promise<void> {
    if (!isUuid(memoryId)) return;
    const { error } = await this.db.from('intent_memories').delete().eq('id', memoryId).eq('user_id', userId);
    if (error) throw error;
  }

  async deleteUserData(userId: string): Promise<void> {
    // Entries go with their things (on delete cascade).
    for (const [table, col] of [['intent_things', 'user_id'], ['intent_memories', 'user_id'], ['intent_profiles', 'user_id']] as const) {
      const { error } = await this.db.from(table).delete().eq(col, userId);
      if (error) throw error;
    }
  }
}

function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
