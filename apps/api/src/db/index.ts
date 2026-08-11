/**
 * SQLite connection singleton (better-sqlite3).
 * All weights in the DB are KILOGRAMS.
 */
import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database as DB } from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Resolve the monorepo root (3 levels up from apps/api/src/db/). */
function monorepoRoot(): string {
  return resolve(__dirname, '..', '..', '..', '..');
}

let dbInstance: DB | null = null;

export function getDbPath(): string {
  const fromEnv = process.env.DATABASE_PATH;
  if (fromEnv) return resolve(monorepoRoot(), fromEnv);
  return resolve(monorepoRoot(), 'data', 'db', 'inventory.sqlite');
}

export function getDb(): DB {
  if (dbInstance) return dbInstance;

  const dbPath = getDbPath();
  try {
    mkdirSync(dirname(dbPath), { recursive: true });
  } catch {
    // ignore — dir may already exist
  }

  dbInstance = new Database(dbPath);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');

  return dbInstance;
}

/** Run the schema.sql migration (idempotent). */
export function migrate(): void {
  const db = getDb();
  const schemaPath = resolve(__dirname, 'schema.sql');
  const sql = readFileSync(schemaPath, 'utf8');
  db.exec(sql);
  console.log(`[db] schema applied to ${getDbPath()}`);
}
