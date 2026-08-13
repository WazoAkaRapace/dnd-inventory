/**
 * Translate spell descriptions from AideDD.org.
 *
 * Usage: npx tsx scripts/translate-spell-descriptions.ts [batchStart] [batchSize]
 *   batchStart = index to start from (default 0)
 *   batchSize  = number of spells to process (default 999 = all)
 *
 * Fetches each spell's French page, extracts the description from
 * <div class='description'>, and saves descriptionFr + higherLevelFr.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SEED_PATH = resolve(ROOT, 'data', 'spells-seed.json');

interface SeedSpell {
  srdIndex: string;
  name: string;
  nameFr: string | null;
  castingTime: string | null;
  rangeText: string | null;
  duration: string | null;
  material: string | null;
  descriptionFr: string | null;
  higherLevelFr: string | null;
  [key: string]: unknown;
}

// French slugs from AideDD (same list as translate-spells.ts)
const AIDEDD_SLUGS: string[] = [
  'absorption-des-elements','agrandissement-rapetissement','aide','alarme','allie-planaire',
  'amelioration-de-caracteristique','amelioration-de-competences','amis','amitie-avec-les-animaux',
  'animation-d-objets','animation-des-morts','antidetection','apaisement-des-emotions',
  'apparence-trompeuse','appel-de-destrier','appel-de-destrier-superieur','appel-de-familier',
  'appel-de-la-foudre','arme-elementaire','arme-magique','arme-sacree','arme-spirituelle',
  'armure-d-agathys','armure-de-mage','arret-du-temps','aspersion-d-acide','assassin-imaginaire',
  'assignation-infernale','assistance','attraction-terrestre','aube','augure','aura-de-purete',
  'aura-de-vie','aura-de-vitalite','aura-du-croise','aura-magique-de-nystul','aura-sacree',
  'aversion-attirance','bagou','baies-nourricieres','bannissement','barbes-argentees',
  'barriere-de-lames','benediction','blessure','bosquet-des-druides','bouche-magique','bouclier',
  'bouclier-de-feu','bouclier-de-la-foi','bouclier-de-platine-de-fizban','bouffee-de-poison',
  'boule-de-feu','boule-de-feu-a-retardement','bourrasque','brume-mortelle','cage-de-force',
  'cage-des-ames','carquois-magique','catapulte','cecite-surdite','cercle-de-mort',
  'cercle-de-pouvoir','cercle-de-teleportation','cercle-magique','ceremonie','chaine-d-eclairs',
  'champ-antimagie','changement-de-forme','changement-de-plan','charme-monstre','charme-personne',
  'chatiment-aveuglant','chatiment-calcinant','chatiment-courrouce','chatiment-debilitant',
  'chatiment-du-ban','chatiment-revelateur','chatiment-tonitruant',
  'chien-de-garde-de-mordenkainen','clairvoyance','clignotement','clone','coffre-secret-de-leomund',
  'collet','colonne-de-flamme','communication-a-distance','communication-avec-les-animaux',
  'communication-avec-les-morts','communication-avec-les-plantes','communion',
  'communion-avec-la-nature','comprehension-des-langues','compulsion','cone-de-froid',
  'confusion','contact-avec-un-autre-plan','contact-glacial','contagion','contamination',
  'contrat','contresort','controle-de-l-eau','controle-des-flammes','controle-des-vents',
  'controle-du-climat','convocation-d-aberration','convocation-d-artificiel',
  'convocation-d-elementaire','convocation-d-esprit-draconique','convocation-de-bete',
  'convocation-de-celeste','convocation-de-demon-majeur','convocation-de-demons-mineurs',
  'convocation-de-fee','convocation-de-fielon','convocation-de-mort-vivant',
  'convocation-de-rejeton-d-ombre','convocations-instantanees-de-drawmij','coquille-antivie',
  'corde-enchantee','cordon-de-fleches','costume-d-outremonde-de-tasha','couleurs-dansantes',
  'coup-au-but','coup-de-tonnerre','couronne-d-etoiles','couronne-du-dement','couteau-de-glace',
  'creation','creation-d-homoncule','creation-de-mort-vivant','creation-de-nourriture-et-d-eau',
  'creation-ou-destruction-d-eau','croissance-d-epines','croissance-vegetale',
  'danse-irresistible-d-otto','danse-macabre','deblocage','decharge-occulte','dedale',
  'deguisement','delivrance-des-maledictions','deluge-d-energie-negative','demi-plan',
  'desintegration','detection-de-la-magie','detection-des-pensees','detection-du-mal-et-du-bien',
  'detection-du-poison-et-des-maladies','discours-captivant','dispersion',
  'disque-flottant-de-tenser','dissimulation','dissipation-de-la-magie',
  'dissipation-du-mal-et-du-bien','divination','doigt-de-mort','domination-de-bete',
  'domination-de-monstre','domination-de-personne','don-des-langues','double-illusoire',
  'dragon-illusoire','druidisme','duel-force','eclair','eclair-de-chaos','eclair-tracant',
  'eclat-du-soleil','embrasement','emprisonnement','enchevetrement','enervation',
  'ennemi-subconscient','ennemis-a-foison','entraves-de-givre','epee-de-mordenkainen',
  'epine-mentale','eruption-de-lames','eruption-de-terre','espieglerie-de-nathair',
  'esprit-faible','esprit-guerisseur','esprit-impenetrable','esprits-gardiens','eveil',
  'fabrication','faconnage-de-l-eau','faconnage-de-la-pierre','faconnage-de-la-terre',
  'faveur-divine','ferrage-foudroyant','festin-des-heros','feuille-morte',
  'flambee-d-aganazzar','flamme-eternelle','flamme-sacree','flammes','fleau','fleau-d-insectes',
  'fleau-elementaire','fleche-acide-de-melf','fleche-de-foudre','fleches-enflammees',
  'fletrissement','fletrissure-epouvantable-d-abi-dalzim','flou','force-fantasmagorique',
  'forme-etheree','forme-gazeuse','formes-animales','forteresse-d-intellect',
  'forteresse-majestueuse','fou-rire-de-tasha','fouet-epineux','fouet-mental-de-tasha',
  'foulee-brumeuse','foulee-d-ashardalon','foulee-dimensionnelle','foulee-tonitruante',
  'fracassement','frappe-du-vent-d-acier','frappe-du-zephyr','frappe-piegeuse','frayeur',
  'fureur-de-la-nature','fusion-dans-la-pierre','gardien-de-la-foi','gardien-de-la-nature',
  'gelure','glas','globe-d-invulnerabilite','glyphe-de-protection','gourdin-magique',
  'graisse','grande-foulee','grele-d-epines','guerison','guerison-de-groupe','hate','heroisme',
  'hurlement-psychique','identification','illusion-mineure','illusion-programmee',
  'image-majeure','image-miroir','image-silencieuse','immobilisation-de-monstre',
  'immobilisation-de-personne','immolation','infestation','injonction','insecte-geant',
  'interdiction','inversion-de-la-gravite','invisibilite','invisibilite-superieure',
  'invocation-d-animaux','invocation-d-elementaire','invocation-d-elementaires-mineurs',
  'invocation-d-etres-sylvestres','invocation-d-ombres','invocation-de-celeste',
  'invocation-de-fee','invocation-de-projectiles','invocation-de-volee','invulnerabilite',
  'lame-aux-flammes-vertes','lame-d-ombres','lame-de-feu','lame-du-desastre','lame-retentissante',
  'lance-d-arcon-psychique-de-raulothim','lenteur','levitation','liane-avide','libelle-aerien',
  'liberte-de-mouvement','lien-avec-une-bete','lien-de-protection','lien-telepathique-de-rary',
  'localisation-d-animaux-ou-de-plantes','localisation-d-objet','localisation-de-creature',
  'lueur-d-espoir','lueurs-feeriques','lumiere','lumiere-du-jour','lumieres-dansantes',
  'maelstrom','main-de-bigby','main-de-mage','mains-brulantes','malediction','malefice',
  'manoir-somptueux-de-mordenkainen','marche-sur-l-eau','marche-sur-le-vent',
  'marque-du-chasseur','mauvais-oeil','message','messager-animal','metal-brulant',
  'metamorphose','metamorphose-de-groupe','metamorphose-supreme','minuscules-meteores-de-melf',
  'mirage','mixture-caustique-de-tasha','modification-d-apparence','modification-de-memoire',
  'monture-fantome','moquerie-cruelle','mort-simulee','mot-de-guerison',
  'mot-de-guerison-de-groupe','mot-de-pouvoir-douloureux','mot-de-pouvoir-etourdissant',
  'mot-de-pouvoir-guerisseur','mot-de-pouvoir-mortel','mot-de-radiance','mot-de-retour',
  'motif-hypnotique','mur-d-eau','mur-d-epines','mur-de-feu','mur-de-force','mur-de-glace',
  'mur-de-lumiere','mur-de-pierre','mur-de-sable','mur-de-vent','mur-prismatique',
  'murmures-dissonants','mythes-et-legendes','nappe-de-brouillard','nuage-incendiaire',
  'nuage-nauseabond','nuee-de-boules-de-neige-de-snilloc','nuee-de-dagues','nuee-de-meteores',
  'oeil-magique','ombre-d-egarement','orbe-chromatique','ossements-de-la-terre','parole-divine',
  'passage-par-les-arbres','passage-sans-trace','passe-muraille','pattes-d-araignee',
  'peau-d-ecorce','peau-de-pierre','perturbations-synaptiques','petite-hutte-de-leomund',
  'petrification','peur','pierre-magique','piqure-mentale','poigne-electrique',
  'poigne-terreuse-de-maximilien','portail','portail-magique','porte-dimensionnelle',
  'premonition','preservation-des-morts','prestidigitation','prevoyance','priere-de-guerison',
  'prison-mentale','projectile-elementaire','projectile-magique','projection-astrale',
  'projection-d-image','protection-contre-la-mort','protection-contre-le-mal-et-le-bien',
  'protection-contre-le-poison','protection-contre-les-armes','protection-contre-une-energie',
  'protection-primordiale','protections-et-sceaux','purification-de-nourriture-et-d-eau',
  'pyrotechnie','quete','rappel-a-la-vie','rayon-affaiblissant','rayon-ardent','rayon-de-givre',
  'rayon-de-lune','rayon-de-soleil','rayon-empoisonne','rayonnement-ecoeurant',
  'rayons-prismatiques','raz-de-maree','regeneration','reincarnation','reparation',
  'repli-expeditif','represailles-infernales','resistance','respiration-aquatique',
  'restauration-partielle','restauration-superieure','resurrection','resurrection-supreme',
  'retour-a-la-vie','sacre-de-la-glace','sacre-de-la-pierre','sacre-des-flammes','sacre-du-vent',
  'sanctification','sanctuaire','sanctuaire-prive-de-mordenkainen','saut','saute-de-vent',
  'sauvagerie-primitive','scelle-de-portail','scrutation','secousse-sismique','sens-animal',
  'sens-de-l-orientation','sens-de-la-distorsion','sens-des-pieges','serviteur-invisible',
  'serviteur-miniature','sieste','silence','simulacre','simulacre-de-vie','soins',
  'soins-de-groupe','sommeil','songe','songe-du-voile-bleu','souffle-du-dragon','souhait',
  'sphere-aqueuse','sphere-de-feu','sphere-de-tempete','sphere-de-vitriol',
  'sphere-glaciale-d-otiluke','sphere-resiliente-d-otiluke','stabilisation','suggestion',
  'suggestion-de-groupe','symbole','telekinesie','telepathie','teleportation','tempete-de-feu',
  'tempete-de-grele','tempete-de-neige','tempete-vengeresse','temple-des-dieux','tenebres',
  'tenebres-oppressantes','tentacules-de-hadar','tentacules-noirs-d-evard','terraformage',
  'terrain-hallucinatoire','texte-illusoire','thaumaturgie','toile-d-araignee',
  'toucher-du-vampire','tourbillon','tourbillon-de-poussiere','trait-de-feu','trait-ensorcele',
  'transfert-de-vie','transformation-de-tenser','transformation-draconique',
  'transmutation-de-la-pierre','tremblement-de-terre','tsunami','urne-magique',
  'vague-destructrice','vague-tonnante','vent-protecteur','vents-contraires','verrou-magique',
  'vision-dans-le-noir','vision-supreme','voie-vegetale','voile-spirituel','voir-l-invisible',
  'vol','voracite-de-hadar','zone-de-verite',
];

// Manual mapping for spells whose French slug doesn't directly correspond to the srdIndex
// These are the 19 "named" spells that needed manual name translation
const SRD_TO_VF_OVERRIDE: Record<string, string> = {
  'acid-arrow': 'fleche-acide-de-melf',
  'arcane-hand': 'main-de-bigby',
  'arcane-sword': 'epee-de-mordenkainen',
  'arcanists-magic-aura': 'aura-magique-de-nystul',
  'black-tentacles': 'tentacules-noirs-d-evard',
  'faithful-hound': 'chien-de-garde-de-mordenkainen',
  'floating-disk': 'disque-flottant-de-tenser',
  'freezing-sphere': 'sphere-glaciale-d-otiluke',
  'heroes-feast': 'festin-des-heros',
  'hideous-laughter': 'fou-rire-de-tasha',
  'hunters-mark': 'marque-du-chasseur',
  'instant-summons': 'convocations-instantanees-de-drawmij',
  'irresistible-dance': 'danse-irresistible-d-otto',
  'magnificent-mansion': 'manoir-somptueux-de-mordenkainen',
  'private-sanctum': 'sanctuaire-prive-de-mordenkainen',
  'resilient-sphere': 'sphere-resiliente-d-otiluke',
  'secret-chest': 'coffre-secret-de-leomund',
  'telepathic-bond': 'lien-telepathique-de-rary',
  'tiny-hut': 'petite-hutte-de-leomund',
};

/** Convert a French display name to a URL slug (matching AideDD's vf= format).
 *  AideDD slugs: lowercase, accents stripped, spaces/apostrophes/special chars → hyphens.
 *  "d'acide" → "d-acide", "Modification d'apparence" → "modification-d-apparence" */
function nameToSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .toLowerCase()
    .replace(/['']/g, '-') // apostrophes → hyphens (d' → d-)
    .replace(/[^a-z0-9]+/g, '-') // non-alphanumeric → hyphen
    .replace(/-+/g, '-') // collapse consecutive hyphens
    .replace(/^-+|-+$/g, ''); // trim leading/trailing hyphens
}

function vfSlugFor(spell: SeedSpell): string {
  // Use override if available
  if (SRD_TO_VF_OVERRIDE[spell.srdIndex]) return SRD_TO_VF_OVERRIDE[spell.srdIndex];
  // Derive from French name
  if (spell.nameFr) return nameToSlug(spell.nameFr);
  // Fallback to English index
  return spell.srdIndex;
}

interface FetchResult {
  descriptionFr: string | null;
  higherLevelFr: string | null;
  castingTimeFr: string | null;
  rangeFr: string | null;
  durationFr: string | null;
  materialFr: string | null;
}

async function fetchDescription(vfSlug: string): Promise<FetchResult> {
  const url = `https://www.aidedd.org/dnd/sorts.php?vf=${vfSlug}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'DnDInventoryApp/1.0 (spell description translation)' },
    });
    if (!res.ok) return { descriptionFr: null, higherLevelFr: null, castingTimeFr: null, rangeFr: null, durationFr: null, materialFr: null };
    const html = await res.text();

    // Extract properties from AideDD's structured divs:
    // <div class='t'><strong>Temps d'incantation</strong> : value</div>
    // <div class='r'><strong>Portée</strong> : value</div>
    // <div class='c'><strong>Composantes</strong> : V, S, M (material text)</div>
    // <div class='d'><strong>Durée</strong> : value</div>
    const timeMatch = html.match(/<div\s+class=['"]t['"]><strong>Temps[^<]*<\/strong>\s*:\s*([^<]*)<\/div>/i);
    const rangeMatch = html.match(/<div\s+class=['"]r['"]><strong>Port[ée]e<\/strong>\s*:\s*([^<]*)<\/div>/i);
    const compMatch = html.match(/<div\s+class=['"]c['"]><strong>Composantes<\/strong>\s*:\s*([^<]*)<\/div>/i);
    const durMatch = html.match(/<div\s+class=['"]d['"]><strong>Dur[ée]e<\/strong>\s*:\s*([^<]*)<\/div>/i);

    const castingTimeFr = timeMatch?.[1]?.trim() || null;
    const rangeFr = rangeMatch?.[1]?.trim() || null;
    const durationFr = durMatch?.[1]?.trim() || null;

    // Extract material description from components field: "V, S, M (material text)"
    let materialFr: string | null = null;
    if (compMatch) {
      const compText = compMatch[1].trim();
      const matMatch = compText.match(/M\s*\(([^)]+)\)/);
      if (matMatch) materialFr = matMatch[1].trim();
    }

    // Description is in <div class='description'>...</div>
    const descMatch = html.match(/<div\s+class=['"]description['"]>([\s\S]*?)<\/div>/i);
    if (!descMatch) {
      return { descriptionFr: null, higherLevelFr: null, castingTimeFr, rangeFr, durationFr, materialFr };
    }

    let descHtml = descMatch[1];

    // Split on "Aux niveaux supérieurs"
    let higherLevelFr: string | null = null;
    const higherMatch = descHtml.match(/<strong><em>Aux niveaux sup[ée]rieurs<\/em><\/strong>\.?\s*(.*?)(?:<br>|$)/i);
    if (higherMatch) {
      higherLevelFr = cleanHtml(higherMatch[1]);
      descHtml = descHtml.replace(/<strong><em>Aux niveaux sup[ée]rieurs<\/em><\/strong>[\s\S]*$/i, '');
    }

    const descriptionFr = cleanHtml(descHtml);
    return { descriptionFr: descriptionFr || null, higherLevelFr, castingTimeFr, rangeFr, durationFr, materialFr };
  } catch {
    return { descriptionFr: null, higherLevelFr: null, castingTimeFr: null, rangeFr: null, durationFr: null, materialFr: null };
  }
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
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function main() {
  const batchStart = parseInt(process.argv[2] ?? '0', 10);
  const batchSize = parseInt(process.argv[3] ?? '999', 10);

  console.log(`[translate-desc] loading ${SEED_PATH}`);
  const spells: SeedSpell[] = JSON.parse(readFileSync(SEED_PATH, 'utf8'));

  // Process ALL spells to update French properties (castingTime, range, duration, material)
  // even if descriptionFr is already present. Filter to spells that still have English properties.
  const allSpells = spells
    .map((s, i) => ({ spell: s, index: i }))
    .filter(({ spell }) => {
      // Process if any property is still in English (contains feet/miles/English words)
      const r = spell.rangeText ?? '';
      const ct = spell.castingTime ?? '';
      const d = spell.duration ?? '';
      const m = spell.material ?? '';
      return r.includes('feet') || r.includes('miles') || r.includes('Self') || r.includes('Touch') || r.includes('Sight')
        || ct.includes('action') || ct.includes('minute') || ct.includes('hour')
        || d.includes('Instantaneous') || d.includes('round') || d.includes('minute') || d.includes('hour') || d.includes('Up to') || d.includes('dispelled')
        || (m && (m.includes('a ') || m.includes('the ') || m.match(/[a-z]{15,}/)));
    });

  const batch = allSpells.slice(batchStart, batchStart + batchSize);
  console.log(`[translate-desc] batch: start=${batchStart}, size=${batchSize}, spells to process=${batch.length}`);

  let updated = 0;
  let failed = 0;

  for (let i = 0; i < batch.length; i++) {
    const { spell, index } = batch[i];
    const vfSlug = vfSlugFor(spell);
    const result = await fetchDescription(vfSlug);

    if (result.castingTimeFr || result.rangeFr || result.durationFr || result.descriptionFr) {
      if (result.descriptionFr) spells[index].descriptionFr = result.descriptionFr;
      if (result.higherLevelFr) spells[index].higherLevelFr = result.higherLevelFr;
      // Overwrite English properties with French + metric versions
      if (result.castingTimeFr) spells[index].castingTime = result.castingTimeFr;
      if (result.rangeFr) spells[index].rangeText = result.rangeFr;
      if (result.durationFr) spells[index].duration = result.durationFr;
      if (result.materialFr) spells[index].material = result.materialFr;
      updated++;
    } else {
      failed++;
      console.log(`  ✗ ${spell.srdIndex} (${vfSlug})`);
    }

    if ((i + 1) % 10 === 0) {
      console.log(`[translate-desc] progress: ${i + 1}/${batch.length} (${updated} ok, ${failed} failed)`);
      // Save intermediate progress
      writeFileSync(SEED_PATH, JSON.stringify(spells, null, 2), 'utf8');
    }

    // Throttle: 120ms between requests
    await new Promise((r) => setTimeout(r, 120));
  }

  // Final save
  writeFileSync(SEED_PATH, JSON.stringify(spells, null, 2), 'utf8');
  console.log(`[translate-desc] batch done: ${updated} translated, ${failed} failed`);
  console.log(`[translate-desc] saved to ${SEED_PATH}`);
}

main().catch(console.error);
