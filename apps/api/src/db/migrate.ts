/**
 * Standalone migration runner: applies schema.sql + drizzle migrations to the SQLite DB.
 * Run: npm run migrate
 */
import { runDrizzleMigrations } from './drizzle.ts';
import { getDbPath, migrate } from './index.ts';

console.log(`[migrate] target db: ${getDbPath()}`);
migrate();
runDrizzleMigrations();
console.log('[migrate] done.');
