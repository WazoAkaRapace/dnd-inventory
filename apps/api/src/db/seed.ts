/**
 * Seed the items table from data/items-seed.json (the SRD catalog, weights in kg).
 * Idempotent: skips items that already exist (matched by srd_index).
 * Run: npm run seed
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from './index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Resolve the monorepo root (3 levels up from apps/api/src/db/). */
function monorepoRoot(): string {
  return resolve(__dirname, '..', '..', '..', '..');
}

function resolveSeedPath(): string {
  // 1. env override (absolute or relative to cwd)
  // 2. relative to cwd (npm run seed from root)
  // 3. relative to monorepo root (tsx src/db/seed.ts from apps/api)
  const candidates = [
    resolve(process.cwd(), 'data', 'items-seed.json'),
    resolve(monorepoRoot(), 'data', 'items-seed.json'),
  ];
  for (const p of candidates) {
    try {
      readFileSync(p, 'utf8');
      return p;
    } catch {
      // try next
    }
  }
  throw new Error(`items-seed.json not found in: ${candidates.join(', ')}`);
}

interface SeedItem {
  source: 'srd';
  category: string;
  srdIndex: string;
  name: string;
  nameFr: string;
  rarity: string;
  weightKg: number | null;
  costQty: number | null;
  costUnit: string | null;
  description: string | null;
  damageDice: string | null;
  damageType: string | null;
  acBase: number | null;
  strMin: number | null;
  stealthDisadvantage: boolean;
  properties: string[];
  imagePath: string | null;
}

const INSERT = `
  INSERT INTO items (
    source, party_id, category, srd_index, name, name_fr, rarity,
    weight_kg, cost_qty, cost_unit, description,
    damage_dice, damage_type, ac_base, str_min, stealth_disadvantage,
    properties_json, survival_tags, image_path
  ) VALUES (
    'srd', NULL, ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?
  )
  ON CONFLICT(srd_index) DO UPDATE SET
    name_fr = excluded.name_fr,
    weight_kg = excluded.weight_kg,
    description = excluded.description,
    survival_tags = excluded.survival_tags
`;

// SRD items that count as food or water for survival tracking
const SURVIVAL_TAGS: Record<string, string[]> = {
  'rations-1-day': ['food'],
  'waterskin': ['water'],
};

const COUNT_SQL = `SELECT COUNT(*) as n FROM items WHERE source = 'srd'`;

export function seedItems(): void {
  const db = getDb();
  const seedPath = resolveSeedPath();
  const items = JSON.parse(readFileSync(seedPath, 'utf8')) as SeedItem[];
  console.log(`[seed] loading from ${seedPath}`);

  const before = (db.prepare(COUNT_SQL).get() as { n: number }).n;

  const insert = db.prepare(INSERT);
  const tx = db.transaction((rows: SeedItem[]) => {
    for (const it of rows) {
      insert.run(
        it.category,
        it.srdIndex,
        it.name,
        it.nameFr || it.name,
        it.rarity,
        it.weightKg,
        it.costQty,
        it.costUnit,
        it.description,
        it.damageDice,
        it.damageType,
        it.acBase,
        it.strMin,
        it.stealthDisadvantage ? 1 : 0,
        JSON.stringify(it.properties),
        JSON.stringify(SURVIVAL_TAGS[it.srdIndex] || []),
        it.imagePath,
      );
    }
  });
  tx(items);

  const after = (db.prepare(COUNT_SQL).get() as { n: number }).n;
  console.log(`[seed] SRD items: ${before} → ${after} (inserted ${after - before})`);
}

// If run directly, migrate first then seed
if (import.meta.url === `file://${process.argv[1]}`) {
  const { migrate } = await import('./index.ts');
  migrate();
  seedItems();
  console.log('[seed] done.');
}
