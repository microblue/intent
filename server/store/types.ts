import type { Entry, Memory, Profile, Thing } from '../../shared/types';

/** New entry before the store assigns id + time. */
export type NewEntry = Omit<Entry, 'id' | 'at' | 'thingId'> & { thingId?: string };

/**
 * Persistence for everything user-visible. Our store is the source of truth;
 * model platforms only execute. Two implementations: a local JSON file (dev,
 * tests) and Supabase (production).
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

  deleteUserData(userId: string): Promise<void>;
}
