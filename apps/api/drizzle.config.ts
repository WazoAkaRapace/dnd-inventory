/**
 * drizzle-kit configuration.
 * - `db:generate` diffs src/db/schema.ts against the last snapshot in ./drizzle
 *   and writes a new versioned SQL migration (committed to the repo).
 * - Server boot applies pending migrations automatically (db/drizzle.ts).
 * - dbCredentials is only used by commands that talk to a live DB
 *   (pull/introspect, push, studio) — never by `generate`.
 */
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_PATH ?? '../../data/db/inventory.sqlite',
  },
});
