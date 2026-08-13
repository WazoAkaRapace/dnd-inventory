/**
 * Translate spells to French using AideDD.org data.
 *
 * AideDD French spell pages: https://www.aidedd.org/dnd/sorts.php?vf=[french-slug]
 * The page has the French name in an <h1> and a link to the English version
 * via vo=[english-slug] at the bottom.
 *
 * Strategy: fetch each French page, extract French name from <h1> and English
 * name from the vo= link. Build srdIndex → nameFr mapping.
 *
 * Usage: npx tsx scripts/translate-spells.ts
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
  [key: string]: unknown;
}

// French slugs from AideDD filter page (provided by user — 490 entries)
const AIDEDD_SLUGS: string[] = [
  'absorption-des-elements', 'agrandissement-rapetissement', 'aide', 'alarme',
  'allie-planaire', 'amelioration-de-caracteristique', 'amelioration-de-competences',
  'amis', 'amitie-avec-les-animaux', 'animation-d-objets', 'animation-des-morts',
  'antidetection', 'apaisement-des-emotions', 'apparence-trompeuse', 'appel-de-destrier',
  'appel-de-destrier-superieur', 'appel-de-familier', 'appel-de-la-foudre',
  'arme-elementaire', 'arme-magique', 'arme-sacree', 'arme-spirituelle',
  'armure-d-agathys', 'armure-de-mage', 'arret-du-temps', 'aspersion-d-acide',
  'assassin-imaginaire', 'assignation-infernale', 'assistance', 'attraction-terrestre',
  'aube', 'augure', 'aura-de-purete', 'aura-de-vie', 'aura-de-vitalite',
  'aura-du-croise', 'aura-magique-de-nystul', 'aura-sacree', 'aversion-attirance',
  'bagou', 'baies-nourricieres', 'bannissement', 'barbes-argentees', 'barriere-de-lames',
  'benediction', 'blessure', 'bosquet-des-druides', 'bouche-magique', 'bouclier',
  'bouclier-de-feu', 'bouclier-de-la-foi', 'bouclier-de-platine-de-fizban',
  'bouffee-de-poison', 'boule-de-feu', 'boule-de-feu-a-retardement', 'bourrasque',
  'brume-mortelle', 'cage-de-force', 'cage-des-ames', 'carquois-magique', 'catapulte',
  'cecite-surdite', 'cercle-de-mort', 'cercle-de-pouvoir', 'cercle-de-teleportation',
  'cercle-magique', 'ceremonie', 'chaine-d-eclairs', 'champ-antimagie',
  'changement-de-forme', 'changement-de-plan', 'charme-monstre', 'charme-personne',
  'chatiment-aveuglant', 'chatiment-calcinant', 'chatiment-courrouce',
  'chatiment-debilitant', 'chatiment-du-ban', 'chatiment-revelateur',
  'chatiment-tonitruant', 'chien-de-garde-de-mordenkainen', 'clairvoyance',
  'clignotement', 'clone', 'coffre-secret-de-leomund', 'collet', 'colonne-de-flamme',
  'communication-a-distance', 'communication-avec-les-animaux',
  'communication-avec-les-morts', 'communication-avec-les-plantes', 'communion',
  'communion-avec-la-nature', 'comprehension-des-langues', 'compulsion', 'cone-de-froid',
  'confusion', 'contact-avec-un-autre-plan', 'contact-glacial', 'contagion',
  'contamination', 'contrat', 'contresort', 'controle-de-l-eau', 'controle-des-flammes',
  'controle-des-vents', 'controle-du-climat', 'convocation-d-aberration',
  'convocation-d-artificiel', 'convocation-d-elementaire', 'convocation-d-esprit-draconique',
  'convocation-de-bete', 'convocation-de-celeste', 'convocation-de-demon-majeur',
  'convocation-de-demons-mineurs', 'convocation-de-fee', 'convocation-de-fielon',
  'convocation-de-mort-vivant', 'convocation-de-rejeton-d-ombre',
  'convocations-instantanees-de-drawmij', 'coquille-antivie', 'corde-enchantee',
  'cordon-de-fleches', 'costume-d-outremonde-de-tasha', 'couleurs-dansantes',
  'coup-au-but', 'coup-de-tonnerre', 'couronne-d-etoiles', 'couronne-du-dement',
  'couteau-de-glace', 'creation', 'creation-d-homoncule', 'creation-de-mort-vivant',
  'creation-de-nourriture-et-d-eau', 'creation-ou-destruction-d-eau',
  'croissance-d-epines', 'croissance-vegetale', 'danse-irresistible-d-otto',
  'danse-macabre', 'deblocage', 'decharge-occulte', 'dedale', 'deguisement',
  'delivrance-des-maledictions', 'deluge-d-energie-negative', 'demi-plan',
  'desintegration', 'detection-de-la-magie', 'detection-des-pensees',
  'detection-du-mal-et-du-bien', 'detection-du-poison-et-des-maladies',
  'discours-captivant', 'dispersion', 'disque-flottant-de-tenser', 'dissimulation',
  'dissipation-de-la-magie', 'dissipation-du-mal-et-du-bien', 'divination',
  'doigt-de-mort', 'domination-de-bete', 'domination-de-monstre',
  'domination-de-personne', 'don-des-langues', 'double-illusoire', 'dragon-illusoire',
  'druidisme', 'duel-force', 'eclair', 'eclair-de-chaos', 'eclair-tracant',
  'eclat-du-soleil', 'embrasement', 'emprisonnement', 'enchevetrement', 'enervation',
  'ennemi-subconscient', 'ennemis-a-foison', 'entraves-de-givre', 'epee-de-mordenkainen',
  'epine-mentale', 'eruption-de-lames', 'eruption-de-terre', 'espieglerie-de-nathair',
  'esprit-faible', 'esprit-guerisseur', 'esprit-impenetrable', 'esprits-gardiens',
  'eveil', 'fabrication', 'faconnage-de-l-eau', 'faconnage-de-la-pierre',
  'faconnage-de-la-terre', 'faveur-divine', 'ferrage-foudroyant', 'festin-des-heros',
  'feuille-morte', 'flambee-d-aganazzar', 'flamme-eternelle', 'flamme-sacree',
  'flammes', 'fleau', 'fleau-d-insectes', 'fleau-elementaire', 'fleche-acide-de-melf',
  'fleche-de-foudre', 'fleches-enflammees', 'fletrissement',
  'fletrissure-epouvantable-d-abi-dalzim', 'flou', 'force-fantasmagorique',
  'forme-etheree', 'forme-gazeuse', 'formes-animales', 'forteresse-d-intellect',
  'forteresse-majestueuse', 'fou-rire-de-tasha', 'fouet-epineux',
  'fouet-mental-de-tasha', 'foulee-brumeuse', 'foulee-d-ashardalon',
  'foulee-dimensionnelle', 'foulee-tonitruante', 'fracassement', 'frappe-du-vent-d-acier',
  'frappe-du-zephyr', 'frappe-piegeuse', 'frayeur', 'fureur-de-la-nature',
  'fusion-dans-la-pierre', 'gardien-de-la-foi', 'gardien-de-la-nature', 'gelure',
  'glas', 'globe-d-invulnerabilite', 'glyphe-de-protection', 'gourdin-magique',
  'graisse', 'grande-foulee', 'grele-d-epines', 'guerison', 'guerison-de-groupe',
  'hate', 'heroisme', 'hurlement-psychique', 'identification', 'illusion-mineure',
  'illusion-programmee', 'image-majeure', 'image-miroir', 'image-silencieuse',
  'immobilisation-de-monstre', 'immobilisation-de-personne', 'immolation',
  'infestation', 'injonction', 'insecte-geant', 'interdiction',
  'inversion-de-la-gravite', 'invisibilite', 'invisibilite-superieure',
  'invocation-d-animaux', 'invocation-d-elementaire', 'invocation-d-elementaires-mineurs',
  'invocation-d-etres-sylvestres', 'invocation-d-ombres', 'invocation-de-celeste',
  'invocation-de-fee', 'invocation-de-projectiles', 'invocation-de-volee',
  'invulnerabilite', 'lame-aux-flammes-vertes', 'lame-d-ombres', 'lame-de-feu',
  'lame-du-desastre', 'lame-retentissante', 'lance-d-arcon-psychique-de-raulothim',
  'lenteur', 'levitation', 'liane-avide', 'libelle-aerien', 'liberte-de-mouvement',
  'lien-avec-une-bete', 'lien-de-protection', 'lien-telepathique-de-rary',
  'localisation-d-animaux-ou-de-plantes', 'localisation-d-objet',
  'localisation-de-creature', 'lueur-d-espoir', 'lueurs-feeriques', 'lumiere',
  'lumiere-du-jour', 'lumieres-dansantes', 'maelstrom', 'main-de-bigby',
  'main-de-mage', 'mains-brulantes', 'malediction', 'malefice',
  'manoir-somptueux-de-mordenkainen', 'marche-sur-l-eau', 'marche-sur-le-vent',
  'marque-du-chasseur', 'mauvais-oeil', 'message', 'messager-animal', 'metal-brulant',
  'metamorphose', 'metamorphose-de-groupe', 'metamorphose-supreme',
  'minuscules-meteores-de-melf', 'mirage', 'mixture-caustique-de-tasha',
  'modification-d-apparence', 'modification-de-memoire', 'monture-fantome',
  'moquerie-cruelle', 'mort-simulee', 'mot-de-guerison', 'mot-de-guerison-de-groupe',
  'mot-de-pouvoir-douloureux', 'mot-de-pouvoir-etourdissant', 'mot-de-pouvoir-guerisseur',
  'mot-de-pouvoir-mortel', 'mot-de-radiance', 'mot-de-retour', 'motif-hypnotique',
  'mur-d-eau', 'mur-d-epines', 'mur-de-feu', 'mur-de-force', 'mur-de-glace',
  'mur-de-lumiere', 'mur-de-pierre', 'mur-de-sable', 'mur-de-vent', 'mur-prismatique',
  'murmures-dissonants', 'mythes-et-legendes', 'nappe-de-brouillard',
  'nuage-incendiaire', 'nuage-nauseabond', 'nuee-de-boules-de-neige-de-snilloc',
  'nuee-de-dagues', 'nuee-de-meteores', 'oeil-magique', 'ombre-d-egarement',
  'orbe-chromatique', 'ossements-de-la-terre', 'parole-divine', 'passage-par-les-arbres',
  'passage-sans-trace', 'passe-muraille', 'pattes-d-araignee', 'peau-d-ecorce',
  'peau-de-pierre', 'perturbations-synaptiques', 'petite-hutte-de-leomund',
  'petrification', 'peur', 'pierre-magique', 'piqure-mentale', 'poigne-electrique',
  'poigne-terreuse-de-maximilien', 'portail', 'portail-magique', 'porte-dimensionnelle',
  'premonition', 'preservation-des-morts', 'prestidigitation', 'prevoyance',
  'priere-de-guerison', 'prison-mentale', 'projectile-elementaire', 'projectile-magique',
  'projection-astrale', 'projection-d-image', 'protection-contre-la-mort',
  'protection-contre-le-mal-et-le-bien', 'protection-contre-le-poison',
  'protection-contre-les-armes', 'protection-contre-une-energie', 'protection-primordiale',
  'protections-et-sceaux', 'purification-de-nourriture-et-d-eau', 'pyrotechnie', 'quete',
  'rappel-a-la-vie', 'rayon-affaiblissant', 'rayon-ardent', 'rayon-de-givre',
  'rayon-de-lune', 'rayon-de-soleil', 'rayon-empoisonne', 'rayonnement-ecoeurant',
  'rayons-prismatiques', 'raz-de-maree', 'regeneration', 'reincarnation', 'reparation',
  'repli-expeditif', 'represailles-infernales', 'resistance', 'respiration-aquatique',
  'restauration-partielle', 'restauration-superieure', 'resurrection',
  'resurrection-supreme', 'retour-a-la-vie', 'sacre-de-la-glace', 'sacre-de-la-pierre',
  'sacre-des-flammes', 'sacre-du-vent', 'sanctification', 'sanctuaire',
  'sanctuaire-prive-de-mordenkainen', 'saut', 'saute-de-vent', 'sauvagerie-primitive',
  'scelle-de-portail', 'scrutation', 'secousse-sismique', 'sens-animal',
  'sens-de-l-orientation', 'sens-de-la-distorsion', 'sens-des-pieges',
  'serviteur-invisible', 'serviteur-miniature', 'sieste', 'silence', 'simulacre',
  'simulacre-de-vie', 'soins', 'soins-de-groupe', 'sommeil', 'songe',
  'songe-du-voile-bleu', 'souffle-du-dragon', 'souhait', 'sphere-aqueuse',
  'sphere-de-feu', 'sphere-de-tempete', 'sphere-de-vitriol', 'sphere-glaciale-d-otiluke',
  'sphere-resiliente-d-otiluke', 'stabilisation', 'suggestion', 'suggestion-de-groupe',
  'symbole', 'telekinesie', 'telepathie', 'teleportation', 'tempete-de-feu',
  'tempete-de-grele', 'tempete-de-neige', 'tempete-vengeresse', 'temple-des-dieux',
  'tenebres', 'tenebres-oppressantes', 'tentacules-de-hadar',
  'tentacules-noirs-d-evard', 'terraformage', 'terrain-hallucinatoire',
  'texte-illusoire', 'thaumaturgie', 'toile-d-araignee', 'toucher-du-vampire',
  'tourbillon', 'tourbillon-de-poussiere', 'trait-de-feu', 'trait-ensorcele',
  'transfert-de-vie', 'transformation-de-tenser', 'transformation-draconique',
  'transmutation-de-la-pierre', 'tremblement-de-terre', 'tsunami', 'urne-magique',
  'vague-destructrice', 'vague-tonnante', 'vent-protecteur', 'vents-contraires',
  'verrou-magique', 'vision-dans-le-noir', 'vision-supreme', 'voie-vegetale',
  'voile-spirituel', 'voir-l-invisible', 'vol', 'voracite-de-hadar', 'zone-de-verite',
];

async function fetchSpellPair(vfSlug: string): Promise<{ nameFr: string; voSlug: string } | null> {
  const url = `https://www.aidedd.org/dnd/sorts.php?vf=${vfSlug}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'DnDInventoryApp/1.0 (spell translation script)' },
    });
    if (!res.ok) return null;
    const html = await res.text();

    // French name is in <h1> or <h2> at the top of the content
    // Try <h1> first, then <h2>
    let nameFr = '';
    const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/is);
    if (h1Match) {
      nameFr = h1Match[1].replace(/<[^>]*>/g, '').trim();
    }
    if (!nameFr) {
      const h2Match = html.match(/<h2[^>]*>(.*?)<\/h2>/is);
      if (h2Match) {
        nameFr = h2Match[1].replace(/<[^>]*>/g, '').trim();
      }
    }

    // If still no name, try deriving from the title tag: "Name » Sorts D&D 5"
    if (!nameFr) {
      const titleMatch = html.match(/<title>(.*?)<\/title>/is);
      if (titleMatch) {
        const title = titleMatch[1].trim();
        const parts = title.split(/[»|]/);
        if (parts.length >= 2) {
          nameFr = parts[0].trim();
        }
      }
    }

    // English slug is in a link: sorts.php?vo=english-slug
    const voMatch = html.match(/sorts\.php\?vo=([a-z0-9-]+)/i);
    const voSlug = voMatch ? voMatch[1] : '';

    if (nameFr && voSlug) {
      return { nameFr, voSlug };
    }
    return null;
  } catch {
    return null;
  }
}

// Convert French display name to a slug (for matching against AIDEDD_SLUGS if needed)
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function main() {
  console.log(`[translate-spells] loading ${SEED_PATH}`);
  const spells: SeedSpell[] = JSON.parse(readFileSync(SEED_PATH, 'utf8'));

  // Reset nameFr to null for re-translation (previous run had wrong values)
  for (const s of spells) s.nameFr = null;

  console.log(`[translate-spells] ${spells.length} spells, fetching ${AIDEDD_SLUGS.length} French pages from AideDD.org…`);

  // Build srdIndex → nameFr mapping by fetching each French page
  const nameFrByVoSlug: Record<string, string> = {};
  let fetched = 0;
  let matched = 0;

  for (const vfSlug of AIDEDD_SLUGS) {
    const result = await fetchSpellPair(vfSlug);
    fetched++;
    if (result) {
      nameFrByVoSlug[result.voSlug] = result.nameFr;
      matched++;
    } else {
      console.log(`  ✗ ${vfSlug}`);
    }
    if (fetched % 50 === 0) {
      console.log(`[translate-spells] progress: ${fetched}/${AIDEDD_SLUGS.length} fetched, ${matched} matched`);
    }
    // Throttle: 120ms between requests
    await new Promise((r) => setTimeout(r, 120));
  }

  console.log(`[translate-spells] fetched ${fetched}, matched ${matched} FR↔EN pairs`);

  // Match against seed spells by srdIndex (which is the English vo= slug)
  let updated = 0;
  for (const spell of spells) {
    const nameFr = nameFrByVoSlug[spell.srdIndex];
    if (nameFr) {
      spell.nameFr = nameFr;
      updated++;
    }
  }

  console.log(`[translate-spells] ${updated}/${spells.length} spells got French names`);

  writeFileSync(SEED_PATH, JSON.stringify(spells, null, 2), 'utf8');
  console.log(`[translate-spells] written to ${SEED_PATH}`);

  // Report unmatched
  const unmatched = spells.filter((s) => !s.nameFr);
  if (unmatched.length > 0) {
    console.log(`[translate-spells] unmatched (${unmatched.length}):`);
    unmatched.forEach((s) => console.log(`  - ${s.name} (${s.srdIndex})`));
  }
}

main().catch(console.error);
