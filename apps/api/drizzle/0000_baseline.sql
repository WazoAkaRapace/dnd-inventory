-- Baseline snapshot — INTENTIONALLY A NO-OP.
-- The full schema (schema.sql + COLUMN_MIGRATIONS, frozen) is created on boot by
-- db/index.ts migrate() on every database (existing and fresh). This migration only
-- pins the drizzle-kit snapshot (drizzle/meta/0000_snapshot.json) that the diff
-- chain starts from: `npm run db:generate` diffs src/db/schema.ts against it and
-- emits 0001+, which server boot applies automatically (db/drizzle.ts).
-- Parity between this snapshot's schema and the legacy path was verified
-- structurally (columns/defaults/PKs/indexes/FKs/CHECKs) and behaviorally.
SELECT 1;
