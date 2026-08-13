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

  // Register a normalize() function for accent-insensitive search.
  // Strips diacritics (é→e, è→e, ç→c) and lowercases.
  dbInstance.function('normalize', (text: string | null): string => {
    if (!text) return '';
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  });

  return dbInstance;
}

/**
 * Columns that were added to existing tables AFTER their initial creation.
 * `CREATE TABLE IF NOT EXISTS` is a no-op on existing tables, so schema.sql
 * alone cannot add these to an older database. We introspect with PRAGMA
 * table_info() and ALTER TABLE ... ADD COLUMN for any that are missing.
 *
 * Note: SQLite ADD COLUMN cannot use non-constant DEFAULTs or add CHECK
 * constraints — only the type + constant default is included here. The
 * defaults guarantee valid initial values; app-level validation enforces
 * ranges (e.g. exhaustion 0–6) thereafter.
 */
const COLUMN_MIGRATIONS: Record<string, Array<{ name: string; ddl: string }>> = {
  characters: [
    { name: 'capacity_multiplier', ddl: 'REAL NOT NULL DEFAULT 1.0' },
    { name: 'exhaustion', ddl: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'conditions', ddl: "TEXT NOT NULL DEFAULT '[]'" },
    { name: 'food_days', ddl: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'water_days', ddl: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'max_hp', ddl: 'INTEGER NOT NULL DEFAULT 1' },
    { name: 'current_hp', ddl: 'INTEGER NOT NULL DEFAULT 1' },
    { name: 'temp_hp', ddl: 'INTEGER NOT NULL DEFAULT 0' },
    // --- Character sheet (abilities, skills, spells) ---
    { name: 'level', ddl: 'INTEGER NOT NULL DEFAULT 1' },
    { name: 'dexterity', ddl: 'INTEGER NOT NULL DEFAULT 10' },
    { name: 'constitution', ddl: 'INTEGER NOT NULL DEFAULT 10' },
    { name: 'intelligence', ddl: 'INTEGER NOT NULL DEFAULT 10' },
    { name: 'wisdom', ddl: 'INTEGER NOT NULL DEFAULT 10' },
    { name: 'charisma', ddl: 'INTEGER NOT NULL DEFAULT 10' },
    { name: 'character_class', ddl: 'TEXT' },
    { name: 'race', ddl: 'TEXT' },
    { name: 'background', ddl: 'TEXT' },
    { name: 'speed', ddl: 'INTEGER NOT NULL DEFAULT 9' },
    { name: 'skill_proficiencies', ddl: "TEXT NOT NULL DEFAULT '[]'" },
    { name: 'saving_throw_proficiencies', ddl: "TEXT NOT NULL DEFAULT '[]'" },
    { name: 'spell_slots_used', ddl: "TEXT NOT NULL DEFAULT '[0,0,0,0,0,0,0,0,0]'" },
    // --- Description / personality ---
    { name: 'alignment', ddl: 'TEXT' },
    { name: 'sex', ddl: 'TEXT' },
    { name: 'height', ddl: 'TEXT' },
    { name: 'weight', ddl: 'TEXT' },
    { name: 'age', ddl: 'TEXT' },
    { name: 'skin', ddl: 'TEXT' },
    { name: 'eyes', ddl: 'TEXT' },
    { name: 'hair', ddl: 'TEXT' },
    { name: 'portrait_url', ddl: 'TEXT' },
    { name: 'personality_traits', ddl: 'TEXT' },
    { name: 'ideals', ddl: 'TEXT' },
    { name: 'bonds', ddl: 'TEXT' },
    { name: 'flaws', ddl: 'TEXT' },
    { name: 'appearance', ddl: 'TEXT' },
    { name: 'armor_class_override', ddl: 'INTEGER' },
    { name: 'death_save_successes', ddl: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'death_save_failures', ddl: 'INTEGER NOT NULL DEFAULT 0' },
  ],
  items: [
    { name: 'survival_tags', ddl: "TEXT NOT NULL DEFAULT '[]'" },
    { name: 'aliases', ddl: "TEXT" },
  ],
  storage_locations: [
    { name: 'strength', ddl: 'INTEGER DEFAULT 10' },
    { name: 'multiplier', ddl: 'REAL NOT NULL DEFAULT 1.0' },
    { name: 'capacity_kg', ddl: 'REAL' },
    { name: 'own_weight_kg', ddl: 'REAL NOT NULL DEFAULT 0' },
    { name: 'item_id', ddl: 'INTEGER REFERENCES items(id) ON DELETE SET NULL' },
    { name: 'sort_order', ddl: 'INTEGER NOT NULL DEFAULT 0' },
  ],
  inventory: [
    { name: 'storage_location_id', ddl: 'INTEGER REFERENCES storage_locations(id) ON DELETE SET NULL' },
  ],
  character_features: [
    { name: 'counter_max', ddl: 'INTEGER' },
    { name: 'counter_current', ddl: 'INTEGER' },
  ],
};

/**
 * Backfill missing columns on existing tables.
 * Idempotent: queries PRAGMA table_info() and only ALTERs what's absent.
 */
function migrateColumns(db: DB): void {
  let added = 0;
  for (const [table, columns] of Object.entries(COLUMN_MIGRATIONS)) {
    // table_info returns rows: { cid, name, type, notnull, dflt_value, pk }
    const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    const existing = new Set(rows.map((r) => r.name));
    for (const col of columns) {
      if (existing.has(col.name)) continue;
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${col.name} ${col.ddl}`);
      console.log(`[db] added column: ${table}.${col.name}`);
      added++;
    }
  }
  if (added > 0) {
    console.log(`[db] column migration: ${added} column(s) backfilled`);
  }
}

/** Run the schema.sql migration (idempotent) + backfill missing columns. */
export function migrate(): void {
  const db = getDb();
  const schemaPath = resolve(__dirname, 'schema.sql');
  const sql = readFileSync(schemaPath, 'utf8');
  db.exec(sql);
  console.log(`[db] schema applied to ${getDbPath()}`);
  migrateColumns(db);
}
