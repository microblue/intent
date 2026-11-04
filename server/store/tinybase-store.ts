/**
 * Intent's own database: TinyBase tables in memory (fast reads, change
 * listeners, indexes) persisted row-by-row to a built-in SQLite file.
 * One process owns one data directory; nothing external is required.
 */
import { createIndexes, createStore, type Indexes, type Store as TinyStore } from 'tinybase';
import type { DatabasePersisterConfig } from 'tinybase/persisters';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_PROFILE, type Entry, type Memory, type Profile, type Thing } from '../../shared/types';
import type { Account, LiveEvent, NewEntry, Store } from './types';
import { openSqlite, type SqliteHandle } from './sqlite';

const now = () => new Date().toISOString();
const parse = <T>(s: unknown): T => JSON.parse(String(s)) as T;

const TABLES = ['profiles', 'things', 'entries', 'memories', 'accounts'] as const;
const CONFIG: DatabasePersisterConfig = {
  mode: 'tabular',
  tables: {
    load: Object.fromEntries(TABLES.map((t) => [`intent_${t}`, { tableId: t, rowIdColumnName: 'id' }])),
    save: Object.fromEntries(TABLES.map((t) => [t, { tableName: `intent_${t}`, rowIdColumnName: 'id' }])),
  },
  values: { load: true, save: true, tableName: 'intent_settings' },
};

export class TinyBaseStore implements Store {
  readonly tiny: TinyStore = createStore();
  private readonly idx: Indexes = createIndexes(this.tiny);
  private sql!: SqliteHandle;
  private readonly owners = new Map<string, string>(); // thingId -> userId
  private readonly subscribers = new Map<string, Set<(e: LiveEvent) => void>>();
  readonly file: string;

  private constructor(readonly dir: string) {
    this.file = join(dir, 'intent.db');
  }

  static async open(dir: string): Promise<TinyBaseStore> {
    const s = new TinyBaseStore(dir);
    s.sql = await openSqlite(s.tiny, s.file, CONFIG);
    await s.sql.persister.load();
    s.importLegacy();
    s.recoverInterrupted();
    await s.sql.persister.startAutoSave();
    await s.sql.persister.save(); // writes anything imported or recovered
    s.defineIndexes();
    s.listen();
    return s;
  }

  get runtime() { return this.sql.runtime; }

  /** Resolve once every change so far is written to SQLite. */
  async flush(): Promise<void> {
    for (let i = 0; i < 1000; i++) {
      await new Promise((r) => setTimeout(r, 0));
      if (this.sql.persister.getStatus() === 0) break;
    }
    await this.sql.persister.schedule();
  }

  async close(): Promise<void> {
    await this.flush();
    await this.sql.persister.stopAutoSave();
    await this.sql.persister.destroy();
    this.sql.close();
  }

  backup(out: string): void { this.sql.backup(out); }
  bytesOnDisk(): number {
    return ['', '-wal'].reduce((n, ext) => n + (existsSync(this.file + ext) ? statSync(this.file + ext).size : 0), 0);
  }
  counts() {
    return Object.fromEntries(TABLES.map((t) => [t, this.tiny.getRowCount(t)])) as Record<(typeof TABLES)[number], number>;
  }

  // ----- settings (instance-wide values) -----
  getSetting(key: string): string | undefined {
    const v = this.tiny.getValue(key);
    return v === undefined ? undefined : String(v);
  }
  async setSetting(key: string, value: string): Promise<void> {
    this.tiny.setValue(key, value);
    await this.flush();
  }

  // ----- profiles -----
  async getProfile(userId: string): Promise<Profile> {
    const raw = this.tiny.getCell('profiles', userId, 'json');
    return { ...DEFAULT_PROFILE, ...(raw ? parse<Partial<Profile>>(raw) : {}), userId };
  }
  async updateProfile(userId: string, patch: Partial<Omit<Profile, 'userId'>>): Promise<Profile> {
    const next = { ...(await this.getProfile(userId)), ...patch, userId };
    this.tiny.setRow('profiles', userId, { json: JSON.stringify(next), updatedAt: now() });
    await this.flush();
    return next;
  }

  // ----- things -----
  async listThings(userId: string): Promise<Thing[]> {
    return this.idx.getSliceRowIds('thingsByUser', userId).map((id) => parse<Thing>(this.tiny.getCell('things', id, 'json')));
  }
  async getThing(userId: string, thingId: string): Promise<Thing | null> {
    const row = this.tiny.getRow('things', thingId);
    return row.userId === userId ? parse<Thing>(row.json) : null;
  }
  async createThing(userId: string, init: Pick<Thing, 'title' | 'emoji'>): Promise<Thing> {
    const t: Thing = {
      id: randomUUID(), userId, title: init.title, emoji: init.emoji, status: 'thinking', statusLine: '',
      busy: false, createdAt: now(), updatedAt: now(), costMicros: 0,
    };
    this.putThing(t);
    await this.flush();
    return t;
  }
  async updateThing(userId: string, thingId: string, patch: Partial<Omit<Thing, 'id' | 'userId'>>): Promise<Thing> {
    const t = await this.getThing(userId, thingId);
    if (!t) throw new Error('thing not found');
    const next = { ...t, ...patch, updatedAt: now() };
    this.putThing(next);
    await this.flush();
    return next;
  }
  async deleteThing(userId: string, thingId: string): Promise<void> {
    if (!(await this.getThing(userId, thingId))) return;
    this.tiny.transaction(() => {
      for (const id of this.idx.getSliceRowIds('entriesByThing', thingId)) this.tiny.delRow('entries', id);
      this.tiny.delRow('things', thingId);
    });
    await this.flush();
  }
  private putThing(t: Thing) {
    this.tiny.setRow('things', t.id, { userId: t.userId, updatedAt: t.updatedAt, json: JSON.stringify(t) });
  }

  // ----- entries (a thing's timeline) -----
  async listEntries(thingId: string): Promise<Entry[]> {
    return this.idx.getSliceRowIds('entriesByThing', thingId).map((id) => parse<Entry>(this.tiny.getCell('entries', id, 'json')));
  }
  async addEntry(thingId: string, entry: NewEntry): Promise<Entry> {
    const e = { ...entry, id: randomUUID(), at: now(), thingId } as Entry;
    const seq = Number(this.tiny.getValue('entrySeq') ?? 0) + 1;
    this.tiny.transaction(() => {
      this.tiny.setValue('entrySeq', seq);
      this.tiny.setRow('entries', e.id, { thingId, seq, json: JSON.stringify(e) });
    });
    await this.flush();
    return e;
  }
  async updateEntry(thingId: string, entryId: string, payloadPatch: Record<string, unknown>): Promise<Entry> {
    const row = this.tiny.getRow('entries', entryId);
    if (row.thingId !== thingId) throw new Error('entry not found');
    const old = parse<Entry>(row.json);
    const e = { ...old, payload: { ...old.payload, ...payloadPatch } } as Entry;
    this.tiny.setCell('entries', entryId, 'json', JSON.stringify(e));
    await this.flush();
    return e;
  }

  // ----- memories -----
  async listMemories(userId: string): Promise<Memory[]> {
    return this.idx.getSliceRowIds('memoriesByUser', userId).map((id) => parse<Memory>(this.tiny.getCell('memories', id, 'json')));
  }
  async addMemory(userId: string, text: string): Promise<Memory> {
    const m: Memory = { id: randomUUID(), userId, text, createdAt: now() };
    this.tiny.setRow('memories', m.id, { userId, createdAt: m.createdAt, json: JSON.stringify(m) });
    await this.flush();
    return m;
  }
  async deleteMemory(userId: string, memoryId: string): Promise<void> {
    if (this.tiny.getCell('memories', memoryId, 'userId') !== userId) return;
    this.tiny.delRow('memories', memoryId);
    await this.flush();
  }

  // ----- accounts (optional username + password for a user) -----
  async getAccount(username: string): Promise<Account | null> {
    const row = this.tiny.getRow('accounts', username);
    return row.userId ? { username, userId: String(row.userId), hash: String(row.hash), createdAt: String(row.createdAt) } : null;
  }
  async getAccountByUser(userId: string): Promise<Account | null> {
    const [name] = this.idx.getSliceRowIds('accountsByUser', userId);
    return name ? this.getAccount(name) : null;
  }
  async createAccount(a: Account): Promise<boolean> {
    if (this.tiny.hasRow('accounts', a.username)) return false;
    this.tiny.setRow('accounts', a.username, { userId: a.userId, hash: a.hash, createdAt: a.createdAt });
    await this.flush();
    return true;
  }

  async deleteUserData(userId: string): Promise<void> {
    this.tiny.transaction(() => {
      for (const id of this.idx.getSliceRowIds('thingsByUser', userId)) {
        for (const e of this.idx.getSliceRowIds('entriesByThing', id)) this.tiny.delRow('entries', e);
        this.tiny.delRow('things', id);
      }
      for (const id of this.idx.getSliceRowIds('memoriesByUser', userId)) this.tiny.delRow('memories', id);
      for (const id of this.idx.getSliceRowIds('accountsByUser', userId)) this.tiny.delRow('accounts', id);
      this.tiny.delRow('profiles', userId);
    });
    await this.flush();
  }

  /** Everyone with data, for the admin page. */
  listUsers(): { userId: string; username: string | null; things: number; memories: number; lastActive: string }[] {
    const ids = new Set<string>([
      ...this.tiny.getRowIds('profiles'),
      ...this.idx.getSliceIds('thingsByUser'),
      ...this.idx.getSliceIds('memoriesByUser'),
    ]);
    return [...ids].map((userId) => {
      const things = this.idx.getSliceRowIds('thingsByUser', userId);
      const last = things.length ? String(this.tiny.getCell('things', things[0], 'updatedAt')) : String(this.tiny.getCell('profiles', userId, 'updatedAt') ?? '');
      return {
        userId,
        username: this.idx.getSliceRowIds('accountsByUser', userId)[0] ?? null,
        things: things.length,
        memories: this.idx.getSliceRowIds('memoriesByUser', userId).length,
        lastActive: last,
      };
    }).sort((a, b) => b.lastActive.localeCompare(a.lastActive));
  }

  // ----- live updates -----
  subscribe(userId: string, fn: (e: LiveEvent) => void): () => void {
    let set = this.subscribers.get(userId);
    if (!set) this.subscribers.set(userId, (set = new Set()));
    set.add(fn);
    return () => { set!.delete(fn); if (!set!.size) this.subscribers.delete(userId); };
  }
  private emit(userId: string | undefined, e: LiveEvent) {
    if (!userId) return;
    for (const fn of this.subscribers.get(userId) ?? []) fn(e);
  }
  private listen() {
    for (const id of this.tiny.getRowIds('things')) this.owners.set(id, String(this.tiny.getCell('things', id, 'userId')));
    this.tiny.addRowListener('things', null, (_s, _t, id) => {
      const uid = this.tiny.getCell('things', id, 'userId');
      if (uid) this.owners.set(id, String(uid));
      this.emit(this.owners.get(id), { type: 'thing', id });
      if (!uid) this.owners.delete(id);
    });
    this.tiny.addRowListener('entries', null, (_s, _t, id, getCellChange) => {
      const thingId = String(this.tiny.getCell('entries', id, 'thingId') ?? getCellChange?.('entries', id, 'thingId')[1] ?? '');
      this.emit(this.owners.get(thingId), { type: 'thing', id: thingId });
    });
    this.tiny.addRowListener('memories', null, (_s, _t, id, getCellChange) => {
      const uid = this.tiny.getCell('memories', id, 'userId') ?? getCellChange?.('memories', id, 'userId')[1];
      this.emit(uid ? String(uid) : undefined, { type: 'memories' });
    });
    this.tiny.addRowListener('profiles', null, (_s, _t, id) => this.emit(id, { type: 'profile' }));
  }

  private defineIndexes() {
    const desc = (a: unknown, b: unknown) => String(b).localeCompare(String(a));
    const asc = (a: unknown, b: unknown) => (a as number) < (b as number) ? -1 : (a as number) > (b as number) ? 1 : String(a).localeCompare(String(b));
    this.idx.setIndexDefinition('thingsByUser', 'things', 'userId', 'updatedAt', undefined, desc);
    this.idx.setIndexDefinition('entriesByThing', 'entries', 'thingId', 'seq', undefined, asc);
    this.idx.setIndexDefinition('memoriesByUser', 'memories', 'userId', 'createdAt');
    this.idx.setIndexDefinition('accountsByUser', 'accounts', 'userId');
  }

  /** A turn that was running when the process stopped can't resume; tell the user. */
  private recoverInterrupted() {
    for (const id of this.tiny.getRowIds('things')) {
      const t = parse<Thing>(this.tiny.getCell('things', id, 'json'));
      if (!t.busy) continue;
      const lang = this.tiny.getCell('profiles', t.userId, 'json');
      const en = lang ? parse<Profile>(lang).lang === 'en' : false;
      this.putThing({ ...t, busy: false, status: 'asking', statusLine: en ? 'Interrupted — please try again' : '刚才中断了，请再试一次' });
    }
  }

  /** One-time import from the earlier JSON snapshot format (store.json). */
  private importLegacy() {
    if (this.tiny.getRowCount('things') || this.tiny.getRowCount('profiles')) return;
    const candidates = [join(this.dir, 'store.json'), join(this.dir, 'data', 'store.json'), process.env.INTENT_LEGACY_FILE].filter(Boolean) as string[];
    const file = candidates.find((f) => existsSync(f));
    if (!file) return;
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    const db: { profiles: Record<string, Profile>; things: Record<string, Thing>; entries: Record<string, Entry[]>; memories: Record<string, Memory> } =
      raw.format === 'intent-tinybase-v1'
        ? Object.fromEntries(['profiles', 'things', 'entries', 'memories'].map((t) => [t, Object.fromEntries(Object.entries(raw.tables[t] ?? {}).map(([id, row]) => [id, JSON.parse(String((row as { json: string }).json))]))])) as never
        : raw;
    let seq = 0;
    this.tiny.transaction(() => {
      for (const [id, p] of Object.entries(db.profiles ?? {})) this.tiny.setRow('profiles', id, { json: JSON.stringify(p), updatedAt: now() });
      for (const t of Object.values(db.things ?? {})) this.putThing(t);
      for (const list of Object.values(db.entries ?? {})) for (const e of list) this.tiny.setRow('entries', e.id, { thingId: e.thingId, seq: ++seq, json: JSON.stringify(e) });
      for (const m of Object.values(db.memories ?? {})) this.tiny.setRow('memories', m.id, { userId: m.userId, createdAt: m.createdAt, json: JSON.stringify(m) });
      this.tiny.setValue('entrySeq', seq);
    });
    const key = file + '.session-key';
    if (existsSync(key) && !this.tiny.hasValue('sessionSecret')) this.tiny.setValue('sessionSecret', readFileSync(key, 'utf8').trim());
    console.info(`[intent] imported legacy data from ${file}`);
  }
}

export function newSecret(): string { return randomBytes(32).toString('hex'); }
