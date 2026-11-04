/**
 * Built-in SQLite for whichever runtime we are on: bun:sqlite in the single
 * binary, node:sqlite under Node 22+. Neither needs a native npm package.
 */
import type { Store as TinyStore } from 'tinybase';
import type { DatabasePersisterConfig, Persister } from 'tinybase/persisters';
import { createSqliteBunPersister } from 'tinybase/persisters/persister-sqlite-bun';
import { createSqliteNodePersister } from 'tinybase/persisters/persister-sqlite-node';

export interface SqliteHandle {
  persister: Persister;
  /** Consistent copy of the live database to `out` (VACUUM INTO). */
  backup(out: string): void;
  close(): void;
  runtime: 'bun' | 'node';
}

const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined';

export async function openSqlite(store: TinyStore, file: string, config: DatabasePersisterConfig): Promise<SqliteHandle> {
  // Module names in variables so neither bundler tries to resolve the other runtime's driver.
  const bunMod = 'bun:sqlite';
  const nodeMod = 'node:sqlite';
  if (isBun) {
    const { Database } = (await import(/* @vite-ignore */ bunMod)) as { Database: new (f: string, o?: object) => BunDb };
    const db = new Database(file, { create: true });
    db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;');
    return {
      persister: createSqliteBunPersister(store, db as never, config) as unknown as Persister,
      backup: (out) => db.exec(`VACUUM INTO '${out.replaceAll("'", "''")}'`),
      close: () => db.close(),
      runtime: 'bun',
    };
  }
  const { DatabaseSync } = (await import(/* @vite-ignore */ nodeMod)) as { DatabaseSync: new (f: string) => NodeDb };
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;');
  return {
    persister: createSqliteNodePersister(store, db as never, config) as unknown as Persister,
    backup: (out) => db.exec(`VACUUM INTO '${out.replaceAll("'", "''")}'`),
    close: () => db.close(),
    runtime: 'node',
  };
}

interface BunDb { exec(sql: string): void; close(): void }
interface NodeDb { exec(sql: string): void; close(): void }
