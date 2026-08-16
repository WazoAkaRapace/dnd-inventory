/**
 * One-shot import script: fetches the French 5e monster catalog from the
 * em-squared/5e-drs GitHub repo (all sources: SRD + Livre des monstres).
 *
 * The 5e-drs repo stores each monster as a Markdown file with structured YAML
 * frontmatter (already French + metric). The frontmatter AC field is unreliable
 * for natural-armor monsters, so we also scrape the rendered 5e-drs.fr page
 * for the authoritative AC and HP values.
 *
 * Output: data/monsters-seed.json
 *
 * Run: npx tsx scripts/import-monsters.ts
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const RENDERED_PAGE = (slug: string) => `https://2014.5e-drs.fr/bestiaire/${slug}/`;

// ---------- Output type ----------

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
  traits: MonsterAction[];
  actions: MonsterAction[];
  legendaryActions: MonsterAction[];
  source: string;
  sourcePage: number | null;
}

// ---------- YAML frontmatter parser (minimal, no deps) ----------

/** Parse the YAML frontmatter block (between --- markers) into a nested object. */
export function parseFrontmatter(md: string): Record<string, any> {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  return parseYaml(m[1]);
}

/**
 * Tiny YAML parser sufficient for 5e-drs frontmatter (scalars, lists, nested maps).
 * Not a general YAML parser — handles the subset we actually see.
 */
function parseYaml(text: string): Record<string, any> {
  const out: Record<string, any> = {};
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    if (!raw.trim() || raw.trim().startsWith('#')) {
      i++;
      continue;
    }
    const indent = raw.length - raw.trimStart().length;
    if (indent !== 0) {
      i++;
      continue; // skip orphan indented lines (shouldn't happen at top level)
    }
    const trimmed = raw.trim();
    const colon = trimmed.indexOf(':');
    if (colon === -1) {
      i++;
      continue;
    }
    const key = trimmed.slice(0, colon).trim();
    const rest = trimmed.slice(colon + 1).trim();

    if (rest === '') {
      // Could be a nested map or a list — peek at next line's indent
      const next = lines[i + 1] ?? '';
      const nextIndent = next.length - next.trimStart().length;
      if (next.trim().startsWith('- ')) {
        // List
        const items: any[] = [];
        let j = i + 1;
        while (j < lines.length) {
          const l = lines[j];
          const li = l.length - l.trimStart().length;
          if (l.trim().startsWith('- ') && li === nextIndent) {
            const itemRaw = l.trim().slice(2).trim();
            if (itemRaw.includes(':')) {
              // inline map item like `- name: "foo"`
              items.push(parseInlineMap(itemRaw, lines, j, nextIndent));
              // advance past consumed lines
              while (j + 1 < lines.length) {
                const nl = lines[j + 1];
                const ni = nl.length - nl.trimStart().length;
                if (ni > nextIndent && !nl.trim().startsWith('- ')) j++;
                else break;
              }
            } else {
              items.push(stripQuotes(itemRaw));
            }
            j++;
          } else if (l.trim() === '') {
            j++;
          } else {
            break;
          }
        }
        out[key] = items;
        // j already points at the next unprocessed line (or past end).
        // The main loop's i++ at the bottom would skip it, so set i = j - 1
        // so that i++ lands exactly on the next key.
        i = j - 1;
      } else if (nextIndent > 0) {
        // Nested map
        const { obj, consumed } = parseNestedMap(lines, i + 1, nextIndent);
        out[key] = obj;
        // consumed lines + 1 for the key line itself; -1 because i++ follows
        i += consumed;
      } else {
        out[key] = null;
      }
    } else {
      out[key] = stripQuotes(rest);
    }
    i++;
  }
  return out;
}

/** Parse a nested map starting at lineIdx with the given expected indent. */
function parseNestedMap(
  lines: string[],
  startIdx: number,
  indent: number,
): { obj: Record<string, any>; consumed: number } {
  const obj: Record<string, any> = {};
  let i = startIdx;
  let consumed = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.trim() === '' || l.trim().startsWith('#')) {
      i++;
      consumed++;
      continue;
    }
    const li = l.length - l.trimStart().length;
    if (li < indent) break;
    if (li > indent) {
      // deeper — shouldn't normally happen, skip
      i++;
      consumed++;
      continue;
    }
    const trimmed = l.trim();
    const colon = trimmed.indexOf(':');
    if (colon === -1) {
      i++;
      consumed++;
      continue;
    }
    const key = trimmed.slice(0, colon).trim();
    const rest = trimmed.slice(colon + 1).trim();
    if (rest === '') {
      // peek deeper
      const next = lines[i + 1] ?? '';
      const ni = next.length - next.trimStart().length;
      if (ni > indent) {
        const { obj: sub, consumed: c } = parseNestedMap(lines, i + 1, ni);
        obj[key] = sub;
        i += 1 + c;
        consumed += 1 + c;
      } else {
        obj[key] = null;
        i++;
        consumed++;
      }
    } else if (rest.startsWith('- ')) {
      // inline list start on same line
      const items: any[] = [];
      items.push(stripQuotes(rest.slice(2).trim()));
      i++;
      consumed++;
      while (i < lines.length) {
        const nl = lines[i];
        const nli = nl.length - nl.trimStart().length;
        if (nli === indent && nl.trim().startsWith('- ')) {
          items.push(stripQuotes(nl.trim().slice(2).trim()));
          i++;
          consumed++;
        } else break;
      }
      obj[key] = items;
    } else {
      obj[key] = stripQuotes(rest);
      i++;
      consumed++;
    }
  }
  return { obj, consumed };
}

/** Parse a list item that starts as `- name: "foo"` possibly with more keys on following indented lines. */
function parseInlineMap(
  firstItemRaw: string,
  lines: string[],
  idx: number,
  listIndent: number,
): Record<string, any> {
  const obj: Record<string, any> = {};
  const colon = firstItemRaw.indexOf(':');
  if (colon !== -1) {
    const k = firstItemRaw.slice(0, colon).trim();
    const v = firstItemRaw.slice(colon + 1).trim();
    obj[k] = stripQuotes(v);
  }
  let j = idx + 1;
  while (j < lines.length) {
    const l = lines[j];
    const li = l.length - l.trimStart().length;
    if (li > listIndent && !l.trim().startsWith('- ')) {
      const trimmed = l.trim();
      const c = trimmed.indexOf(':');
      if (c !== -1) {
        const k = trimmed.slice(0, c).trim();
        const v = trimmed.slice(c + 1).trim();
        obj[k] = v === '' ? true : parseBool(stripQuotes(v));
      }
      j++;
    } else break;
  }
  // normalize isExpert string → boolean
  if ('isExpert' in obj) obj.isExpert = obj.isExpert === true || obj.isExpert === 'true';
  return obj;
}

function parseBool(v: any): any {
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v;
}

function stripQuotes(s: string): any {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return parseBool(s);
}

// ---------- Markdown body parser (sections + actions) ----------

interface ParsedBody {
  traits: MonsterAction[];
  actions: MonsterAction[];
  legendaryActions: MonsterAction[];
}

/** Split the markdown body (after frontmatter) into sections, then parse entries. */
export function parseBody(md: string): ParsedBody {
  // Strip frontmatter
  const body = md.replace(/^---[\s\S]*?\r?\n---\r?\n/, '');
  const sections: { heading: string; content: string }[] = [];
  const parts = body.split(/^## /m);
  for (const part of parts) {
    if (!part.trim()) continue;
    const nl = part.indexOf('\n');
    const heading = (nl === -1 ? part : part.slice(0, nl)).trim().toLowerCase();
    const content = nl === -1 ? '' : part.slice(nl + 1);
    sections.push({ heading, content });
  }

  const result: ParsedBody = { traits: [], actions: [], legendaryActions: [] };
  for (const s of sections) {
    const entries = parseSectionEntries(s.content);
    if (s.heading.includes('légendaire')) {
      result.legendaryActions = entries;
    } else if (s.heading.startsWith('action')) {
      result.actions = entries;
    } else {
      // Capacités, Traits, or any other section = traits
      result.traits.push(...entries);
    }
  }
  return result;
}

/**
 * Parse entries from a section body. Each entry is introduced by a bold name,
 * in one of these markdown forms:
 *   **_Name_**. description...    (bold-italic)
 *   _**Name**_. description...    (italic-bold)
 *   **Name.** description...      (bold, period inside)
 *   **Name**. description...      (bold, period outside)
 * The name is everything up to the first closing `**`; the rest (after an
 * optional period) is the description.
 */
function parseSectionEntries(content: string): MonsterAction[] {
  const entries: MonsterAction[] = [];
  const lines = content.split(/\r?\n/);
  let current: MonsterAction | null = null;
  let buf: string[] = [];

  const flush = () => {
    if (!current) return;
    current.desc = cleanMarkdownText(buf.join('\n').trim());
    if (current.desc) parseAttackInfo(current);
    entries.push(current);
    current = null;
    buf = [];
  };

  // A line starts a new entry if it begins (after optional whitespace) with ** or _**
  // and contains a matching closing **.
  const isEntryStart = (line: string) =>
    /^\s*(\*\*_|_\*\*|\*\*)/.test(line) && /\*\*/.test(line.slice(line.indexOf('**') + 2));

  for (const line of lines) {
    if (!line.trim()) {
      if (current) buf.push('');
      continue;
    }
    if (isEntryStart(line)) {
      flush();
      // Find the first ** opening and its matching closing **
      const startIdx = line.indexOf('**');
      // skip the opening marker (and any leading _ or * right after)
      let nameStart = startIdx + 2;
      if (line[nameStart] === '_') nameStart++;
      // find closing **
      const closeIdx = line.indexOf('**', nameStart);
      let nameEnd = closeIdx;
      // the name may have a trailing _ before the closing **
      if (nameEnd > nameStart && line[nameEnd - 1] === '_') nameEnd--;
      const nameRaw = line.slice(nameStart, nameEnd).replace(/[*_]/g, '').trim();
      // everything after the closing ** is the start of the description
      let rest = line.slice(closeIdx + 2);
      // strip leading markers: underscores, periods, parens, whitespace
      // (handles **_. , **_ , **. , **) followed by description text
      rest = rest.replace(/^[\s_.);]+/, '');
      current = { name: nameRaw, desc: '' };
      buf = rest.trim() ? [rest] : [];
    } else if (current) {
      buf.push(line);
    }
  }
  flush();
  return entries;
}

/** Strip markdown link/emphasis noise from descriptive text. */
function cleanMarkdownText(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url) → text
    .replace(/\*\*/g, '') // bold
    .replace(/__/g, '') // bold (underscore)
    .replace(/(?<!\*)\*(?!\*)/g, '') // italic (single *)
    .replace(/(?<!_)_(?!_)/g, '') // italic (single underscore)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract attack bonus, damage dice, and damage type from an action's desc. */
function parseAttackInfo(action: MonsterAction): void {
  const d = action.desc;
  // "+9 pour toucher"
  const atk = d.match(/[+:]\s*(\d+)\s+pour toucher/);
  if (atk) action.attackBonus = parseInt(atk[1], 10);
  // "15 (3d6+5) dégâts contondants" or "5 (1d6+2) dégâts perforants"
  const dmg = d.match(/(\d+)\s*\((\d+d\d+(?:[+-]\d+)?)\)\s*dégâts\s*(\w+)/);
  if (dmg) {
    action.damageDice = dmg[2];
    action.damageType = dmg[3];
  }
}

// ---------- Rendered-page scraper for AC + HP ----------

interface RenderedStats {
  armorClass: number | null;
  armorDesc: string | null;
  hitPoints: number | null;
  hitDice: string | null;
}

/** Fetch the rendered bestiaire page and extract AC + HP from the HTML. */
async function fetchRenderedStats(slug: string): Promise<RenderedStats> {
  try {
    const res = await fetch(RENDERED_PAGE(slug), {
      headers: { 'User-Agent': 'DnDInventoryApp/1.0 (monster-importer)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return emptyStats();
    const html = await res.text();

    // AC: <div class="monster-armor-class"><strong>Classe d'armure</strong> <span>17 (armure naturelle)</span>
    const acMatch = html.match(
      /monster-armor-class"><strong>[^<]*<\/strong>\s*<span>([^<]*)<\/span>/,
    );
    // HP: <div class="monster-hit-points"><strong>Points de vie</strong> <span>135 (18d10+36)</span>
    const hpMatch = html.match(
      /monster-hit-points"><strong>[^<]*<\/strong>\s*<span>([^<]*)<\/span>/,
    );

    let armorClass: number | null = null;
    let armorDesc: string | null = null;
    if (acMatch) {
      const raw = acMatch[1].trim();
      const num = raw.match(/^(\d+)/);
      if (num) armorClass = parseInt(num[1], 10);
      const desc = raw.match(/\(([^)]*)\)/);
      if (desc) armorDesc = desc[1].trim();
    }

    let hitPoints: number | null = null;
    let hitDice: string | null = null;
    if (hpMatch) {
      const raw = hpMatch[1].trim();
      const num = raw.match(/^(\d+)/);
      if (num) hitPoints = parseInt(num[1], 10);
      const dice = raw.match(/\((\d+d\d+(?:[+-]\d+)?)\)/);
      if (dice) hitDice = dice[1];
    }

    return { armorClass, armorDesc, hitPoints, hitDice };
  } catch {
    return emptyStats();
  }
}

function emptyStats(): RenderedStats {
  return { armorClass: null, armorDesc: null, hitPoints: null, hitDice: null };
}

// ---------- XP from CR ----------

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

function xpForCr(cr: string): number {
  return CR_XP[cr] ?? 0;
}

function crToNumber(cr: string): number {
  if (cr === '-' || cr === '') return 0;
  return parseFloat(cr) || 0;
}

// ---------- Main conversion ----------

export function convertMonster(
  slug: string,
  md: string,
  rendered: RenderedStats,
): SeedMonster | null {
  const fm = parseFrontmatter(md);
  // Include all sources from 5e-drs (SRD + Livre des monstres + others)

  const body = parseBody(md);
  const challenge = String(fm.challenge ?? '0');

  const abilities = (fm.abilityScores ?? {}) as any;
  const speed = (fm.movement ?? {}) as Record<string, number>;
  const senses = fm.senses ?? {};

  return {
    slug,
    nameFr: String(fm.title ?? slug),
    type: String(fm.type ?? ''),
    subtype: (fm.subtype as string) ?? null,
    size: String(fm.size ?? 'M'),
    alignment: (fm.alignment as string) ?? null,
    armorClass: rendered.armorClass ?? 10,
    armorDesc: rendered.armorDesc,
    hitPoints: rendered.hitPoints ?? 10,
    hitDice: rendered.hitDice,
    speed,
    abilities: {
      for: Number(abilities.for ?? 10),
      dex: Number(abilities.dex ?? 10),
      con: Number(abilities.con ?? 10),
      int: Number(abilities.int ?? 10),
      sag: Number(abilities.sag ?? 10),
      cha: Number(abilities.cha ?? 10),
    },
    savingThrows: Array.isArray(fm.savingThrows) ? fm.savingThrows : [],
    skills: (Array.isArray(fm.skills) ? fm.skills : []).map((s: any) => ({
      name: typeof s === 'string' ? s : (s?.name ?? String(s)),
      isExpert: typeof s === 'object' ? !!s.isExpert : false,
    })),
    languages: Array.isArray(fm.languages) ? fm.languages : [],
    challengeRating: crToNumber(challenge),
    xp: xpForCr(challenge),
    senses: senses ? buildSensesString(senses) : null,
    telepathy: (fm.telepathy as number) ?? null,
    damageResistances: null,
    damageImmunities: null,
    conditionImmunities: null,
    traits: body.traits,
    actions: body.actions,
    legendaryActions: body.legendaryActions,
    source: String(fm.source ?? ''),
    sourcePage: fm.source_page != null ? Number(fm.source_page) : null,
  };
}

function buildSensesString(senses: any): string {
  const parts: string[] = [];
  if (senses.blindsight) parts.push(`vision aveugle ${senses.blindsight} m`);
  if (senses.darkvision) parts.push(`vision dans le noir ${senses.darkvision} m`);
  if (senses.tremorsense) parts.push(`perception des vibrations ${senses.tremorsense} m`);
  if (senses.truesight) parts.push(`vision véritable ${senses.truesight} m`);
  return parts.length ? parts.join(', ') : null;
}

// ---------- Concurrency helper ----------

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

async function _fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'DnDInventoryApp/1.0 (monster-importer)' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  return res.text();
}

/** Ensure a shallow clone of the 5e-drs repo exists in the OS temp dir. */
async function ensureRepoClone(): Promise<string> {
  const { existsSync } = await import('node:fs');
  const repoDir = resolve(process.env.TMPDIR ?? '/tmp', '5e-drs');
  if (existsSync(resolve(repoDir, 'docs', 'bestiaire'))) {
    console.log(`✓ Using existing clone at ${repoDir}`);
    return repoDir;
  }
  console.log(`→ Cloning em-squared/5e-drs (shallow) to ${repoDir}...`);
  const { execFileSync } = await import('node:child_process');
  execFileSync(
    'git',
    ['clone', '--depth', '1', 'https://github.com/em-squared/5e-drs.git', repoDir],
    {
      stdio: 'pipe',
    },
  );
  console.log('  clone complete');
  return repoDir;
}

// ---------- Main ----------

async function main() {
  // 1. Clone (or reuse) the repo locally — one git operation, no per-file HTTP
  const repoDir = await ensureRepoClone();
  const bestiaireDir = resolve(repoDir, 'docs', 'bestiaire');

  const entries = readdirSync(bestiaireDir, { withFileTypes: true });
  const slugs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  console.log(`  ${slugs.length} monster directories`);

  // 2. Read all markdown files locally (synchronous, instant)
  const allMonsters: { slug: string; md: string }[] = [];
  for (const slug of slugs) {
    const mdPath = resolve(bestiaireDir, slug, 'README.md');
    try {
      const md = readFileSync(mdPath, 'utf8');
      allMonsters.push({ slug, md });
    } catch {
      console.warn(`  ⚠ no README.md for ${slug}`);
    }
  }

  // 3. Include ALL monsters (SRD + Livre des monstres + other sources)
  const allSourceMonsters = allMonsters.filter((m) => {
    const fm = parseFrontmatter(m.md);
    // Skip entries without a challenge rating (NPCs without stats)
    return fm.challenge !== undefined;
  });
  console.log(`  ${allSourceMonsters.length} monsters (all sources)`);

  // 4. Scrape rendered pages for AC/HP
  console.log('→ Scraping rendered 5e-drs.fr pages for AC/HP (parallel, 8 at a time)...');
  const allSlugs = allSourceMonsters.map((m) => m.slug);
  const rendered = await mapLimit(allSlugs, 8, async (slug, idx) => {
    if ((idx + 1) % 50 === 0) console.log(`  rendered ${idx + 1}/${allSlugs.length}`);
    const stats = await fetchRenderedStats(slug);
    if ((idx + 1) % 8 === 0) await new Promise((r) => setTimeout(r, 80));
    return { slug, stats };
  });
  const renderedMap = new Map(rendered.map((r) => [r.slug, r.stats]));

  const seeds: SeedMonster[] = [];
  let missingAc = 0;
  let missingHp = 0;
  for (const { slug, md } of allSourceMonsters) {
    const stats = renderedMap.get(slug) ?? emptyStats();
    if (stats.armorClass === null) missingAc++;
    if (stats.hitPoints === null) missingHp++;
    const seed = convertMonster(slug, md, stats);
    if (seed) seeds.push(seed);
  }

  seeds.sort((a, b) => a.nameFr.localeCompare(b.nameFr, 'fr'));

  console.log('');
  console.log(`✓ Total SRD monsters: ${seeds.length}`);
  if (missingAc) console.warn(`  ⚠ ${missingAc} monsters missing AC (fell back to 10)`);
  if (missingHp) console.warn(`  ⚠ ${missingHp} monsters missing HP (fell back to 10)`);

  // Breakdowns
  const byCr: Record<string, number> = {};
  for (const s of seeds) {
    const cr = String(s.challengeRating);
    byCr[cr] = (byCr[cr] || 0) + 1;
  }
  console.log('  By CR:', byCr);

  const withLegendary = seeds.filter((s) => s.legendaryActions.length > 0).length;
  console.log(`  With legendary actions: ${withLegendary}`);

  // Sample
  console.log('');
  console.log('Sample (gobelin):');
  const gob = seeds.find((s) => s.slug === 'gobelin');
  if (gob) console.log(JSON.stringify(gob, null, 2));
  else console.log('  (not found)');

  // Write
  const outDir = resolve(ROOT, 'data');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, 'monsters-seed.json');
  writeFileSync(outPath, JSON.stringify(seeds, null, 2), 'utf8');
  console.log('');
  console.log(`✓ Wrote ${seeds.length} monsters to ${outPath}`);
}

// Export for tests / reuse
export { emptyStats, fetchRenderedStats, type RenderedStats, type SeedMonster };

// Only run main() when this file is executed directly (not when imported)
import { pathToFileURL } from 'node:url';

const isMainModule = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isMainModule) {
  main().catch((err) => {
    console.error('✗ Import failed:', err);
    process.exit(1);
  });
}
