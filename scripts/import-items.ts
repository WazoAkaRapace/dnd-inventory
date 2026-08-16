/**
 * One-shot import script: fetches the 5e SRD item catalog from 5e-bits/5e-database,
 * normalizes it into a single array, and converts ALL weights from pounds (lb)
 * to kilograms (kg) — the SI unit used throughout the app.
 *
 * Output: data/items-seed.json
 *
 * Run: npm run import-items
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const LB_TO_KG = 0.4536; // exact conversion factor

const SOURCES = {
  equipment:
    'https://raw.githubusercontent.com/5e-bits/5e-database/main/src/2014/en/5e-SRD-Equipment.json',
  magic:
    'https://raw.githubusercontent.com/5e-bits/5e-database/main/src/2014/en/5e-SRD-Magic-Items.json',
} as const;

// ---------- Types matching the 5e-bits SRD JSON ----------

interface SrdEquipment {
  index: string;
  name: string;
  equipment_category?: { index: string; name: string };
  gear_category?: { index: string; name: string };
  tool_category?: string;
  vehicle_category?: string;
  cost?: { quantity: number; unit: string };
  weight?: number;
  desc?: string[];
  weapon_category?: string;
  weapon_range?: string;
  damage?: { damage_dice: string; damage_type?: { name: string } };
  two_handed_damage?: { damage_dice: string; damage_type?: { name: string } };
  range?: { normal: number; long?: number };
  properties?: { index: string; name: string }[];
  armor_category?: string;
  armor_class?: { base: number; dex_bonus: boolean; max_bonus?: number };
  str_minimum?: number;
  stealth_disadvantage?: boolean;
  speed?: { unit: string; quantity?: number };
  capacity?: { quantity?: number; unit?: string };
}

interface SrdMagicItem {
  index: string;
  name: string;
  equipment_category?: { index: string; name: string };
  rarity?: { name: string };
  variants?: { index: string; name: string }[];
  variant?: boolean;
  desc?: string[];
  image?: string;
}

// ---------- Output type ----------

interface SeedItem {
  source: 'srd';
  category: string;
  srdIndex: string;
  name: string;
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

// ---------- Helpers ----------

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.json();
}

function rarityFromString(s: string | undefined): string {
  if (!s) return 'none';
  const lower = s.toLowerCase();
  if (lower.includes('common')) return 'common';
  if (lower.includes('uncommon')) return 'uncommon';
  if (lower.includes('very rare')) return 'veryRare';
  if (lower.includes('rare')) return 'rare';
  if (lower.includes('legendary')) return 'legendary';
  if (lower.includes('artifact')) return 'artifact';
  return 'none';
}

function normalizeCostUnit(u: string | undefined): string | null {
  if (!u) return null;
  switch (u.toLowerCase()) {
    case 'cp':
      return 'cp';
    case 'sp':
      return 'sp';
    case 'ep':
      return 'ep';
    case 'gp':
      return 'gp';
    case 'pp':
      return 'pp';
    default:
      return null;
  }
}

function categoryFromEquipment(it: SrdEquipment): string {
  const ec = it.equipment_category?.index || '';
  if (ec === 'weapon') return 'weapon';
  if (ec === 'armor') return 'armor';
  if (ec === 'ammunition') return 'ammunition';
  if (ec === 'mounts-and-vehicles' || it.vehicle_category) return 'mount';
  if (ec === 'tools' || it.tool_category) return 'tool';
  // default adventuring gear
  return 'gear';
}

function convertEquipment(it: SrdEquipment): SeedItem {
  const category = categoryFromEquipment(it);
  const props = (it.properties || []).map((p) => p.index);
  return {
    source: 'srd',
    category,
    srdIndex: it.index,
    name: it.name,
    rarity: 'none',
    weightKg: typeof it.weight === 'number' ? +((it.weight as number) * LB_TO_KG).toFixed(3) : null,
    costQty: it.cost?.quantity ?? null,
    costUnit: normalizeCostUnit(it.cost?.unit),
    description: it.desc ? it.desc.join('\n') : null,
    damageDice: it.damage?.damage_dice ?? null,
    damageType: it.damage?.damage_type?.name ?? null,
    acBase: it.armor_class?.base ?? null,
    strMin: it.str_minimum ?? null,
    stealthDisadvantage: it.stealth_disadvantage ?? false,
    properties: props,
    imagePath: null,
  };
}

function convertMagicItem(it: SrdMagicItem): SeedItem {
  const cat =
    it.equipment_category?.index === 'weapon'
      ? 'weapon'
      : it.equipment_category?.index === 'armor'
        ? 'armor'
        : 'magic';
  const rarity = rarityFromString(it.rarity?.name);
  // Try to extract weight from description text (e.g. "This bag weighs 15 pounds")
  let weightKg: number | null = null;
  const descText = (it.desc || []).join('\n');
  const weightMatch = descText.match(/weighs\s+(\d+(?:\.\d+)?)\s*(?:lb|pound)/i);
  if (weightMatch) {
    weightKg = +(parseFloat(weightMatch[1]) * LB_TO_KG).toFixed(3);
  }
  return {
    source: 'srd',
    category: cat,
    srdIndex: it.index,
    name: it.name,
    rarity,
    weightKg,
    costQty: null,
    costUnit: null,
    description: descText || null,
    damageDice: null,
    damageType: null,
    acBase: null,
    strMin: null,
    stealthDisadvantage: false,
    properties: [],
    imagePath: it.image || null,
  };
}

// ---------- Main ----------

async function main() {
  console.log('→ Fetching SRD equipment...');
  const equipment = (await fetchJson(SOURCES.equipment)) as SrdEquipment[];
  console.log(`  ${equipment.length} equipment entries`);

  console.log('→ Fetching SRD magic items...');
  const magic = (await fetchJson(SOURCES.magic)) as SrdMagicItem[];
  console.log(`  ${magic.length} magic item entries`);

  const items: SeedItem[] = [];
  let withWeight = 0;
  let magicWithWeight = 0;

  for (const it of equipment) {
    const seed = convertEquipment(it);
    if (seed.weightKg !== null) withWeight++;
    items.push(seed);
  }
  for (const it of magic) {
    const seed = convertMagicItem(it);
    if (seed.weightKg !== null) magicWithWeight++;
    items.push(seed);
  }

  console.log('');
  console.log(`✓ Total items: ${items.length}`);
  console.log(`  Equipment with weight (kg): ${withWeight}/${equipment.length}`);
  console.log(`  Magic items with extracted weight: ${magicWithWeight}/${magic.length}`);

  // Category breakdown
  const byCat: Record<string, number> = {};
  for (const it of items) byCat[it.category] = (byCat[it.category] || 0) + 1;
  console.log('  By category:', byCat);

  // Sample weights (kg)
  console.log('');
  console.log('Sample weights (kg):');
  const samples = [
    'longsword',
    'chain-mail',
    'backpack',
    'dagger',
    'padded-armor',
    'bag-of-holding',
  ];
  for (const idx of samples) {
    const found = items.find((i) => i.srdIndex === idx);
    if (found) console.log(`  ${found.name}: ${found.weightKg} kg (${found.category})`);
  }

  // Write
  const outDir = resolve(ROOT, 'data');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, 'items-seed.json');
  writeFileSync(outPath, JSON.stringify(items, null, 2), 'utf8');
  console.log('');
  console.log(`✓ Wrote ${items.length} items to ${outPath}`);
}

main().catch((err) => {
  console.error('✗ Import failed:', err);
  process.exit(1);
});
