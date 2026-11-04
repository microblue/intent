import type { Entry, Memory, Profile, Thing } from '../../shared/types';

/** New entry before the store assigns id + time. */
export type NewEntry = Omit<Entry, 'id' | 'at' | 'thingId'> & { thingId?: string };

/** Optional login for a user: lets them return from another device. */
export interface Account {
  username: string;
  userId: string;
  /** scrypt$<salt hex>$<hash hex> */
  hash: string;
  createdAt: string;
}

/** Pushed to a user's open pages when their data changes. */
export type LiveEvent = { type: 'thing'; id: string } | { type: 'memories' } | { type: 'profile' };

/**
 * Persistence for everything user-visible. Intent's own database is the
 * source of truth; model platforms only execute.
 */
export interface Store {
  getProfile(userId: string): Promise<Profile>;
  updateProfile(userId: string, patch: Partial<Omit<Profile, 'userId'>>): Promise<Profile>;

  listThings(userId: string): Promise<Thing[]>;
  getThing(userId: string, thingId: string): Promise<Thing | null>;
  createThing(userId: string, init: Pick<Thing, 'title' | 'emoji'>): Promise<Thing>;
  updateThing(userId: string, thingId: string, patch: Partial<Omit<Thing, 'id' | 'userId'>>): Promise<Thing>;
  deleteThing(userId: string, thingId: string): Promise<void>;

  listEntries(thingId: string): Promise<Entry[]>;
  addEntry(thingId: string, entry: NewEntry): Promise<Entry>;
  updateEntry(thingId: string, entryId: string, payloadPatch: Record<string, unknown>): Promise<Entry>;

  listMemories(userId: string): Promise<Memory[]>;
  addMemory(userId: string, text: string): Promise<Memory>;
  deleteMemory(userId: string, memoryId: string): Promise<void>;

  getAccount(username: string): Promise<Account | null>;
  getAccountByUser(userId: string): Promise<Account | null>;
  createAccount(account: Account): Promise<boolean>;

  deleteUserData(userId: string): Promise<void>;
  subscribe(userId: string, fn: (e: LiveEvent) => void): () => void;
}
