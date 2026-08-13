/**
 * Import non-SRD spells from AideDD.org.
 *
 * These spells come from expansion books (Xanathar's, Tasha's, Fizban's)
 * and are not in the 5e-bits SRD database. We scrape them directly from
 * AideDD's French spell pages.
 *
 * Usage: npx tsx scripts/import-extra-spells.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SEED_PATH = resolve(ROOT, 'data', 'spells-seed.json');
const MISSING_PATH = resolve(ROOT, 'scripts', 'missing-spells.json');

interface SeedSpell {
  srdIndex: string;
  name: string;
  nameFr: string | null;
  level: number;
  school: string;
  castingTime: string | null;
  rangeText: string | null;
  components: string[];
  material: string | null;
  duration: string | null;
  concentration: boolean;
  ritual: boolean;
  description: string | null;
  descriptionFr: string | null;
  higherLevel: string | null;
  higherLevelFr: string | null;
  attackType: string | null;
  damageJson: string | null;
  dcJson: string | null;
  classes: string[];
}

function cleanHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Map English class names to French (same as import-spells.ts)
const CLASS_FR: Record<string, string> = {
  Wizard: 'Magicien', Sorcerer: 'Ensorceleur', Warlock: 'Occultiste',
  Cleric: 'Clerc', Bard: 'Barde', Druid: 'Druide',
  Paladin: 'Paladin', Ranger: 'Rôdeur', Artificer: 'Artificier',
};

interface ScrapedSpell {
  nameFr: string;
  nameEn: string;
  level: number;
  school: string;
  castingTime: string | null;
  rangeText: string | null;
  components: string[];
  material: string | null;
  duration: string | null;
  concentration: boolean;
  ritual: boolean;
  descriptionFr: string | null;
  higherLevelFr: string | null;
  classes: string[];
  source: string | null;
}

async function scrapeSpell(vfSlug: string): Promise<ScrapedSpell | null> {
  const url = `https://www.aidedd.org/dnd/sorts.php?vf=${vfSlug}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'DnDInventoryApp/1.0 (extra spell import)' },
    });
    if (!res.ok) return null;
    const html = await res.text();

    // French name from <h1>
    const h1Match = html.match(/<h1>(.*?)<\/h1>/i);
    const nameFr = h1Match ? cleanHtml(h1Match[1]) : vfSlug;

    // English name from the vo= link at the bottom
    const voMatch = html.match(/sorts\.php\?vo=([a-z0-9-]+)/i);
    const nameEn = voMatch ? voMatch[1] : vfSlug;

    // School and level: <div class='ecole'>niveau 3 - évocation</div>
    const ecoleMatch = html.match(/<div\s+class=['"]ecole['"]>(.*?)<\/div>/i);
    let level = 0;
    let school = '';
    if (ecoleMatch) {
      const ecoleText = cleanHtml(ecoleMatch[1]);
      // "niveau 3 - évocation" or "tour de magie - évocation"
      const levelMatch = ecoleText.match(/niveau\s+(\d+)/i);
      const tourMatch = ecoleText.match(/tour de magie/i);
      level = levelMatch ? parseInt(levelMatch[1], 10) : 0;
      if (tourMatch) level = 0;
      const schoolMatch = ecoleText.match(/-\s*(\w+)/);
      school = schoolMatch ? schoolMatch[1].toLowerCase().trim() : 'evocation';
    }

    // Properties
    const timeMatch = html.match(/<div\s+class=['"]t['"]><strong>Temps[^<]*<\/strong>\s*:\s*([^<]*)<\/div>/i);
    const rangeMatch = html.match(/<div\s+class=['"]r['"]><strong>Port[ée]e<\/strong>\s*:\s*([^<]*)<\/div>/i);
    const compMatch = html.match(/<div\s+class=['"]c['"]><strong>Composantes<\/strong>\s*:\s*([^<]*)<\/div>/i);
    const durMatch = html.match(/<div\s+class=['"]d['"]><strong>Dur[ée]e<\/strong>\s*:\s*([^<]*)<\/div>/i);

    const castingTime = timeMatch?.[1]?.trim() || null;
    const rangeText = rangeMatch?.[1]?.trim() || null;
    const durationText = durMatch?.[1]?.trim() || null;

    // Parse components and material
    let components: string[] = [];
    let material: string | null = null;
    if (compMatch) {
      const compText = compMatch[1].trim();
      // Extract V, S, M letters before any parenthesis
      const lettersMatch = compText.match(/^([VSM,\s]+)/);
      if (lettersMatch) {
        components = lettersMatch[1].split(',').map(s => s.trim()).filter(s => /^[VSM]$/.test(s));
      }
      const matMatch = compText.match(/M\s*\(([^)]+)\)/);
      if (matMatch) material = matMatch[1].trim();
    }

    // Concentration and ritual from duration text
    const concentration = !!(durationText && /concentration/i.test(durationText));
    const ritual = !!(durationText && /rituel/i.test(durationText));

    // Description
    const descMatch = html.match(/<div\s+class=['"]description['"]>([\s\S]*?)<\/div>/i);
    let descriptionFr: string | null = null;
    let higherLevelFr: string | null = null;
    if (descMatch) {
      let descHtml = descMatch[1];
      const higherMatch = descHtml.match(/<strong><em>Aux niveaux sup[ée]rieurs<\/em><\/strong>\.?\s*(.*?)(?:<br>|$)/i);
      if (higherMatch) {
        higherLevelFr = cleanHtml(higherMatch[1]);
        descHtml = descHtml.replace(/<strong><em>Aux niveaux sup[ée]rieurs<\/em><\/strong>[\s\S]*$/i, '');
      }
      descriptionFr = cleanHtml(descHtml);
    }

    // Classes from div.classe elements
    const classMatches = [...html.matchAll(/<div\s+class=['"]classe['"]>(.*?)<\/div>/gi)];
    const classes = classMatches
      .map(m => cleanHtml(m[1]).trim())
      .filter(c => c.length > 0);

    // Source book
    const sourceMatch = html.match(/<div\s+class=['"]source['"]>(.*?)<\/div>/i);
    const source = sourceMatch ? cleanHtml(sourceMatch[1]) : null;

    return {
      nameFr, nameEn, level, school, castingTime, rangeText,
      components, material, duration: durationText, concentration, ritual,
      descriptionFr, higherLevelFr, classes, source,
    };
  } catch {
    return null;
  }
}

async function main() {
  console.log('[import-extra] loading existing seed + missing list');
  const spells: SeedSpell[] = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
  const missingSlugs: string[] = JSON.parse(readFileSync(MISSING_PATH, 'utf8'));
  console.log(`[import-extra] ${spells.length} existing spells, ${missingSlugs.length} to import`);

  let added = 0;
  let failed = 0;
  const newSpells: SeedSpell[] = [];

  for (let i = 0; i < missingSlugs.length; i++) {
    const vfSlug = missingSlugs[i];
    const scraped = await scrapeSpell(vfSlug);

    if (scraped) {
      const seedSpell: SeedSpell = {
        srdIndex: scraped.nameEn || vfSlug,
        name: scraped.nameEn.charAt(0).toUpperCase() + scraped.nameEn.slice(1).replace(/-/g, ' '),
        nameFr: scraped.nameFr,
        level: scraped.level,
        school: scraped.school,
        castingTime: scraped.castingTime,
        rangeText: scraped.rangeText,
        components: scraped.components,
        material: scraped.material,
        duration: scraped.duration,
        concentration: scraped.concentration,
        ritual: scraped.ritual,
        description: scraped.descriptionFr, // Use French as primary (no English source)
        descriptionFr: scraped.descriptionFr,
        higherLevel: scraped.higherLevelFr,
        higherLevelFr: scraped.higherLevelFr,
        attackType: null,
        damageJson: null,
        dcJson: null,
        classes: scraped.classes,
      };
      newSpells.push(seedSpell);
      added++;
    } else {
      failed++;
      console.log(`  ✗ ${vfSlug}`);
    }

    if ((i + 1) % 20 === 0) {
      console.log(`[import-extra] progress: ${i + 1}/${missingSlugs.length} (${added} ok, ${failed} failed)`);
    }

    // Throttle
    await new Promise((r) => setTimeout(r, 150));
  }

  console.log(`[import-extra] done: ${added} imported, ${failed} failed`);

  // Merge and save
  const allSpells = [...spells, ...newSpells];
  // Sort by level then name
  allSpells.sort((a, b) => a.level - b.level || (a.nameFr ?? a.name).localeCompare(b.nameFr ?? b.name));

  writeFileSync(SEED_PATH, JSON.stringify(allSpells, null, 2), 'utf8');
  console.log(`[import-extra] saved ${allSpells.length} spells to ${SEED_PATH}`);
}

main().catch(console.error);
