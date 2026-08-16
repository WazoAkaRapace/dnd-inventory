/**
 * One-shot import script: scrapes the ~149 French monster stat blocks from
 * AideDD.org (https://www.aidedd.org/dnd/monstres.php?vf=<slug>) that are NOT
 * already present in our 5e-drs seed catalog (data/monsters-seed.json).
 *
 * AideDD serves fully rendered HTML stat blocks (French + metric), so we parse
 * the HTML directly. Each page's stat block lives inside `div.jaune > div.red`
 * as a single line of markup with `<strong>`-labelled attribute lines,
 * `div.carac` cells for the six ability scores, `div.rub` headers separating
 * Capacités / Actions / Actions légendaires, and `<p><strong><em>Name</em></strong>`
 * entries for individual traits and actions.
 *
 * Output: data/monsters-aidedd-supplement.json — same SeedMonster shape as
 * monsters-seed.json, with `source: "AideDD"`.
 *
 * Run: npx tsx scripts/import-aidedd-monsters.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const AIDEDD_MONSTER = (slug: string) =>
  `https://www.aidedd.org/dnd/monstres.php?vf=${encodeURIComponent(slug)}`;

const UA = 'DnDInventoryApp/1.0 (monster-importer)';
const THROTTLE_MS = 120;
const TIMEOUT_MS = 20000;

// ---------- Output type (mirrors monsters-seed.json SeedMonster) ----------

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
  telepathy: string | null;
  damageResistances: string[] | null;
  damageImmunities: string[] | null;
  conditionImmunities: string[] | null;
  traits: MonsterAction[];
  actions: MonsterAction[];
  legendaryActions: MonsterAction[];
  source: string;
  sourcePage: number | null;
}

// ---------- HTML helpers ----------

/** Decode the small set of HTML entities AideDD uses. */
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&hellip;/g, '…')
    .replace(/&mdash;|&ndash;/g, '—')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** Strip all HTML tags from a fragment, keeping their inner text. */
function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, ''));
}

/** Collapse whitespace runs to single spaces. */
function collapseWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Extract the inside of `div.red` (the attributes portion of the stat block:
 * AC/HP/speed/abilities/saves/senses/CR). The traits/actions live OUTSIDE
 * `.red`, as siblings inside `div.sansSerif` — use extractJauneBlock for those.
 */
function extractRedBlock(html: string): string | null {
  return extractDiv(html, "<div class='red'>");
}

/** Extract the full `div.jaune` block — contains .red AND the trait/action entries. */
function extractJauneBlock(html: string): string | null {
  return extractDiv(html, "<div class='jaune'>");
}

/** Extract a `<div ...>...</div>` region by matching nested open/close pairs. */
function extractDiv(html: string, openTag: string): string | null {
  const startIdx = html.indexOf(openTag);
  if (startIdx === -1) return null;
  let i = startIdx + openTag.length;
  let depth = 1;
  while (i < html.length) {
    const open = html.indexOf('<div', i);
    const close = html.indexOf('</div>', i);
    if (close === -1) break;
    if (open !== -1 && open < close) {
      depth++;
      i = open + 4;
    } else {
      depth--;
      i = close + 6;
      if (depth <= 0) {
        return html.slice(startIdx, i);
      }
    }
  }
  return html.slice(startIdx);
}

/**
 * Read the value that follows a `<strong>Label</strong>` marker up to the next
 * `<br>`, `<strong>`, `<div`, or end of string. Returns raw inner HTML.
 */
function readLabeledLine(red: string, label: string): string | null {
  // Label may contain an apostrophe; escape regex-special chars naively.
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `<strong>\\s*${esc}\\s*</strong>\\s*([^<]*(?:<(?!strong|br|div)[^>]*>[^<]*)*)`,
    'i',
  );
  const m = red.match(re);
  if (!m) return null;
  return m[1];
}

// ---------- Field parsers ----------

interface ParsedType {
  type: string;
  subtype: string | null;
  size: string;
  alignment: string | null;
}

/**
 * Parse the `<div class='type'>` line, e.g.:
 *   "Aberration de taille G, loyal mauvais"
 *   "Élementaire de taille M, typiquement neutre"
 *   "Mort-vivant de taille M, n'importe quel alignement"
 */
function parseTypeLine(raw: string): ParsedType {
  const text = collapseWs(stripTags(raw));
  // Pattern: <Type>[ de <subtype>] de taille <SIZE>, <alignment>
  const m = text.match(/^(.*?)\s+de\s+taille\s+([A-ZÀ-Ÿ][a-zA-ZÀ-ÿ]?)\s*,\s*(.+)$/);
  let type: string;
  let size = 'M';
  let alignment: string | null = null;
  if (m) {
    type = m[1].trim();
    size = m[2].trim();
    alignment = m[3].trim();
  } else {
    type = text.trim();
  }
  // Some lines look like "Humanoïde (gnoll) de taille M, ..."
  let subtype: string | null = null;
  const sub = type.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (sub) {
    type = sub[1].trim();
    subtype = sub[2].trim();
  }
  if (alignment === "n'importe quel alignement" || alignment === 'any alignment') {
    // keep as-is, it's meaningful
  }
  return { type, subtype, size, alignment };
}

interface ParsedCarac {
  abilities: { for: number; dex: number; con: number; int: number; sag: number; cha: number };
}

/** Parse the six `div.carac` cells in order: FOR DEX CON INT SAG CHA. */
function parseCarac(red: string): ParsedCarac {
  const re = /<div class='carac'>\s*<strong>\s*([A-ZÀ-Ÿ]+)\s*<\/strong>\s*<br>\s*(\d+)/gi;
  const map: Record<string, number> = {};
  for (const m of red.matchAll(re)) {
    const key = m[1].toLowerCase();
    map[key] = parseInt(m[2], 10);
  }
  return {
    abilities: {
      for: map.for ?? 10,
      dex: map.dex ?? 10,
      con: map.con ?? 10,
      int: map.int ?? 10,
      sag: map.sag ?? 10,
      cha: map.cha ?? 10,
    },
  };
}

interface ParsedAc {
  armorClass: number;
  armorDesc: string | null;
}
function parseAc(red: string): ParsedAc {
  const raw = readLabeledLine(red, "Classe d'armure");
  if (!raw) return { armorClass: 10, armorDesc: null };
  const text = collapseWs(stripTags(raw));
  const num = text.match(/^(\d+)/);
  const armorClass = num ? parseInt(num[1], 10) : 10;
  const desc = text.match(/\(([^)]*)\)/);
  const armorDesc = desc ? desc[1].trim() : null;
  return { armorClass, armorDesc };
}

interface ParsedHp {
  hitPoints: number;
  hitDice: string | null;
}
function parseHp(red: string): ParsedHp {
  const raw = readLabeledLine(red, 'Points de vie');
  if (!raw) return { hitPoints: 10, hitDice: null };
  const text = collapseWs(stripTags(raw));
  const num = text.match(/^(\d+)/);
  const hitPoints = num ? parseInt(num[1], 10) : 10;
  // "18d10 + 36" — strip the spaces so it matches our seed format
  const dice = text.match(/\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)/);
  let hitDice: string | null = null;
  if (dice) hitDice = dice[1].replace(/\s+/g, '');
  return { hitPoints, hitDice };
}

/**
 * Parse speed line like "9 m, vol 18 m, nage 3 m" into a structured object.
 * AideDD uses meters; our seed keeps them as meter strings ("9", "12"...).
 */
function parseSpeed(red: string): Record<string, string> {
  const raw = readLabeledLine(red, 'Vitesse');
  const speed: Record<string, string> = {};
  if (!raw) return speed;
  const text = collapseWs(stripTags(raw));
  // Split on commas, then for each chunk pull a number and an optional mode.
  const chunks = text.split(/,/);
  for (let chunk of chunks) {
    chunk = chunk.trim();
    if (!chunk) continue;
    const num = chunk.match(/(\d+(?:[.,]\d+)?)/);
    if (!num) continue;
    const value = num[1].replace(',', '.');
    let mode = 'walk';
    const lower = chunk.toLowerCase();
    if (lower.includes('vol')) mode = 'fly';
    else if (lower.includes('nage')) mode = 'swim';
    else if (lower.includes('creuse') || lower.includes('burrow')) mode = 'burrow';
    else if (lower.includes('grimpe')) mode = 'climb';
    // "(stationnaire)" / "(hover)" annotations are dropped — value kept.
    speed[mode] = value;
  }
  return speed;
}

/** Saving throws: "Con +6, Int +8, Sag +6" → ['con','int','sag']. */
function parseSavingThrows(red: string): string[] {
  const raw = readLabeledLine(red, 'Jets de sauvegarde');
  if (!raw) return [];
  const text = collapseWs(stripTags(raw));
  const out: string[] = [];
  for (const part of text.split(/,/)) {
    const m = part.trim().match(/^([A-Za-zÀ-ÿ]+)\s*[+-]/);
    if (m) {
      const ability = m[1].toLowerCase();
      if (['for', 'dex', 'con', 'int', 'sag', 'cha'].includes(ability)) {
        out.push(ability);
      }
    }
  }
  return out;
}

/**
 * Skills: "Arcanes +9, Perception +10" → [{name,isExpert:false},...].
 * AideDD doesn't mark expertise, so default false.
 */
function parseSkills(red: string): { name: string; isExpert: boolean }[] {
  const raw = readLabeledLine(red, 'Compétences');
  if (!raw) return [];
  const text = collapseWs(stripTags(raw));
  const out: { name: string; isExpert: boolean }[] = [];
  for (const part of text.split(/,/)) {
    const m = part.trim().match(/^(.+?)\s*[+-]/);
    if (m) {
      out.push({ name: m[1].trim().toLowerCase(), isExpert: false });
    }
  }
  return out;
}

/**
 * Split a damage/condition list that may use commas, semicolons, and "et".
 * e.g. "acide, foudre, feu ; contondant, perforant et tranchant d'attaques non magiques"
 * → ['acide', 'foudre', 'feu', "contondant, perforant et tranchant d'attaques non magiques"]
 */
function parseDamageList(raw: string | null): string[] | null {
  if (!raw) return null;
  const text = collapseWs(stripTags(raw));
  if (!text) return null;
  // Semicolons separate groups that should each be kept whole.
  const groups = text
    .split(/\s*;\s*/)
    .map((g) => g.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const g of groups) {
    // If a group contains a phrase like "d'attaques non magiques", keep it whole.
    if (/d'attaques|non magiques|magiques|d'armes|en métal/i.test(g)) {
      out.push(g);
      continue;
    }
    // Otherwise split on commas (but not "et" joining the last two).
    const cleaned = g.replace(/\s+et\s+/g, ', ');
    for (const part of cleaned.split(/,/)) {
      const t = part.trim();
      if (t) out.push(t);
    }
  }
  return out.length ? out : null;
}

/** Senses: keep the full raw string (minus Perception passive duplication handled by caller). */
function parseSenses(red: string): string | null {
  const raw = readLabeledLine(red, 'Sens');
  if (!raw) return null;
  const text = collapseWs(stripTags(raw));
  if (!text) return null;
  return text;
}

/** Pull telepathy radius (in m) from either Senses or Langues lines. */
function parseTelepathy(red: string): string | null {
  for (const label of ['Sens', 'Langues']) {
    const raw = readLabeledLine(red, label);
    if (!raw) continue;
    const text = stripTags(raw);
    const m = text.match(/t[ée]l[ée]pathie\s+(\d+)/i);
    if (m) return m[1];
  }
  return null;
}

/** Languages: split on commas; strip a trailing télépathie clause. */
function parseLanguages(red: string): string[] {
  const raw = readLabeledLine(red, 'Langues');
  if (!raw) return [];
  let text = collapseWs(stripTags(raw));
  // Drop a "télépathie N m" clause — it's tracked separately.
  text = text.replace(/,?\s*t[ée]l[ée]pathie\s+\d+\s*m?/i, '');
  // "—" means none.
  if (/^[—–-]$/.test(text.trim())) return [];
  return text
    .split(/,/)
    .map((s) => s.trim())
    .filter(Boolean);
}

interface ParsedCr {
  challengeRating: number;
  xp: number;
}
const CR_XP: Record<string, number> = {
  '0': 0,
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

/** CR: the value following the "Puissance" label, e.g. "10 (5900 PX)" or "1/2 (100 PX)". */
function parseCr(red: string): ParsedCr {
  const raw = readLabeledLine(red, 'Puissance');
  if (!raw) return { challengeRating: 0, xp: 0 };
  const text = collapseWs(stripTags(raw));
  // The value is just "10 (5900 PX)" — the word "Puissance" is the label, not in the value.
  // CR token: a fraction like 1/2 or 1/4 or 1/8, or a whole/decimal number.
  let crStr: string | null = null;
  let xp: number | null = null;
  const frac = text.match(/^(-?\d+\/\d+|-?\d+(?:[.,]\d+)?)/);
  if (frac) crStr = frac[1].replace(',', '.');
  const xpM = text.match(/(\d[\d.]*)\s*PX/i);
  if (xpM) xp = parseInt(xpM[1].replace(/\./g, ''), 10);

  let crNum = 0;
  if (crStr) {
    if (crStr.includes('/')) {
      const [a, b] = crStr.split('/').map(Number);
      crNum = b ? a / b : 0;
    } else {
      crNum = parseFloat(crStr) || 0;
    }
  }
  // Normalize to the canonical CR keys used in our XP table.
  const crKey = String(crNum);
  const xpFinal = xp ?? CR_XP[crKey] ?? 0;
  return { challengeRating: crNum, xp: xpFinal };
}

// ---------- Section / entry parsers ----------

/**
 * Split the red block by `div.rub` headers and the leading trait region.
 * Returns three HTML blobs: traits (before first rub), actions, legendary.
 */
function splitSections(red: string): {
  traitsHtml: string;
  actionsHtml: string;
  legendaryHtml: string;
} {
  const rubRe = /<div class='rub'>\s*([^<]*)\s*<\/div>/gi;
  const boundaries: { name: string; idx: number }[] = [];
  for (const m of red.matchAll(rubRe)) {
    boundaries.push({ name: m[1].trim().toLowerCase(), idx: m.index });
  }
  if (boundaries.length === 0) {
    return { traitsHtml: red, actionsHtml: '', legendaryHtml: '' };
  }
  const traitsHtml = red.slice(0, boundaries[0].idx);
  const sections: { name: string; html: string }[] = [];
  for (let i = 0; i < boundaries.length; i++) {
    const start = boundaries[i].idx;
    const end = i + 1 < boundaries.length ? boundaries[i + 1].idx : red.length;
    sections.push({ name: boundaries[i].name, html: red.slice(start, end) });
  }
  let actionsHtml = '';
  let legendaryHtml = '';
  for (const s of sections) {
    if (s.name.includes('légendaire')) legendaryHtml += s.html;
    else if (s.name.startsWith('action')) actionsHtml += s.html;
    else if (s.name.includes('réaction')) {
      // Reactions aren't modeled in our schema; fold their entries into traits
      // so we don't lose the data. (Rare for the missing set.)
      // (handled below by treating as traits)
    }
  }
  return { traitsHtml, actionsHtml, legendaryHtml };
}

/**
 * Parse entries from a section blob. AideDD uses two forms:
 *  1. Rich: <p><strong><em>Name</em></strong>. desc</p>  (or <strong> without <em>)
 *  2. Stub: bare "Name.<br>" lines with no description (some pages abbreviate)
 * Also handles <p><strong>Name.</strong> desc</p> variants.
 */
function parseSectionEntries(html: string): MonsterAction[] {
  const entries: MonsterAction[] = [];
  if (!html) return entries;

  // First, handle rich <p>...</p> entries.
  const pRe = /<p>([\s\S]*?)<\/p>/gi;
  const consumedRanges: [number, number][] = [];
  for (const m of html.matchAll(pRe)) {
    const inner = m[1];
    consumedRanges.push([m.index, m.index + m[0].length]);
    const entry = parseEntryInner(inner);
    if (entry) entries.push(entry);
  }

  // Then handle stub entries: bare "<strong>...</strong>." or "Name.<br>" segments
  // that were NOT inside a <p>. We rebuild the html with <p> regions blanked.
  let masked = html;
  // Blank consumed <p>...</p> spans so we don't double-parse.
  for (const [a, b] of consumedRanges) {
    masked = masked.slice(0, a) + ' '.repeat(b - a) + masked.slice(b);
  }
  // Look for <strong><em>Name</em></strong>. followed by <br> with no real body.
  const stubReA = /<strong>\s*<em>\s*([^<]+?)\s*<\/em>\s*<\/strong>\s*[.,]?\s*(?=<br|$|<div)/gi;
  for (const m of masked.matchAll(stubReA)) {
    const name = collapseWs(stripTags(m[1]));
    if (name) entries.push({ name, desc: '' });
  }
  // Bare "Name.<br>" stubs (e.g. the triton-du-feu-guerrier page).
  // These are plain text fragments separated by <br>, no <strong>.
  // Split the masked region on <br> and <div class='rub'> and treat each
  // non-empty trimmed fragment ending in "." as a stub entry.
  const stubFragments = masked
    .replace(/<div class='rub'>[\s\S]*?<\/div>/gi, ' ') // drop rub headers
    .split(/<br\s*\/?>|\n/i);
  for (const frag of stubFragments) {
    const text = collapseWs(stripTags(frag));
    if (!text) continue;
    // Skip if it's clearly a stat line remnant or a sub-phrase of an action.
    if (
      /^(Classe d'armure|Points de vie|Vitesse|Jets de sauvegarde|Compétences|Sens|Langues|Puissance|Immunités|Résistances|Bonus de maîtrise)/i.test(
        text,
      )
    ) {
      continue;
    }
    // Stub action names typically end with "." or "(Recharge ...)" and are short.
    if (text.length <= 80 && /\.$|\(Recharge|\(Rechargement|\(\d+\/jour|\(co[uû]te/.test(text)) {
      // Avoid duplicating one we already captured as a rich entry.
      if (
        !entries.some((e) => e.name.toLowerCase() === text.replace(/\.$/, '').trim().toLowerCase())
      ) {
        entries.push({ name: text.replace(/\.$/, '').trim(), desc: '' });
      }
    }
  }
  return entries;
}

/** Parse the inner HTML of a single <p> entry into a MonsterAction. */
function parseEntryInner(inner: string): MonsterAction | null {
  // Name lives in the first <strong>…</strong> (with optional inner <em>).
  const strongM = inner.match(/<strong>([\s\S]*?)<\/strong>/i);
  let name = '';
  let restHtml = inner;
  if (strongM) {
    name = collapseWs(stripTags(strongM[1])).replace(/[.:,;\s]+$/, '');
    restHtml = inner.slice(strongM.index! + strongM[0].length);
  } else {
    // No bold name — skip; not a real entry.
    return null;
  }
  let desc = collapseWs(stripTags(restHtml));
  // Drop a leading separator the markup sometimes leaves after the name.
  desc = desc.replace(/^[\s.:,;-]+/, '').trim();
  const entry: MonsterAction = { name, desc };
  parseAttackInfo(entry);
  return entry;
}

/**
 * Extract attack bonus, damage dice, and damage type from an entry's desc.
 * AideDD phrasing: "+9 au toucher" and "12 (2d6 + 5) dégâts contondants".
 * Also tolerate the 5e-drs-style "pour toucher" just in case.
 */
function parseAttackInfo(action: MonsterAction): void {
  const d = action.desc;
  const atk = d.match(/[+:]\s*(\d+)\s+(?:au|pour)\s+toucher/);
  if (atk) action.attackBonus = parseInt(atk[1], 10);
  const dmg = d.match(/(\d+)\s*\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)\s*d[ée]g[âa]ts\s+([a-zà-ÿ]+)/i);
  if (dmg) {
    action.damageDice = dmg[2].replace(/\s+/g, '');
    action.damageType = dmg[3].toLowerCase();
  }
}

/** Extract legendary-action cost from a name like "Absorption psychique (coûte 2 actions)". */
function parseLegendaryCost(action: MonsterAction): void {
  const m = action.name.match(/\(co[uû]te\s+(\d+)\s+actions?\)/i);
  if (m) action.cost = parseInt(m[1], 10);
}

// ---------- Top-level page parser ----------

interface ParseResult {
  ok: boolean;
  monster?: SeedMonster | null;
  reason?: string;
}

export function parseMonsterPage(slug: string, html: string): ParseResult {
  // AideDD returns a 200 with an error page for unknown slugs.
  if (/This creature does not exist|<title>Error/i.test(html)) {
    return { ok: false, reason: 'not-found' };
  }
  const red = extractRedBlock(html);
  if (!red) return { ok: false, reason: 'no-red-block' };
  const jaune = extractJauneBlock(html) ?? red;

  // Name from <h1>
  const h1 = html.match(/<h1>([\s\S]*?)<\/h1>/i);
  const nameFr = h1 ? collapseWs(stripTags(h1[1])) : slug;

  // Type line
  const typeM = html.match(/<div class='type'>([\s\S]*?)<\/div>/i);
  const { type, subtype, size, alignment } = typeM
    ? parseTypeLine(typeM[1])
    : { type: '', subtype: null, size: 'M', alignment: null };

  const { armorClass, armorDesc } = parseAc(red);
  const { hitPoints, hitDice } = parseHp(red);
  const speed = parseSpeed(red);
  const { abilities } = parseCarac(red);
  const savingThrows = parseSavingThrows(red);
  const skills = parseSkills(red);
  const languages = parseLanguages(red);
  const { challengeRating, xp } = parseCr(red);
  const senses = parseSenses(red);
  const telepathy = parseTelepathy(red);

  const damageResistances = parseDamageList(readLabeledLine(red, 'Résistances aux dégâts'));
  const damageImmunities = parseDamageList(readLabeledLine(red, 'Immunités aux dégâts'));
  const conditionImmunities = parseDamageList(readLabeledLine(red, 'Immunités aux états'));

  // Source line, e.g. <div class='source'>Monster Manual (SRD)</div>
  const srcM = html.match(/<div class='source'>([\s\S]*?)<\/div>/i);
  const _sourceLine = srcM ? collapseWs(stripTags(srcM[1])) : '';

  // Sections — traits/actions live OUTSIDE .red, inside .jaune (siblings of .red).
  const { traitsHtml, actionsHtml, legendaryHtml } = splitSections(jaune);
  const traits = parseSectionEntries(traitsHtml);
  const actions = parseSectionEntries(actionsHtml);
  const legendaryActions = parseSectionEntries(legendaryHtml);
  for (const la of legendaryActions) parseLegendaryCost(la);

  const monster: SeedMonster = {
    slug,
    nameFr,
    type,
    subtype,
    size,
    alignment,
    armorClass,
    armorDesc,
    hitPoints,
    hitDice,
    speed,
    abilities,
    savingThrows,
    skills,
    languages,
    challengeRating,
    xp,
    senses,
    telepathy,
    damageResistances,
    damageImmunities,
    conditionImmunities,
    traits,
    actions,
    legendaryActions,
    source: 'AideDD',
    sourcePage: null,
  };
  return { ok: true, monster };
}

// ---------- Networking ----------

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  return res.text();
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---------- Main ----------

async function main() {
  // 1. Build the slug list: missing set + the two explicitly-requested tritons.
  const missingPath = '/tmp/missing-aidedd.txt';
  let missingSlugs: string[] = [];
  try {
    missingSlugs = readFileSync(missingPath, 'utf8')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    console.warn(`  ⚠ ${missingPath} not found; falling back to comm of slug files`);
    const a = readFileSync('/tmp/aidedd-slugs.txt', 'utf8')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .sort();
    const b = new Set(
      readFileSync('/tmp/our-slugs.txt', 'utf8')
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean),
    );
    missingSlugs = a.filter((s) => !b.has(s));
  }
  // Dedup, then ensure the two requested tritons are included.
  const extra = ['triton-du-feu-guerrier', 'triton-du-feu-occultiste-dimix'];
  const slugSet = new Set(missingSlugs);
  for (const e of extra) slugSet.add(e);
  const slugs = [...slugSet];
  console.log(
    `→ Scraping ${slugs.length} slugs from AideDD (${missingSlugs.length} missing + ${extra.length} extra tritons)`,
  );

  // 2. Fetch + parse, throttled, sequential to be polite.
  const seeds: SeedMonster[] = [];
  const failures: { slug: string; reason: string }[] = [];
  let count = 0;
  for (const slug of slugs) {
    count++;
    let html: string;
    try {
      html = await fetchText(AIDEDD_MONSTER(slug));
    } catch (err: any) {
      failures.push({ slug, reason: `fetch: ${err.message}` });
      console.warn(`  ✗ [${count}/${slugs.length}] ${slug} — fetch failed: ${err.message}`);
      await sleep(THROTTLE_MS);
      continue;
    }
    const res = parseMonsterPage(slug, html);
    if (!res.ok || !res.monster) {
      failures.push({ slug, reason: res.reason ?? 'unknown' });
      console.warn(`  · [${count}/${slugs.length}] ${slug} — ${res.reason}`);
    } else {
      seeds.push(res.monster);
      if (count % 25 === 0 || count <= 5 || extra.includes(slug)) {
        console.log(
          `  ✓ [${count}/${slugs.length}] ${slug} — ${res.monster.nameFr} (CR ${res.monster.challengeRating})`,
        );
      }
    }
    await sleep(THROTTLE_MS);
  }

  seeds.sort((a, b) => a.nameFr.localeCompare(b.nameFr, 'fr'));

  // 3. Report.
  console.log('');
  console.log(`✓ Parsed ${seeds.length}/${slugs.length} monsters`);
  if (failures.length) {
    console.warn(`  ⚠ ${failures.length} failures:`);
    for (const f of failures.slice(0, 30)) console.warn(`     - ${f.slug}: ${f.reason}`);
    if (failures.length > 30) console.warn(`     ... and ${failures.length - 30} more`);
  }
  const withLegendary = seeds.filter((s) => s.legendaryActions.length > 0).length;
  const withRes = seeds.filter((s) => s.damageResistances?.length).length;
  const withImm = seeds.filter((s) => s.damageImmunities?.length).length;
  console.log(`  with legendary actions: ${withLegendary}`);
  console.log(`  with damage resistances: ${withRes}`);
  console.log(`  with damage immunities: ${withImm}`);
  const tritonWarrior = seeds.find((s) => s.slug === 'triton-du-feu-guerrier');
  console.log(`  triton-du-feu-guerrier present: ${tritonWarrior ? 'YES' : 'NO'}`);

  // Sample
  console.log('');
  console.log('Sample (triton-du-feu-guerrier):');
  if (tritonWarrior) console.log(JSON.stringify(tritonWarrior, null, 2));
  else console.log('  (not found)');

  // 4. Write output.
  const outDir = resolve(ROOT, 'data');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, 'monsters-aidedd-supplement.json');
  writeFileSync(outPath, JSON.stringify(seeds, null, 2), 'utf8');
  console.log('');
  console.log(`✓ Wrote ${seeds.length} monsters to ${outPath}`);

  // Also dump the failure list for follow-up.
  if (failures.length) {
    const failPath = resolve(ROOT, 'data', 'monsters-aidedd-failures.json');
    writeFileSync(failPath, JSON.stringify(failures, null, 2), 'utf8');
    console.log(`  failure log: ${failPath}`);
  }
}

const isMainModule = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isMainModule) {
  main().catch((err) => {
    console.error('✗ Import failed:', err);
    process.exit(1);
  });
}
