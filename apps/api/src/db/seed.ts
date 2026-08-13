/**
 * Seed the items table from data/items-seed.json (the SRD catalog, weights in kg)
 * and the spells table from data/spells-seed.json (the SRD spell catalog).
 * Idempotent: upserts keyed on srd_index — French translations in the seed JSON
 * are refreshed on re-seed.
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

function resolveSeedPath(filename: string): string {
  // 1. relative to cwd (npm run seed from root)
  // 2. relative to monorepo root (tsx src/db/seed.ts from apps/api)
  const candidates = [
    resolve(process.cwd(), 'data', filename),
    resolve(monorepoRoot(), 'data', filename),
  ];
  for (const p of candidates) {
    try {
      readFileSync(p, 'utf8');
      return p;
    } catch {
      // try next
    }
  }
  throw new Error(`${filename} not found in: ${candidates.join(', ')}`);
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
  const seedPath = resolveSeedPath('items-seed.json');
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

// ---------- Spells ----------

interface SeedSpell {
  srdIndex: string;
  name: string;
  nameFr: string | null;
  level: number;
  school: string;
  castingTime: string;
  rangeText: string;
  components: string[];
  material: string | null;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  description: string;
  descriptionFr: string | null;
  higherLevel: string | null;
  higherLevelFr: string | null;
  attackType: string | null;
  damageJson: string | null;
  dcJson: string | null;
  classes: string[]; // French class names: ["Magicien","Ensorceleur"]
}

const SPELL_INSERT = `
  INSERT INTO spells (
    srd_index, name, name_fr, level, school, casting_time, range_text,
    components, material, duration, concentration, ritual,
    description, description_fr, higher_level, higher_level_fr,
    attack_type, damage_json, dc_json, classes_json, sort_order
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?, ?
  )
  ON CONFLICT(srd_index) DO UPDATE SET
    name_fr = excluded.name_fr,
    description_fr = excluded.description_fr,
    higher_level_fr = excluded.higher_level_fr,
    classes_json = excluded.classes_json
`;

const SPELL_COUNT_SQL = `SELECT COUNT(*) as n FROM spells`;

export function seedSpells(): void {
  const db = getDb();
  const seedPath = resolveSeedPath('spells-seed.json');
  const spells = JSON.parse(readFileSync(seedPath, 'utf8')) as SeedSpell[];
  console.log(`[seed] loading spells from ${seedPath}`);

  const before = (db.prepare(SPELL_COUNT_SQL).get() as { n: number }).n;

  const insert = db.prepare(SPELL_INSERT);
  const tx = db.transaction((rows: SeedSpell[]) => {
    rows.forEach((s, i) => {
      insert.run(
        s.srdIndex,
        s.name,
        s.nameFr || s.name,
        s.level,
        s.school,
        s.castingTime,
        s.rangeText,
        JSON.stringify(s.components),
        s.material,
        s.duration,
        s.concentration ? 1 : 0,
        s.ritual ? 1 : 0,
        s.description,
        s.descriptionFr,
        s.higherLevel,
        s.higherLevelFr,
        s.attackType,
        s.damageJson,
        s.dcJson,
        JSON.stringify(s.classes),
        i, // sort_order: SRD catalog order
      );
    });
  });
  tx(spells);

  const after = (db.prepare(SPELL_COUNT_SQL).get() as { n: number }).n;
  console.log(`[seed] SRD spells: ${before} → ${after} (inserted ${after - before})`);
}

// If run directly, migrate first then seed
if (import.meta.url === `file://${process.argv[1]}`) {
  const { migrate } = await import('./index.ts');
  migrate();
  seedItems();
  seedSpells();
  console.log('[seed] done.');
}
