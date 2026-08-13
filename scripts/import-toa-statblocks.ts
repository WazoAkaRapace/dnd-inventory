/**
 * Import Tomb of Annihilation stat blocks from the sibling project's
 * extracted JSON files. These are adventure-specific monsters not found
 * in the SRD or Monster Manual.
 *
 * Reads: tomb-of-annihilation-site/data/stat-blocks/*.json
 * Merges into: data/monsters-seed.json (appends, deduplicates by slug)
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const TOA_STATBLOCKS = resolve(
  ROOT,
  '..',
  '..',
  'tomb of anhilation website',
  'tomb-of-annihilation-site',
  'data',
  'stat-blocks',
);

// ---------- Types ----------

interface ToAAbility {
  value: number;
  mod: number;
}

interface ToAStatBlock {
  name: string;
  page?: number;
  type_size_alignment: string;
  ac: string;
  hp: { value: number; formula: string; raw: string };
  speed: string;
  abilities: Record<string, [number, number]>; // FOR: [13, 1]
  saving_throws: string | null;
  skills: string | null;
  damage_vulnerabilities: string | null;
  damage_resistances: string | null;
  damage_immunities: string | null;
  condition_immunities: string | null;
  senses: string | null;
  languages: string | null;
  cr: { cr: string; xp: number; raw: string };
  traits: { name: string; text: string }[];
  actions: { name: string; text: string }[];
  legendary_actions: { name: string; text: string }[];
}

interface SeedMonsterAction {
  name: string;
  desc: string;
  attackBonus?: number;
  damageDice?: string;
  damageType?: string;
  cost?: number;
}

interface SeedMonster {
  slug: string;
  nameFr: string;
  type: string;
  subtype: string | null;
  size: string;
  alignment: string | null;
  armorClass: number;
  armorDesc: string | null;
  hitPoints: number;
  hitDice: string | null;
  speed: Record<string, number>;
  abilities: { for: number; dex: number; con: number; int: number; sag: number; cha: number };
  savingThrows: string[];
  skills: { name: string; isExpert: boolean }[];
  languages: string[];
  challengeRating: number;
  xp: number;
  senses: string | null;
  telepathy: number | null;
  damageResistances: string[] | null;
  damageImmunities: string[] | null;
  conditionImmunities: string[] | null;
  traits: SeedMonsterAction[];
  actions: SeedMonsterAction[];
  legendaryActions: SeedMonsterAction[];
  source: string;
  sourcePage: number | null;
}

// ---------- Parsing helpers ----------

const SIZE_MAP: Record<string, string> = {
  'très petit': 'T',
  'petit': 'P',
  'moyen': 'M',
  'grand': 'G',
  'très grand': 'TG',
  'gigantesque': 'Gig',
  'colossal': 'C',
};

/** Parse "Créature monstrueuse de taille Moyenne, loyale neutre" → type, size, alignment */
function parseTypeSizeAlignment(raw: string): { type: string; size: string; alignment: string | null } {
  const lower = raw.toLowerCase();
  let size = 'M';
  for (const [word, code] of Object.entries(SIZE_MAP)) {
    if (lower.includes(`taille ${word}`)) {
      size = code;
      break;
    }
  }
  // Type is everything before "de taille"
  const typeMatch = raw.match(/^(.+?)\s+de taille/i);
  const type = typeMatch ? typeMatch[1].trim() : raw.split(',')[0];
  // Alignment is after the last comma
  const parts = raw.split(',');
  const alignment = parts.length > 1 ? parts[parts.length - 1].trim() : null;
  return { type, size, alignment };
}

/** Parse AC string "14 (armure naturelle)" → { ac, desc } */
function parseAc(raw: string): { ac: number; desc: string | null } {
  const match = raw.match(/^(\d+)/);
  const ac = match ? parseInt(match[1], 10) : 10;
  const descMatch = raw.match(/\(([^)]+)\)/);
  return { ac, desc: descMatch ? descMatch[1].trim() : null };
}

/** Parse speed string "6 m, nage 9 m, vol 18 m" → { walk, swim, fly, ... } */
function parseSpeed(raw: string): Record<string, number> {
  const speed: Record<string, number> = {};
  // Match patterns like "9 m" or "nage 9 m" or "vol 18 m"
  const parts = raw.split(/,\s*/);
  for (const part of parts) {
    const m = part.match(/(?:(\w+)\s+)?(\d+)\s*m/);
    if (m) {
      const mode = m[1] ? m[1].toLowerCase() : 'walk';
      const val = parseInt(m[2], 10);
      // Normalize French mode names
      const normalized = mode === 'vol' ? 'fly' : mode === 'nage' ? 'swim' : mode === 'escalade' ? 'climb' : mode === 'creusement' ? 'burrow' : mode;
      speed[normalized] = val;
    }
  }
  return speed;
}

/** Parse CR string "1" or "1/4" → number */
function parseCr(raw: string): number {
  if (raw === '—' || raw === '-' || raw === '') return 0;
  if (raw === '1/8') return 0.125;
  if (raw === '1/4') return 0.25;
  if (raw === '1/2') return 0.5;
  return parseFloat(raw) || 0;
}

/** Parse a trait/action text to extract attack bonus and damage dice */
function parseActionInfo(action: { name: string; text: string }): SeedMonsterAction {
  const result: SeedMonsterAction = {
    name: action.name.replace(/\.$/, ''),
    desc: action.text.trim(),
  };

  // Attack bonus: "+3 pour toucher" or ":+3 pour toucher"
  const atk = action.text.match(/[+:]\s*(\d+)\s+pour toucher/);
  if (atk) result.attackBonus = parseInt(atk[1], 10);

  // Damage: "5 (1d8+1) dégâts tranchants" or "(2d6+3) dégâts contondants"
  const dmg = action.text.match(/(\d+)\s*\((\d+d\d+(?:[+-]\d+)?)\)\s*d[ée]g[âa]ts\s*(\w+)/);
  if (dmg) {
    result.damageDice = dmg[2];
    result.damageType = dmg[3];
  }

  return result;
}

/** Parse comma-separated string into array, null if empty */
function parseList(raw: string | null): string[] | null {
  if (!raw || raw.trim() === '—' || raw.trim() === '-') return null;
  return raw.split(/,\s*/).map((s) => s.trim()).filter(Boolean);
}

/** Parse skills string "Perception +4, Survie +4" → array */
function parseSkills(raw: string | null): { name: string; isExpert: boolean }[] {
  if (!raw) return [];
  return raw.split(/,\s*/).map((s) => {
    const match = s.match(/(.+?)\s+([+-]\d+)/);
    return {
      name: match ? match[1].trim().toLowerCase() : s.trim(),
      isExpert: false,
    };
  });
}

// ---------- Convert ----------

function convertToA(slug: string, raw: ToAStatBlock): SeedMonster {
  const { type, size, alignment } = parseTypeSizeAlignment(raw.type_size_alignment);
  const { ac, desc } = parseAc(raw.ac);

  // Abilities: raw.abilities uses uppercase keys FOR, DEX, etc. with [value, mod]
  const ab = raw.abilities || {};
  const abilities = {
    for: ab.FOR?.[0] ?? ab.for?.[0] ?? 10,
    dex: ab.DEX?.[0] ?? ab.dex?.[0] ?? 10,
    con: ab.CON?.[0] ?? ab.con?.[0] ?? 10,
    int: ab.INT?.[0] ?? ab.int?.[0] ?? 10,
    sag: ab.SAG?.[0] ?? ab.sag?.[0] ?? 10,
    cha: ab.CHA?.[0] ?? ab.cha?.[0] ?? 10,
  };

  return {
    slug,
    nameFr: raw.name,
    type,
    subtype: null,
    size,
    alignment,
    armorClass: ac,
    armorDesc: desc,
    hitPoints: raw.hp?.value ?? 1,
    hitDice: raw.hp?.formula ?? null,
    speed: parseSpeed(raw.speed || ''),
    abilities,
    savingThrows: parseList(raw.saving_throws) ?? [],
    skills: parseSkills(raw.skills),
    languages: parseList(raw.languages) ?? [],
    challengeRating: parseCr(raw.cr?.cr ?? '0'),
    xp: raw.cr?.xp ?? 0,
    senses: raw.senses ?? null,
    telepathy: null,
    damageResistances: parseList(raw.damage_resistances),
    damageImmunities: parseList(raw.damage_immunities),
    conditionImmunities: parseList(raw.condition_immunities),
    traits: (raw.traits || []).map(parseActionInfo),
    actions: (raw.actions || []).map(parseActionInfo),
    legendaryActions: (raw.legendary_actions || []).map(parseActionInfo),
    source: 'Tombe de l\'Annihilation',
    sourcePage: raw.page ?? null,
  };
}

// ---------- Main ----------

function main() {
  // Load existing seed
  const seedPath = resolve(ROOT, 'data', 'monsters-seed.json');
  const existing = JSON.parse(readFileSync(seedPath, 'utf8')) as SeedMonster[];
  console.log(`→ Existing monsters: ${existing.length}`);
  const existingSlugs = new Set(existing.map((m) => m.slug));

  // Read all ToA stat blocks
  const files = readdirSync(TOA_STATBLOCKS)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .sort();

  console.log(`→ ToA stat block files: ${files.length}`);

  const added: SeedMonster[] = [];
  let skipped = 0;

  for (const file of files) {
    const slug = file.replace('.json', '');
    if (existingSlugs.has(slug)) {
      skipped++;
      continue;
    }
    try {
      const raw = JSON.parse(readFileSync(resolve(TOA_STATBLOCKS, file), 'utf8')) as ToAStatBlock;
      const seed = convertToA(slug, raw);
      added.push(seed);
    } catch (err: any) {
      console.warn(`  ⚠ failed to parse ${file}: ${err.message}`);
    }
  }

  console.log(`  Added: ${added.length}, Skipped (already exist): ${skipped}`);

  // Merge and write
  const merged = [...existing, ...added].sort((a, b) => a.nameFr.localeCompare(b.nameFr, 'fr'));
  mkdirSync(resolve(ROOT, 'data'), { recursive: true });
  writeFileSync(seedPath, JSON.stringify(merged, null, 2), 'utf8');
  console.log(`✓ Wrote ${merged.length} monsters to ${seedPath}`);

  // Show samples
  console.log('\nSample ToA monsters added:');
  for (const slug of ['triton-du-feu-guerrier', 'acererak', 'atropal', 'chwinga', 'grung']) {
    const m = added.find((a) => a.slug === slug);
    if (m) {
      console.log(`  ✓ ${m.nameFr} — CA ${m.armorClass} PV ${m.hitPoints} CR ${m.challengeRating} actions: ${m.actions.length}`);
    }
  }
}

main();
