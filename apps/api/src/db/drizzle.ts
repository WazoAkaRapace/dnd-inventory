/**
 * Drizzle ORM handle + versioned migrations (wraps the better-sqlite3 singleton).
 *
 * Raw db.prepare(...) queries and Drizzle query-builder calls share the same
 * connection (pragmas + the normalize() SQL function apply to both). Route code
 * still uses raw SQL today; getDrizzle() is available for incremental migration.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { getDb } from './index.ts';
import * as schema from './schema.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

type DrizzleDb = BetterSQLite3Database<typeof schema>;

let drizzleInstance: DrizzleDb | null = null;

/** Drizzle handle over the shared better-sqlite3 connection. */
export function getDrizzle(): DrizzleDb {
  if (!drizzleInstance) {
    drizzleInstance = drizzle(getDb(), { schema });
  }
  return drizzleInstance;
}

/**
 * Apply pending drizzle migrations (apps/api/drizzle/*.sql, tracked in
 * __drizzle_migrations). Runs on every boot after the legacy baseline
 * migrate() — recording the no-op 0000 baseline is what makes this safe on
 * existing databases. New migrations come from `npm run db:generate`.
 */
export function runDrizzleMigrations(): void {
  const migrationsFolder = resolve(__dirname, '..', '..', 'drizzle');
  migrate(getDrizzle(), { migrationsFolder });
  console.log(`[db] drizzle migrations up to date (${migrationsFolder})`);
}
