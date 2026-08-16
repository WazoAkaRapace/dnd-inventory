/**
 * Standalone migration runner: applies schema.sql to the SQLite DB.
 * Run: npm run migrate
 */
import { getDbPath, migrate } from './index.ts';

console.log(`[migrate] target db: ${getDbPath()}`);
migrate();
console.log('[migrate] done.');
