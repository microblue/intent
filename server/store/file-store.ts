import { createStore } from 'tinybase';
import { copyFileSync, constants, fsyncSync, openSync, closeSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DEFAULT_PROFILE, type Entry, type Memory, type Profile, type Thing } from '../../shared/types';
import type { NewEntry, Store } from './types';

interface Db {
  profiles: Record<string, Profile>;
  things: Record<string, Thing>;
  entries: Record<string, Entry[]>;
  memories: Record<string, Memory>;
}

const now = () => new Date().toISOString();

/** Embedded TinyBase tables with atomic disk snapshots; one writer per instance. */
export class TinyBaseStore implements Store {
  readonly tinybase = createStore();
  private db: Db;

  constructor(private readonly path: string) {
    try {
      const raw = JSON.parse(readFileSync(path, 'utf8'));
      if (raw.format === 'intent-tinybase-v1') {
        this.tinybase.setTables(raw.tables);
        this.db = Object.fromEntries(['profiles', 'things', 'entries', 'memories'].map(table => [table, Object.fromEntries(Object.entries(this.tinybase.getTable(table)).map(([id, row]) => [id, JSON.parse(String(row.json))]))])) as unknown as Db;
      } else {
        this.db = raw as Db;
        copyFileSync(path, `${path}.legacy-backup`, constants.COPYFILE_EXCL);
      }
      if (!this.db.profiles || !this.db.things || !this.db.entries || !this.db.memories) throw new Error('Invalid Intent store');
      let recovered = false;
      for (const thing of Object.values(this.db.things)) {
        if (!thing.busy) continue;
        thing.busy = false;
        thing.status = 'asking';
        thing.statusLine = this.db.profiles[thing.userId]?.lang === 'en' ? 'Interrupted — please try again' : '刚才中断了，请再试一次';
        recovered = true;
      }
      if (recovered || raw.format !== 'intent-tinybase-v1') this.save();
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      this.db = { profiles: {}, things: {}, entries: {}, memories: {} };
    }
  }

  private save() {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    this.tinybase.setTables(Object.fromEntries(Object.entries(this.db).map(([table, rows]) => [table, Object.fromEntries(Object.entries(rows).map(([id, value]) => [id, { json: JSON.stringify(value) }]))])));
    writeFileSync(tmp, JSON.stringify({ format: 'intent-tinybase-v1', tables: this.tinybase.getTables() }), { mode: 0o600 });
    const fd = openSync(tmp, 'r');
    try { fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(tmp, this.path);
  }

  async getProfile(userId: string): Promise<Profile> {
    return { ...DEFAULT_PROFILE, ...this.db.profiles[userId], userId };
  }

  async updateProfile(userId: string, patch: Partial<Omit<Profile, 'userId'>>): Promise<Profile> {
    const next = { ...(await this.getProfile(userId)), ...patch, userId };
    this.db.profiles[userId] = next;
    this.save();
    return next;
  }

  async listThings(userId: string): Promise<Thing[]> {
    return Object.values(this.db.things)
      .filter((t) => t.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getThing(userId: string, thingId: string): Promise<Thing | null> {
    const t = this.db.things[thingId];
    return t && t.userId === userId ? t : null;
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
    this.db.things[t.id] = t;
    this.db.entries[t.id] = [];
    this.save();
    return t;
  }

  async updateThing(userId: string, thingId: string, patch: Partial<Omit<Thing, 'id' | 'userId'>>): Promise<Thing> {
    const t = await this.getThing(userId, thingId);
    if (!t) throw new Error('thing not found');
    const next = { ...t, ...patch, updatedAt: now() };
    this.db.things[thingId] = next;
    this.save();
    return next;
  }

  async deleteThing(userId: string, thingId: string): Promise<void> {
    if (!(await this.getThing(userId, thingId))) return;
    delete this.db.things[thingId];
    delete this.db.entries[thingId];
    this.save();
  }

  async listEntries(thingId: string): Promise<Entry[]> {
    return this.db.entries[thingId] ?? [];
  }

  async addEntry(thingId: string, entry: NewEntry): Promise<Entry> {
    const e = { ...entry, id: randomUUID(), at: now(), thingId } as Entry;
    (this.db.entries[thingId] ??= []).push(e);
    this.save();
    return e;
  }

  async updateEntry(thingId: string, entryId: string, payloadPatch: Record<string, unknown>): Promise<Entry> {
    const list = this.db.entries[thingId] ?? [];
    const i = list.findIndex((e) => e.id === entryId);
    if (i < 0) throw new Error('entry not found');
    const e = { ...list[i], payload: { ...list[i].payload, ...payloadPatch } } as Entry;
    list[i] = e;
    this.save();
    return e;
  }

  async listMemories(userId: string): Promise<Memory[]> {
    return Object.values(this.db.memories)
      .filter((m) => m.userId === userId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async addMemory(userId: string, text: string): Promise<Memory> {
    const m: Memory = { id: randomUUID(), userId, text, createdAt: now() };
    this.db.memories[m.id] = m;
    this.save();
    return m;
  }

  async deleteMemory(userId: string, memoryId: string): Promise<void> {
    if (this.db.memories[memoryId]?.userId === userId) {
      delete this.db.memories[memoryId];
      this.save();
    }
  }

  async deleteUserData(userId: string): Promise<void> {
    for (const t of await this.listThings(userId)) {
      delete this.db.things[t.id];
      delete this.db.entries[t.id];
    }
    for (const m of await this.listMemories(userId)) delete this.db.memories[m.id];
    delete this.db.profiles[userId];
    this.save();
  }
}

// Compatibility for existing integrations and tests.
export { TinyBaseStore as FileStore };
