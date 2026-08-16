/**
 * One-shot import script: fetches the 5e SRD spell catalog from 5e-bits/5e-database
 * and flattens it into a single array of SeedSpell objects.
 *
 * French fields (nameFr, descriptionFr, higherLevelFr) are left null here —
 * they get filled by the translation step (see scripts/translate-items.py's
 * spells counterpart) and refreshed on re-seed.
 *
 * Class names are mapped to their French equivalents (Wizard → Magicien, ...)
 * so the UI can filter spells by the French class names used on character sheets.
 *
 * Output: data/spells-seed.json
 *
 * Run: npx tsx scripts/import-spells.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const SOURCE =
  'https://raw.githubusercontent.com/5e-bits/5e-database/main/src/2014/en/5e-SRD-Spells.json';

// ---------- Types matching the 5e-bits SRD JSON ----------

interface SrdSpell {
  index: string;
  name: string;
  desc: string[];
  higher_level?: string[];
  range: string;
  components: string[];
  material?: string;
  ritual: boolean;
  duration: string;
  concentration: boolean;
  casting_time: string;
  level: number;
  attack_type?: string;
  damage?: unknown;
  dc?: unknown;
  school: { index: string; name: string };
  classes: { index: string; name: string; url: string }[];
}

// ---------- Output type ----------

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
  classes: string[]; // French class names
}

// ---------- Helpers ----------

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.json();
}

/** English (SRD) class name → French class name. Unknown names pass through. */
const CLASS_FR: Record<string, string> = {
  Wizard: 'Magicien',
  Sorcerer: 'Ensorceleur',
  Warlock: 'Occultiste',
  Cleric: 'Clerc',
  Bard: 'Barde',
  Druid: 'Druide',
  Paladin: 'Paladin',
  Ranger: 'Rôdeur',
};

function toFrenchClasses(classes: SrdSpell['classes']): string[] {
  return classes.map((c) => CLASS_FR[c.name] ?? c.name);
}

function convertSpell(s: SrdSpell): SeedSpell {
  return {
    srdIndex: s.index,
    name: s.name,
    nameFr: null,
    level: s.level,
    school: (s.school?.name || '').toLowerCase(),
    castingTime: s.casting_time,
    rangeText: s.range,
    components: s.components || [],
    material: s.material ?? null,
    duration: s.duration,
    concentration: s.concentration ?? false,
    ritual: s.ritual ?? false,
    description: (s.desc || []).join('\n'),
    descriptionFr: null,
    higherLevel: s.higher_level?.length ? s.higher_level.join('\n') : null,
    higherLevelFr: null,
    attackType: s.attack_type ?? null,
    damageJson: s.damage ? JSON.stringify(s.damage) : null,
    dcJson: s.dc ? JSON.stringify(s.dc) : null,
    classes: toFrenchClasses(s.classes || []),
  };
}

// ---------- Main ----------

async function main() {
  console.log('→ Fetching SRD spells...');
  const spells = (await fetchJson(SOURCE)) as SrdSpell[];
  console.log(`  ${spells.length} spell entries`);

  const seeds = spells.map(convertSpell);

  console.log(`✓ Total spells: ${seeds.length}`);

  // Level breakdown
  const byLevel: Record<number, number> = {};
  for (const s of seeds) byLevel[s.level] = (byLevel[s.level] || 0) + 1;
  console.log('  By level:', byLevel);

  // School breakdown
  const bySchool: Record<string, number> = {};
  for (const s of seeds) bySchool[s.school] = (bySchool[s.school] || 0) + 1;
  console.log('  By school:', bySchool);

  // Sample conversion (acid-arrow exercises every optional field)
  console.log('');
  console.log('Sample (acid-arrow):');
  const acid = seeds.find((s) => s.srdIndex === 'acid-arrow');
  if (acid) console.log(JSON.stringify(acid, null, 2).slice(0, 800));

  // Write
  const outDir = resolve(ROOT, 'data');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, 'spells-seed.json');
  writeFileSync(outPath, JSON.stringify(seeds, null, 2), 'utf8');
  console.log('');
  console.log(`✓ Wrote ${seeds.length} spells to ${outPath}`);
}

main().catch((err) => {
  console.error('✗ Import failed:', err);
  process.exit(1);
});
