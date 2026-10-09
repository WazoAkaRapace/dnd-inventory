/**
 * One-shot import script: converts the Curse of Strahd-specific bestiary
 * (97 monsters/NPCs, EN) from the 5e.tools data format into our seed format,
 * and merges into data/monsters-seed.json (dedupe by slug).
 *
 * French name sources (AideDD, 5e-drs) carry no CoS stat blocks, so per user
 * decision (2026-10) names and prose stay ENGLISH for now — FR names from the
 * printed "La Malédiction de Strahd" annexe D can be patched later. STRUCTURED
 * fields follow the app's French conventions: monster type, size codes,
 * alignment, ability/skill/language keys, damage types, and all distances are
 * metric (ft→m, 5 ft = 1,5 m).
 *
 * Input:  data/cos-bestiary-en.json  (5e.tools bestiary-cos.json, committed)
 * Output: data/monsters-seed.json    (appends/replaces source rows by slug)
 *
 * Run: npx tsx scripts/import-cos-statblocks.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ---------- Types (seed side — mirrors monsters-seed.json) ----------

interface MonsterAction {
  name: string;
  desc: string;
  attackBonus?: number;
  damageDice?: string;
  damageType?: string;
  cost?: number; // legendary actions only
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
  speed: Record<string, string>;
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
  traits: MonsterAction[];
  actions: MonsterAction[];
  legendaryActions: MonsterAction[];
  source: string;
  sourcePage: number | null;
}

// ---------- Types (5e.tools side — only what we read) ----------

type Entry =
  | string
  | { type?: string; name?: string; entry?: string; entries?: Entry[]; items?: unknown[] };

// VRGR isn't imported as such — it only serves as the Wereraven base for the
// Martikovs. Fetched alongside the CoS file and committed for reproducibility.
const BASE_SOURCES = ['cos-bestiary-en.json', 'mm-bestiary-en.json', 'vrgr-bestiary-en.json'];

interface Copy {
  name: string;
  source: string;
  _copy?: Copy;
  predefined?: unknown;
  [key: string]: unknown;
}

interface ToolsMonster extends Omit<Copy, 'name' | 'source'> {
  name: string;
  source: string;
  page?: number;
  size: string[];
  type: { type: string; tags?: string[] } | string;
  alignment?: string[];
  ac: (number | { ac: number; from?: string[] })[];
  hp: { average: number; formula: string };
  speed: Record<string, number>;
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  save?: Record<string, string>;
  skill?: Record<string, string>;
  senses?: string[];
  passive?: number;
  languages?: string[];
  cr?: string | { cr: string };
  resist?: unknown[];
  immune?: unknown[];
  conditionImmune?: unknown[];
  trait?: { name: string; entries: Entry[] }[];
  action?: { name: string; entries: Entry[] }[];
  bonus?: { name: string; entries: Entry[] }[];
  reaction?: { name: string; entries: Entry[] }[];
  legendary?: { name: string; entries: Entry[] }[];
  legendaryGroup?: unknown;
  spellcasting?: {
    name: string;
    headerEntries: Entry[];
    spells: Record<string, { slots?: number; spells: string[] }>;
    footerEntries?: Entry[];
  }[];
}

// ---------- FR mappings (app conventions — see monsters-seed.json) ----------

const TYPE_FR: Record<string, string> = {
  aberration: 'Aberration',
  beast: 'Bête',
  celestial: 'Céleste',
  construct: 'Créature artificielle',
  dragon: 'Dragon',
  elemental: 'Élémentaire',
  fey: 'Fée',
  fiend: 'Fiélon',
  giant: 'Géant',
  humanoid: 'Humanoïde',
  monstrosity: 'Créature monstrueuse',
  ooze: 'Vase',
  plant: 'Plante',
  undead: 'Mort-vivant',
  swarm: 'Nuée de',
};

const SIZE_FR: Record<string, string> = {
  T: 'TP',
  S: 'P',
  M: 'M',
  L: 'G',
  H: 'TG',
  G: 'Gig',
  C: 'C',
};

const ALIGN_FR: Record<string, string> = {
  A: 'quelconque',
  L: 'loyal',
  N: 'neutre',
  C: 'chaotique',
  G: 'bon',
  E: 'mauvais',
  U: 'non-aligné',
};
const ALIGN_FULL: Record<string, string> = { A: "n'importe quel alignement", U: 'non-aligné' };

const ABILITY_FR: Record<string, string> = {
  str: 'for',
  dex: 'dex',
  con: 'con',
  int: 'int',
  wis: 'sag',
  cha: 'cha',
};

const SKILL_FR: Record<string, string> = {
  acrobatics: 'acrobaties',
  'animal handling': 'dressage',
  arcana: 'arcanes',
  athletics: 'athlétisme',
  deception: 'tromperie',
  history: 'histoire',
  insight: 'perspicacité',
  intimidation: 'intimidation',
  investigation: 'investigation',
  medicine: 'médecine',
  nature: 'nature',
  perception: 'perception',
  performance: 'représentation',
  persuasion: 'persuasion',
  religion: 'religion',
  'sleight of hand': 'escamotage',
  stealth: 'discrétion',
  survival: 'survie',
};

const LANG_FR: Record<string, string> = {
  common: 'commun',
  dwarvish: 'nain',
  elvish: 'elfique',
  giant: 'géant',
  gnomish: 'gnomique',
  goblin: 'gobelin',
  halfling: 'halfelin',
  orc: 'orc',
  abyssal: 'abyssal',
  celestial: 'céleste',
  'deep speech': 'commun des profondeurs',
  draconic: 'draconique',
  infernal: 'infernal',
  primordial: 'primordial',
  sylvan: 'sylvestre',
  undercommon: 'commun des profondeurs',
  telepathy: 'télépathie',
  "thieves' cant": 'argot des voleurs',
  druidic: 'druidique',
  'cant of the brutes': 'langue des brutes',
  vistani: 'vistani',
};

const DAMAGE_FR: Record<string, string> = {
  acid: 'acides',
  bludgeoning: 'contondants',
  cold: 'froid',
  fire: 'feu',
  force: 'force',
  lightning: 'foudre',
  necrotic: 'nécrotiques',
  piercing: 'perforants',
  poison: 'poison',
  psychic: 'psychiques',
  radiant: 'radiants',
  slashing: 'tranchants',
  thunder: 'tonnerre',
  'nonmagical attacks': 'attaques non magiques',
  'from nonmagical attacks': 'attaques non magiques',
  "that aren't silvered": 'non argentées',
  "from nonmagical attacks that aren't silvered": 'attaques non magiques non argentées',
  'from nonmagical weapons': 'armes non magiques',
};

const COND_FR: Record<string, string> = {
  blinded: 'aveuglé',
  charmed: 'charmé',
  deafened: 'assourdi',
  exhausted: 'épuisé',
  frightened: 'effrayé',
  grappled: 'agrippé',
  incapacitated: 'incapable',
  paralyzed: 'paralysé',
  petrified: 'pétrifié',
  poisoned: 'empoisonné',
  prone: 'à terre',
  restrained: 'entravé',
  stunned: 'étourdi',
  unconscious: 'inconscient',
};

const ARMOR_FROM_FR: Record<string, string> = {
  'natural armor': 'armure naturelle',
  'studded leather': 'armure de cuir clouté',
  'leather armor': 'armure de cuir',
  'padded armor': 'armure matelassée',
  'hide armor': 'armure de peaux',
  'chain shirt': 'chemise de mailles',
  'scale mail': "cotte d'écailles",
  breastplate: 'plastron',
  'half plate armor': 'demi-plate',
  'ring mail': "cotte d'anneaux",
  'chain mail': 'cotte de mailles',
  'splint armor': 'armure à bandes',
  'plate armor': 'harnois',
  shield: 'bouclier',
  'mage armor': 'armure de mage',
};

// proficiency bonus by CR (0 → 2 … 30 → 9)
function profBonus(cr: number): number {
  if (cr >= 26) return 8;
  if (cr >= 21) return 7;
  if (cr >= 17) return 6;
  if (cr >= 13) return 5;
  if (cr >= 10) return 4;
  if (cr >= 5) return 3;
  if (cr >= 1) return 2;
  return 2;
}

const XP_BY_CR: Record<string, number> = {
  '0': 10,
  '0.125': 25,
  '0.25': 50,
  '0.5': 100,
  '1': 200,
  '2': 450,
  '3': 700,
  '4': 1100,
  '5': 1800,
  '6': 2300,
  '7': 2900,
  '8': 3900,
  '9': 5000,
  '10': 5900,
  '11': 7200,
  '12': 8400,
  '13': 10000,
  '14': 11500,
  '15': 13000,
  '16': 15000,
  '17': 18000,
  '18': 20000,
  '19': 22000,
  '20': 25000,
  '21': 33000,
  '22': 41000,
  '23': 50000,
  '24': 62000,
  '25': 75000,
  '26': 90000,
  '27': 105000,
  '28': 120000,
  '29': 135000,
  '30': 155000,
};

// ---------- Metric conversion (5 ft = 1,5 m) ----------

function ftToM(ft: number): string {
  const m = (ft / 5) * 1.5;
  return (Math.round(m * 10) / 10).toString().replace('.', ',');
}

function parseCr(raw: string): number {
  if (raw === '—' || raw === '') return 0;
  if (raw === '1/8') return 0.125;
  if (raw === '1/4') return 0.25;
  if (raw === '1/2') return 0.5;
  return parseFloat(raw) || 0;
}

// ---------- 5e.tools markup → plain EN text (metric distances) ----------

const SPELL_TAG = /\{@spell ([^}]+)\}/g;
const HIT_TAG = /\{@hit ([+-]?\d+)\}/g;
const DMG_TAG = /\{@damage ([^}]+)\}/g;
const DC_TAG = /\{@dc (\d+)\}/g;
const ATK_TAG = /\{@atk [^}]+\}/g;
const RECHARGE_TAG = /\{@recharge(?: (\d+)(?:-(\d+))?)?\}/g;
const GENERIC_TAG = /\{@(\w+) ([^|}]+)(?:\|[^}]*)?\}/g;

function stripTags(text: string): string {
  let out = text;
  out = out.replace(/\{@h\}/g, '');
  out = out.replace(SPELL_TAG, '$1');
  out = out.replace(HIT_TAG, '+$1');
  out = out.replace(DMG_TAG, '$1');
  out = out.replace(DC_TAG, 'DC $1');
  out = out
    .replace(ATK_TAG, '')
    .replace(/\(\s*,/g, '(')
    .replace(/,\s*\)/g, ')');
  out = out.replace(RECHARGE_TAG, (_m, a, b) =>
    a ? `(Recharge ${a}${b ? `-${b}` : ''})` : '(Recharge 5-6)',
  );
  out = out.replace(GENERIC_TAG, (_m, _tag, content) => content); // {@condition X}, {@item X|src|label}…
  // distances: "5 ft." / "30 feet" / "120-ft.-long" → metres
  out = out.replace(/(\d+)(?:-(\d+))?\s*(?:ft\.|feet)/g, (m, a: string, b?: string) => {
    if (b) return `${a} to ${ftToM(parseInt(b, 10))} m`; // ranges "20/60 ft." handled below
    return `${ftToM(parseInt(a, 10))} m`;
  });
  out = out.replace(
    /(\d+)\/(\d+)\s*(?:ft\.|feet)/g,
    (_m, s: string, l: string) => `${ftToM(parseInt(s, 10))}/${ftToM(parseInt(l, 10))} m`,
  );
  return out.replace(/\s{2,}/g, ' ').trim();
}

function renderEntries(entries: Entry[], depth = 0): string {
  const lines: string[] = [];
  for (const e of entries) {
    if (typeof e === 'string') {
      lines.push(stripTags(e));
    } else if (e && typeof e === 'object') {
      if (e.type === 'itemSub' && e.name && e.entry) {
        lines.push(`${stripTags(e.name)}: ${stripTags(e.entry)}`);
      } else if (e.type === 'item' && (e as { name?: string }).name && e.entry) {
        lines.push(`${stripTags((e as { name: string }).name)}: ${stripTags(e.entry)}`);
      } else if (e.type === 'list' && e.items) {
        for (const item of e.items as Entry[]) {
          const rendered = renderEntries([item], depth + 1);
          if (rendered) lines.push(`• ${rendered}`);
        }
      } else if (e.type === 'entries' && e.name && e.entries) {
        lines.push(`${stripTags(e.name)}: ${renderEntries(e.entries, depth + 1)}`);
      } else if (e.entries) {
        const rendered = renderEntries(e.entries, depth + 1);
        if (rendered) lines.push(rendered);
      } else if (e.entry) {
        lines.push(stripTags(e.entry));
      }
    }
  }
  return lines.filter(Boolean).join('\n');
}

// ---------- Stat-block field mapping ----------

function mapAlignment(a?: string[]): string | null {
  if (!a || a.length === 0) return null;
  if (a.length === 1) return ALIGN_FULL[a[0]] ?? a[0];
  // ["L","E"] → "loyal mauvais" (app style: lowercase except first word — keep seed's mixed style)
  const words = a.map((x) => ALIGN_FR[x] ?? x.toLowerCase());
  if (a[0] === 'A' || a[0] === 'U') return ALIGN_FULL[a[0]] ?? words.join(' ');
  return words.join(' ');
}

function mapAc(ac: ToolsMonster['ac']): { ac: number; desc: string | null } {
  const first = ac[0];
  if (typeof first === 'number') return { ac: first, desc: null };
  const desc =
    first.from?.map((f) => ARMOR_FROM_FR[f] ?? DAMAGE_FR[f] ?? f.toLowerCase()).join(', ') ?? null;
  return { ac: first.ac, desc };
}

function mapDamageList(list: unknown[] | undefined): string[] | null {
  if (!list || list.length === 0) return null;
  const out: string[] = [];
  for (const item of list) {
    if (typeof item === 'string') {
      out.push(DAMAGE_FR[item] ?? item);
    } else if (item && typeof item === 'object') {
      const o = item as { resist?: string[]; immune?: string[]; note?: string; special?: string[] };
      const kinds = (o.resist ?? o.immune ?? []).map((k) => DAMAGE_FR[k] ?? k);
      const note = o.note ? ` (${DAMAGE_FR[o.note] ?? o.note})` : '';
      if (kinds.length) out.push(`${kinds.join(', ')}${note}`);
      if (o.special) out.push(...o.special);
    }
  }
  return out.length ? out : null;
}

function mapConditionList(list: unknown[] | undefined): string[] | null {
  if (!list || list.length === 0) return null;
  const out = list.map((c) => (typeof c === 'string' ? (COND_FR[c] ?? c) : String(c)));
  return out.length ? out : null;
}

function mapLanguages(langs?: string[]): string[] {
  if (!langs) return ['—'];
  return langs.map((l) => {
    const lower = l.toLowerCase();
    if (lower === 'none' || lower === "doesn't speak any language") return '—';
    const m = lower.match(/telepathy (\d+) (?:ft\.|feet)/);
    if (m) return `télépathie ${ftToM(parseInt(m[1], 10))} m`;
    if (lower === 'all, telepathy 120 ft.') return 'toutes, télépathie 36 m';
    return LANG_FR[lower] ?? l;
  });
}

function mapSenses(senses?: string[], passive?: number): string | null {
  if (!senses || senses.length === 0) return passive ? `Perception passive ${passive}` : null;
  const parts = senses.map((s) => {
    const m = s.match(/(blindsight|darkvision|tremorsense|truesight) (\d+) (?:ft\.|feet)/);
    if (!m) return stripTags(s);
    const name =
      {
        blindsight: 'vision aveugle',
        darkvision: 'vision dans le noir',
        tremorsense: 'perception des vibrations',
        truesight: 'vision véritable',
      }[m[1]] ?? m[1];
    return `${name} ${ftToM(parseInt(m[2], 10))} m`;
  });
  if (passive) parts.push(`Perception passive ${passive}`);
  return parts.join(', ');
}

function mapSpeed(speed: Record<string, number>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [mode, ft] of Object.entries(speed)) {
    if (mode === 'notes') continue;
    const fr =
      { walk: 'walk', fly: 'fly', swim: 'swim', climb: 'climb', burrow: 'burrow', hover: 'hover' }[
        mode
      ] ?? mode;
    out[fr] = ftToM(ft);
  }
  return out;
}

function mapSavingThrows(save?: Record<string, string>): string[] {
  if (!save) return [];
  return Object.keys(save).map((k) => ABILITY_FR[k] ?? k);
}

function mod(score: number): number {
  return Math.floor((score - 10) / 2);
}

function mapSkills(
  skill: Record<string, string> | undefined,
  abilities: SeedMonster['abilities'],
  cr: number,
): { name: string; isExpert: boolean }[] {
  if (!skill) return [];
  const pb = profBonus(cr);
  const abilityFor: Record<string, keyof SeedMonster['abilities']> = {
    acrobatics: 'dex',
    'animal handling': 'sag',
    arcana: 'int',
    athletics: 'for',
    deception: 'cha',
    history: 'int',
    insight: 'sag',
    intimidation: 'cha',
    investigation: 'int',
    medicine: 'sag',
    nature: 'int',
    perception: 'sag',
    performance: 'cha',
    persuasion: 'cha',
    religion: 'int',
    'sleight of hand': 'dex',
    stealth: 'dex',
    survival: 'sag',
  };
  return Object.entries(skill).map(([enName, bonusStr]) => {
    const bonus = parseInt(bonusStr, 10);
    const base = mod(abilities[abilityFor[enName] ?? 'int']);
    const isExpert = !Number.isNaN(bonus) && bonus >= base + pb * 2;
    return { name: SKILL_FR[enName] ?? enName, isExpert };
  });
}

function mapActions(list: { name: string; entries: Entry[] }[] | undefined): MonsterAction[] {
  if (!list) return [];
  return list.map((t) => {
    let name = stripTags(t.name);
    // Legendary costs come as "Bite (Costs 2 Actions)" → cost field, FR-free name
    let cost: number | undefined;
    const costMatch = name.match(/\(Costs (\d+) Actions?\)$/);
    if (costMatch) {
      cost = parseInt(costMatch[1], 10);
      name = name.replace(/\s*\(Costs \d+ Actions?\)$/, '');
    }
    const desc = renderEntries(t.entries);
    const action: MonsterAction = { name, desc };
    if (cost !== undefined) action.cost = cost;
    const hit = desc.match(/\+(\d+) to hit/);
    if (hit) action.attackBonus = parseInt(hit[1], 10);
    const dmg = desc.match(
      /(\d+d\d+(?:\s*[+-]\s*\d+)?)\)\s+(acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder) damage/,
    );
    if (dmg) {
      action.damageDice = dmg[1].replace(/\s+/g, '');
      action.damageType = DAMAGE_FR[dmg[2]] ?? dmg[2];
    }
    return action;
  });
}

function mapSpellcasting(sc: ToolsMonster['spellcasting']): MonsterAction[] {
  if (!sc) return [];
  return sc.map((block) => {
    const lines: string[] = [renderEntries(block.headerEntries)];
    if (block.spells) {
      const levelNames: Record<string, string> = { '0': 'Cantrips (at will)' };
      for (const [lvl, data] of Object.entries(block.spells)) {
        const label =
          levelNames[lvl] ??
          `${ordinal(parseInt(lvl, 10))} level${data.slots ? ` (${data.slots} slots)` : ' (at will)'}`;
        lines.push(`${label}: ${data.spells.map((s) => stripTags(s)).join(', ')}`);
      }
    }
    // Frequency-based innate casting: { daily: { '1e': [...], '3e': [...] }, weekly: {...} }
    const FREQ_LABEL: Record<string, (n: string) => string> = {
      daily: (n) => `${n}/day each`,
      weekly: (n) => `${n}/week each`,
    };
    for (const [freq, table] of Object.entries(block as Record<string, unknown>)) {
      if (!(freq in FREQ_LABEL)) continue;
      const groups = table as Record<string, string[]>;
      for (const [n, spells] of Object.entries(groups)) {
        lines.push(`${FREQ_LABEL[freq](n)}: ${spells.map((s) => stripTags(s)).join(', ')}`);
      }
    }
    if (block.footerEntries) lines.push(renderEntries(block.footerEntries));
    return { name: 'Spellcasting', desc: lines.filter(Boolean).join('\n') };
  });
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---------- Convert ----------

const SOURCE = 'Malédiction de Strahd';

function convert(raw: ToolsMonster): SeedMonster {
  const crRaw = typeof raw.cr === 'object' ? raw.cr.cr : (raw.cr ?? '0');
  const cr = parseCr(String(crRaw));
  const xp = XP_BY_CR[String(cr)] ?? 0;

  const type = typeof raw.type === 'string' ? raw.type : raw.type.type;
  const tags = typeof raw.type === 'object' ? raw.type.tags : undefined;
  const abilities = {
    for: raw.str,
    dex: raw.dex,
    con: raw.con,
    int: raw.int,
    sag: raw.wis,
    cha: raw.cha,
  };

  const traits: MonsterAction[] = [...mapSpellcasting(raw.spellcasting), ...mapActions(raw.trait)];
  const actions: MonsterAction[] = [
    ...mapActions(raw.action),
    ...(raw.bonus ? mapActions(raw.bonus).map((a) => ({ ...a, name: `${a.name} (bonus)` })) : []),
    ...(raw.reaction
      ? mapActions(raw.reaction).map((a) => ({ ...a, name: `${a.name} (réaction)` }))
      : []),
  ];

  return {
    slug: slugify(raw.name),
    nameFr: raw.name,
    type: TYPE_FR[type] ?? type,
    subtype: tags?.length ? tags.join(', ') : null,
    size: SIZE_FR[raw.size[0]] ?? raw.size[0],
    alignment: mapAlignment(raw.alignment),
    armorClass: mapAc(raw.ac).ac,
    armorDesc: mapAc(raw.ac).desc,
    hitPoints: raw.hp.average,
    hitDice: raw.hp.formula ? raw.hp.formula.replace(/\s+/g, '') : null,
    speed: mapSpeed(raw.speed),
    abilities,
    savingThrows: mapSavingThrows(raw.save),
    skills: mapSkills(raw.skill, abilities, cr),
    languages: mapLanguages(raw.languages),
    challengeRating: cr,
    xp,
    senses: mapSenses(raw.senses, raw.passive),
    telepathy: null,
    damageResistances: mapDamageList(raw.resist),
    damageImmunities: mapDamageList(raw.immune),
    conditionImmunities: mapConditionList(raw.conditionImmune),
    traits,
    actions,
    legendaryActions: mapActions(raw.legendary),
    source: SOURCE,
    sourcePage: raw.page ?? null,
  };
}

// ---------- Main ----------

function main() {
  // Load CoS + base bestiaries, resolve _copy references (Amber Golem → Stone
  // Golem MM, Bray Martikov → Young Wereraven CoS, Wereraven → VRGR, …).
  const byKey = new Map<string, ToolsMonster>();
  for (const file of BASE_SOURCES) {
    const data = JSON.parse(readFileSync(resolve(ROOT, 'data', file), 'utf8')) as {
      monster: ToolsMonster[];
    };
    for (const m of data.monster) byKey.set(`${m.name}|${m.source}`, m);
  }
  const tools = JSON.parse(readFileSync(resolve(ROOT, 'data', 'cos-bestiary-en.json'), 'utf8')) as {
    monster: ToolsMonster[];
  };
  console.log(`→ CoS stat blocks: ${tools.monster.length}`);

  const resolveCopy = (m: ToolsMonster): ToolsMonster => {
    const copy = m._copy as Copy | undefined;
    if (!copy) return m;
    const base = byKey.get(`${copy.name}|${copy.source}`);
    if (!base) throw new Error(`copy base not found: ${copy.name}|${copy.source}`);
    const resolvedBase = resolveCopy(base);
    const overrides = { ...m } as Record<string, unknown>;
    delete overrides._copy;
    // Shallow merge: copy-level fields win, otherwise inherit from the base.
    return { ...resolvedBase, ...overrides, name: m.name, source: m.source } as ToolsMonster;
  };

  const converted = tools.monster.map((m) => {
    try {
      return convert(resolveCopy(m));
    } catch (err: any) {
      throw new Error(`failed to convert ${m.name}: ${err.message}`);
    }
  });

  const seedPath = resolve(ROOT, 'data', 'monsters-seed.json');
  const existing = JSON.parse(readFileSync(seedPath, 'utf8')) as SeedMonster[];
  const cosSlugs = new Set(converted.map((m) => m.slug));
  const nonCos = existing.filter((m) => !cosSlugs.has(m.slug));
  const replaced = existing.length - nonCos.length;
  console.log(`→ Existing monsters: ${existing.length} (replacing ${replaced} CoS rows)`);

  const merged = [...nonCos, ...converted].sort((a, b) => a.nameFr.localeCompare(b.nameFr, 'fr'));
  writeFileSync(seedPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
  console.log(`→ Written: ${merged.length} monsters (${converted.length} from ${SOURCE})`);
}

main();
