/**
 * Snake_case full-row projections for Drizzle selects.
 *
 * The route mappers (mapCharacter*, mapSpell, mapMonster, …) read raw DB rows
 * keyed by column name (snake_case). `select(cols(table))` reproduces exactly
 * that row shape while querying through Drizzle — same keys, same values,
 * mappers untouched. This is the load-bearing convention of the raw-SQL →
 * Drizzle migration: a query rewrite must not change what mappers see.
 */
import { type Column, getTableColumns, type SQLiteTable } from 'drizzle-orm';

export function cols(table: SQLiteTable): Record<string, Column> {
  const out: Record<string, Column> = {};
  for (const column of Object.values(getTableColumns(table))) {
    out[column.name] = column;
  }
  return out;
}
