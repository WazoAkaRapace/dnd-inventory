/**
 * Catalogue des capacités de classe (SRD 5.1) — français.
 *
 * Convention de nommage : noms selon AideDD.org (traduction officielle du PHB
 * 2014, pages /regles/classes/…) en priorité ; les noms peu connus portent
 * l'anglais entre parenthèses pour faciliter la recherche en table. Les rares
 * divergences 5e-drs/AideDD sont tranchées en faveur d'AideDD (ex. Fougue,
 * Inflexible, Conduit divin).
 *
 * Chaque capacité : niveau d'acquisition, description courte (≤ 2 phrases, variables
 * {{...}} supportées par renderFeatureTemplate) et ressource optionnelle (formule de
 * taille au niveau du perso + type de recharge). Les compteurs posés sur la fiche via
 * le catalogue servent au bouton Repos (court/long) et à la carte Ressources de Survie.
 *
 * `max` retourne null pour « pas de compteur » : capacité sans usage limité, ou
 * illimitée (Rage au niveau 20) — la description l'explique alors.
 */

// Types seulement (import effacé à l'exécution — pas de dépendance circulaire runtime).
import type { Character } from './index.ts';

/** Modificateurs courts (str/dex/con/int/wis/cha) passés aux formules de ressources. */
export type AbilityMods = Record<'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha', number>;

export type ResourceReset = 'short' | 'long';

export interface ClassFeatureResource {
  /** Taille maximale au niveau donné ; null = pas de compteur (illimité ou sans usage). */
  max: (level: number, mods: AbilityMods) => number | null;
  /** 'short' = repos court OU long ; 'long' = repos long uniquement. */
  reset: ResourceReset;
  /** La recharge passe à repos court à partir de ce niveau (ex. Inspiration bardique @5). */
  shortFromLevel?: number;
  /** Unité affichée (ex. pool de PV pour l'Imposition des mains). */
  unit?: 'PV';
}

export interface ClassFeatureDef {
  /** Identifiant stable du catalogue, stocké sur la ligne de trait (character_features.catalog_id). */
  id: string;
  /** Niveau d'acquisition. */
  level: number;
  name: string;
  description: string;
  resource?: ClassFeatureResource;
  /** Capacité déjà calculée/suivie nativement par la fiche (libellé « géré par la fiche »). */
  native?: boolean;
}

export interface SubclassDef {
  /** Clé stockée en base (colonne `subclass`, ou colonne dédiée existante pour Clerc/Druide/Paladin). */
  key: string;
  label: string;
  /** Niveau d'acquisition de la sous-classe (3 en général, 1 pour Ensorceleur/Occultiste, 2 Barde...). */
  level: number;
  /** Capacités notables de la sous-classe (liste courte, table-relevant). */
  features: ClassFeatureDef[];
}

/** Modificateur d'une caractéristique (identique à abilityModifier, copié local pour éviter un cycle). */
function mod(score: number): number {
  return Math.floor((score - 10) / 2);
}

const modsFrom = (c: Character): AbilityMods => ({
  str: mod(c.strength ?? 10),
  dex: mod(c.dexterity ?? 10),
  con: mod(c.constitution ?? 10),
  int: mod(c.intelligence ?? 10),
  wis: mod(c.wisdom ?? 10),
  cha: mod(c.charisma ?? 10),
});

/** Table de rage (PHB 2014) : 2@1, 3@3, 4@6, 5@12, 6@17, illimité@20. */
function rageUses(level: number): number | null {
  if (level >= 20) return null; // Champion primitif : rage illimitée
  if (level >= 17) return 6;
  if (level >= 12) return 5;
  if (level >= 6) return 4;
  if (level >= 3) return 3;
  return 2;
}

/** Conduit divin (Clerc/Paladin) : 1@2(3), 2@6, 3@18. */
function channelDivinityUses(level: number): number {
  if (level >= 18) return 3;
  if (level >= 6) return 2;
  return 1;
}

/** Dés d'inspiration bardique : d6, d8@5, d10@10, d12@15. */
export function bardicInspirationDie(level: number): string {
  if (level >= 15) return '1d12';
  if (level >= 10) return '1d10';
  if (level >= 5) return '1d8';
  return '1d6';
}

/** Dés du Chant reposant (Barde) : d6@2, d8@9, d10@13, d12@17. */
export function songOfRestDie(level: number): string {
  if (level >= 17) return '1d12';
  if (level >= 13) return '1d10';
  if (level >= 9) return '1d8';
  return '1d6';
}

/** Manifestations occultes connues (PHB 2014) : 2@2, 3@5, 4@7, 5@9, 6@12, 7@15, 8@18. */
export function eldritchInvocationsCount(level: number): number {
  if (level >= 18) return 8;
  if (level >= 15) return 7;
  if (level >= 12) return 6;
  if (level >= 9) return 5;
  if (level >= 7) return 4;
  if (level >= 5) return 3;
  return 2;
}

// ---------- Capacités de classe (base) ----------

export const CLASS_FEATURES: Record<string, ClassFeatureDef[]> = {
  Artificier: [
    {
      id: 'artificier-bricolage-magique',
      level: 1,
      name: 'Bricolage magique',
      description:
        'Avec des outils d’artisan en main, conférez une propriété magique (lumière, son, odeur, image) à un objet non magique de taille TP — max. {{int_mod}} (min 1) objets affectés à la fois.',
    },
    {
      id: 'artificier-objets-infuses',
      level: 2,
      name: 'Imprégnation d’objet',
      description:
        'Vous conférez des propriétés magiques durables à des objets. Objets imprégnés simultanément : 2 (3 au niv. 6, 4 au niv. 10, 5 au niv. 14, 6 au niv. 18) ; les imprégnations connues s’échangent à la prise de niveau.',
      resource: {
        max: (level) => (level >= 18 ? 6 : level >= 14 ? 5 : level >= 10 ? 4 : level >= 6 ? 3 : 2),
        reset: 'long',
      },
    },
    {
      id: 'artificier-bon-outil',
      level: 3,
      name: 'Outil de circonstance',
      description:
        'En 1 heure de travail (repos court ou long possible), vous créez un kit d’artisanat d’un type de votre choix.',
    },
    {
      id: 'artificier-expertise-outillage',
      level: 6,
      name: 'Expertise de l’outillage',
      description: 'Bonus de maîtrise doublé pour tout jet utilisant la maîtrise d’un outil.',
      native: true,
    },
    {
      id: 'artificier-genie-eclair',
      level: 7,
      name: 'Trait de génie',
      description:
        'En réaction, ajoutez votre modificateur d’INT ({{int_mod}}) à un test de caractéristique ou de sauvegarde d’une créature visible à 9 m ou moins.',
      resource: { max: (_level, m) => Math.max(1, m.int), reset: 'long' },
    },
    {
      id: 'artificier-adepte-objets-magiques',
      level: 10,
      name: 'Adepte des objets magiques',
      description:
        'Vous pouvez vous lier à 4 objets magiques à la fois ; fabrication d’objets communs ou peu communs en un quart du temps pour la moitié du coût.',
    },
    {
      id: 'artificier-objet-receptacle',
      level: 11,
      name: 'Objet de stockage de sort',
      description:
        'Vous stockez un sort de niv. 1 ou 2 (DD {{save_dc}}) dans une arme ou un focaliseur ; toute créature le tenant peut le lancer — 2 × {{int_mod}} (min 2) utilisations, re-stockable après un repos long.',
    },
    {
      id: 'artificier-erudit-objets-magiques',
      level: 14,
      name: 'Érudit des objets magiques',
      description:
        'Vous ignorez toute exigence de classe, race, sort ou niveau pour utiliser ou se lier à un objet magique (5 liaisons à la fois).',
    },
    {
      id: 'artificier-maitre-objets-magiques',
      level: 18,
      name: 'Maître des objets magiques',
      description: 'Vous pouvez vous lier à 6 objets magiques à la fois.',
    },
    {
      id: 'artificier-ame-artifice',
      level: 20,
      name: 'Âme de l’artifice',
      description:
        '+1 aux jets de sauvegarde par objet magique lié ; en réaction, terminez une imprégnation pour rester à 1 PV au lieu de tomber à 0.',
    },
  ],
  Barbare: [
    {
      id: 'barbare-rage',
      level: 1,
      name: 'Rage',
      description:
        'En bonus action : avantage aux tests et sauvegardes de FOR, +2 aux dégâts (+3 au niv. 9, +4 au niv. 16), résistance aux dégâts contondants/perforants/tranchants. Durée : 1 minute. Utilisations : 2 (3 au niv. 3, 4 au niv. 6, 5 au niv. 12, 6 au niv. 17, illimité au niv. 20) — repos long.',
      resource: { max: (level) => rageUses(level), reset: 'long' },
    },
    {
      id: 'barbare-defense-sans-armure',
      level: 1,
      name: 'Défense sans armure',
      description: 'Sans armure : CA = 10 + DEX + CON (le bouclier reste autorisé).',
      native: true,
    },
    {
      id: 'barbare-attaque-imprudente',
      level: 2,
      name: 'Attaque téméraire',
      description:
        'Vous vous imposez l’avantage de vos attaques de corps à corps de FOR ; en échange, les attaques contre vous ont l’avantage jusqu’à votre prochain tour.',
    },
    {
      id: 'barbare-sens-du-danger',
      level: 2,
      name: 'Sens du danger',
      description: 'Avantage aux sauvegardes de DEX contre les effets visibles ({{save:dex}}).',
    },
    {
      id: 'barbare-attaque-supplementaire',
      level: 5,
      name: 'Attaque supplémentaire',
      description: 'Vous attaquez deux fois par action d’attaque.',
      native: true,
    },
    {
      id: 'barbare-deplacement-rapide',
      level: 5,
      name: 'Déplacement rapide',
      description: '+3 m de vitesse, sauf en armure lourde.',
      native: true,
    },
    {
      id: 'barbare-instinct-feroce',
      level: 7,
      name: 'Instinct sauvage',
      description:
        'Vous agissez en surprise si votre tour arrive avant que vous n’ayez agi ; avantage à l’initiative.',
    },
    {
      id: 'barbare-critical-brutal',
      level: 9,
      name: 'Critique brutal',
      description:
        'Sur un critique de corps à corps, +1 dé de dégâts (2 dés au niv. 13, 3 dés au niv. 17).',
    },
    {
      id: 'barbare-rage-implacable',
      level: 11,
      name: 'Rage implacable',
      description:
        'À 0 PV sans être tué, sauvegarde de CON DD 10 ({{save:con}}) pour rester à 1 PV (+5 au DD par réussite successive, DD réinitialisé après un repos court ou long).',
    },
    {
      id: 'barbare-persistance-rage',
      level: 15,
      name: 'Rage persistante',
      description:
        'Votre rage ne se termine plus prématurément (inconscience ou tour sans attaque).',
    },
    {
      id: 'barbare-puissance-indomptable',
      level: 18,
      name: 'Puissance indomptable',
      description:
        'Si un jet de Force est inférieur à votre valeur de Force, utilisez votre valeur à la place.',
    },
    {
      id: 'barbare-champion-primordial',
      level: 20,
      name: 'Champion primitif',
      description: 'FOR et CON +4 (max 24) ; rage illimitée.',
    },
  ],
  Barde: [
    {
      id: 'barde-inspiration-bardique',
      level: 1,
      name: 'Inspiration bardique',
      description:
        'En bonus action, une créature de votre choix ajoute un dé d’inspiration ({{bardic_die}}) à un test, une attaque ou une sauvegarde dans les 10 min. Utilisations : votre mod. de CHA ({{cha_mod}}, min 1) — repos long (repos court dès le niv. 5). Le dé passe à d8 au niv. 5, d10 au niv. 10, d12 au niv. 15.',
      resource: {
        max: (_level, m) => Math.max(1, m.cha),
        reset: 'long',
        shortFromLevel: 5,
      },
    },
    {
      id: 'barde-don-des-multiples',
      level: 2,
      name: 'Touche-à-tout',
      description:
        'Ajoutez la moitié de votre bonus de maîtrise ({{prof}} ÷ 2) aux tests de caractéristiques n’utilisant pas déjà votre maîtrise.',
    },
    {
      id: 'barde-chant-de-repos',
      level: 2,
      name: 'Chant reposant',
      description:
        'À la fin d’un repos court ou long, les créatures convalescentes récupèrent +{{song_die}} PV par dé de vie dépensé.',
    },
    {
      id: 'barde-expertise',
      level: 3,
      name: 'Expertise',
      description:
        'Deux maîtrises doublent leur bonus (+2 au niv. 6) — géré par l’onglet Compétences.',
      native: true,
    },
    {
      id: 'barde-source-inspiration',
      level: 5,
      name: 'Source d’inspiration',
      description: 'Vous récupérez toute votre Inspiration bardique après un repos court ou long.',
    },
    {
      id: 'barde-contre-charme',
      level: 6,
      name: 'Contre-charme',
      description:
        'En action, vous et les créatures à 9 m avez avantage contre être charmé ou effrayé jusqu’à la fin de votre prochain tour.',
    },
    {
      id: 'barde-secrets-magiques',
      level: 10,
      name: 'Secrets magiques',
      description:
        'Apprenez 2 sorts de n’importe quelle classe (+2 au niv. 14, +2 au niv. 18) — ils comptent comme sorts de barde.',
    },
    {
      id: 'barde-inspiration-superieure',
      level: 20,
      name: 'Inspiration supérieure',
      description:
        'Vous récupérez 1 utilisation d’Inspiration bardique quand vous roulez l’initiative si vous n’en avez plus.',
    },
  ],
  Clerc: [
    {
      id: 'clerc-canalisation-divine',
      level: 2,
      name: 'Conduit divin',
      description:
        'Vous canalisez l’énergie divine (options du domaine, ex. Renvoi des morts-vivants). Utilisations : 1 (2 au niv. 6, 3 au niv. 18) — repos court ou long.',
      resource: { max: (level) => channelDivinityUses(level), reset: 'short' },
    },
    {
      id: 'clerc-destruction-morts-vivants',
      level: 5,
      name: 'Destruction des morts-vivants',
      description:
        'Un mort-vivant de FP ≤ ½ raté par Renvoi des morts-vivants est détruit (FP 1 au niv. 8, 2 au niv. 11, 3 au niv. 14, 4 au niv. 17).',
    },
    {
      id: 'clerc-intervention-divine',
      level: 10,
      name: 'Intervention divine',
      description:
        'Vous implorez votre divinité (réussite sur d100 ≤ {{level}}) — réutilisable après 7 jours (repos long en cas d’échec). Compteur approximé à 1/repos long.',
      resource: { max: () => 1, reset: 'long' },
    },
    {
      id: 'clerc-intervention-divine-superieure',
      level: 20,
      name: 'Intervention divine supérieure',
      description:
        'Votre appel à la divinité réussit automatiquement — réutilisable après 7 jours (après un échec : repos long).',
    },
  ],
  Druide: [
    {
      id: 'druide-druidique',
      level: 1,
      name: 'Druidique',
      description:
        'Vous connaissez le druidique, langue secrète des druides, et pouvez laisser des messages cachés — langue gérée dans l’onglet Compétences.',
      native: true,
    },
    {
      id: 'druide-forme-sauvage',
      level: 2,
      name: 'Forme sauvage',
      description:
        '2 utilisations par repos court (suivi natif dans l’onglet Survie : CR, vol/nage, formes vues, PV de la forme).',
      native: true,
    },
    {
      id: 'druide-corps-immortel',
      level: 18,
      name: 'Jeunesse éternelle',
      description: 'Vous vieillissez 1 an pour 10 ans ; immunisé aux effets de vieillissement.',
    },
    {
      id: 'druide-forme-animale',
      level: 18,
      name: 'Incantation animale',
      description:
        'Vous pouvez lancer des sorts en forme sauvage (sauf ceux avec des composantes matérielles).',
    },
    {
      id: 'druide-archidruide',
      level: 20,
      name: 'Archidruide',
      description:
        'Forme sauvage illimitée ; ignorez les composantes verbales, somatiques et matérielles sans coût.',
      native: true,
    },
  ],
  Ensorceleur: [
    {
      id: 'ensorceleur-source-de-magie',
      level: 2,
      name: 'Source de magie',
      description:
        'Points de sorcellerie = votre niveau, repos long. Dépensez-les pour créer des emplacements de sort (2 pts/niv., max niv. 5) ou reconvertir vos emplacements en points.',
      resource: { max: (level) => level, reset: 'long' },
    },
    {
      id: 'ensorceleur-metamagie',
      level: 3,
      name: 'Métamagie',
      description:
        '2 options (Jumelage, Accélération, Subtile…) pour modifier vos sorts en les lançant (+2 options : niv. 10 et 17) — coût en points de sorcellerie.',
    },
    {
      id: 'ensorceleur-restauration-sorciere',
      level: 20,
      name: 'Restauration sorcière',
      description: 'Vous récupérez 4 points de sorcellerie dépensés après un repos court.',
    },
  ],
  Guerrier: [
    {
      id: 'guerrier-style-de-combat',
      level: 1,
      name: 'Style de combat',
      description:
        'Choisissez un style (Archérie, Défense, Duel…) — sélectionnable dans l’onglet Caractéristiques.',
      native: true,
    },
    {
      id: 'guerrier-second-souffle',
      level: 1,
      name: 'Second souffle',
      description:
        'En bonus action, récupérez 1d10 + {{level}} PV — 1 utilisation par repos court ou long.',
      resource: { max: () => 1, reset: 'short' },
    },
    {
      id: 'guerrier-sursaut-activite',
      level: 2,
      name: 'Fougue',
      description:
        'Une fois par repos court ou long, gagnez une action supplémentaire à votre tour (2 util. au niv. 17, 1×/tour).',
      resource: { max: (level) => (level >= 17 ? 2 : 1), reset: 'short' },
    },
    {
      id: 'guerrier-archetype-martial',
      level: 3,
      name: 'Archétype martial',
      description:
        'Choisissez votre archétype (ex. Champion) — sélectionnable dans l’onglet Caractéristiques.',
      native: true,
    },
    {
      id: 'guerrier-attaque-supplementaire',
      level: 5,
      name: 'Attaque supplémentaire',
      description: '2 attaques au niv. 5, 3 au niv. 11, 4 au niv. 20 par action d’attaque.',
      native: true,
    },
    {
      id: 'guerrier-indomptable',
      level: 9,
      name: 'Inflexible',
      description:
        'Relancez une sauvegarde ratée (1 util. au niv. 9, 2 au niv. 13, 3 au niv. 17) — repos long.',
      resource: { max: (level) => (level >= 17 ? 3 : level >= 13 ? 2 : 1), reset: 'long' },
    },
  ],
  Magicien: [
    {
      id: 'magicien-recuperation-arcanique',
      level: 1,
      name: 'Restauration arcanique',
      description:
        'Une fois par jour, après un repos court, récupérez des emplacements de sorts d’un niveau total ≤ la moitié de votre niveau (arrondi supérieur, max niv. 5).',
      resource: { max: () => 1, reset: 'long' },
    },
    {
      id: 'magicien-ecole-de-magie',
      level: 2,
      name: 'Tradition arcanique',
      description:
        'Choisissez une école de spécialisation — sélectionnable dans l’onglet Caractéristiques.',
      native: true,
    },
    {
      id: 'magicien-maitrise-de-la-magie',
      level: 18,
      name: 'Maîtrise des sorts',
      description:
        'Choisissez un sort de niv. 1 et un de niv. 2 : lancez-les à volonté au niveau minimum, sans emplacement.',
    },
    {
      id: 'magicien-sorts-signature',
      level: 20,
      name: 'Sorts de prédilection',
      description:
        'Choisissez 2 sorts de niv. 3 : lancez chacun 1× gratuitement par repos court (emplacements pour les niveaux supérieurs).',
    },
  ],
  Moine: [
    {
      id: 'moine-arts-martiaux',
      level: 1,
      name: 'Arts martiaux',
      description:
        'Dés de dégâts d4 → d10 (niv. 17) pour armes de moine et attaques sans arme ; DEX utilisable si meilleur ; attaque sans arme en bonus action.',
      native: true,
    },
    {
      id: 'moine-defense-sans-armure',
      level: 1,
      name: 'Défense sans armure',
      description: 'Sans armure ni bouclier : CA = 10 + DEX + SAG.',
      native: true,
    },
    {
      id: 'moine-ki',
      level: 2,
      name: 'Ki',
      description:
        'Points de ki = votre niveau, récupérés après un repos court ou long (méditation ≥ 30 min). Dépenses : Déluge de coups (2 frappes sans arme en bonus action), Défense patiente (esquive en bonus action), Déplacement aérien (désengagement ou course + saut doublé en bonus action) — 1 ki chacune.',
      resource: { max: (level) => level, reset: 'short' },
    },
    {
      id: 'moine-deplacement-sans-armure',
      level: 2,
      name: 'Déplacement sans armure',
      description:
        '+3 m de vitesse sans armure ni bouclier (+4,5 au niv. 6, +6 au niv. 10, +7,5 au niv. 14, +9 au niv. 18).',
      native: true,
    },
    {
      id: 'moine-deviation-projectiles',
      level: 3,
      name: 'Parade de projectiles',
      description:
        'Réaction contre une attaque à distance : dégâts réduits de 1d10 + {{level}} + {{dex_mod}}, et vous pouvez renvoyer le projectile (DD {{save_dc}}).',
    },
    {
      id: 'moine-chute-lente',
      level: 4,
      name: 'Chute ralentie',
      description: 'En réaction, réduisez les dégâts de chute de 5 × votre niveau de moine.',
    },
    {
      id: 'moine-attaque-supplementaire',
      level: 5,
      name: 'Attaque supplémentaire',
      description: 'Vous attaquez deux fois par action d’attaque.',
      native: true,
    },
    {
      id: 'moine-frappe-etourdissante',
      level: 5,
      name: 'Frappe étourdissante',
      description:
        'Quand vous touchez une créature avec une attaque de moine, dépensez 1 ki : sauvegarde de CON DD {{save_dc}} ou elle est étourdie jusqu’à la fin de votre prochain tour (1× par tour).',
    },
    {
      id: 'moine-frappes-de-ki',
      level: 6,
      name: 'Frappes de ki',
      description: 'Vos attaques sans arme comptent comme magiques.',
    },
    {
      id: 'moine-evasion',
      level: 7,
      name: 'Esquive totale',
      description:
        'Dégâts nuls en cas de réussite (et demi en cas d’échec) aux sauvegardes de DEX contre les zones d’effet ({{save:dex}}).',
    },
    {
      id: 'moine-serenite',
      level: 7,
      name: 'Sérénité',
      description: 'En action, mettez fin à un effet qui vous charme ou vous effraie.',
    },
    {
      id: 'moine-corps-pur',
      level: 10,
      name: 'Pureté physique',
      description: 'Immunité aux maladies et à l’empoisonnement.',
    },
    {
      id: 'moine-langue-soleil-lune',
      level: 13,
      name: 'Langue du soleil et de la lune',
      description: 'Vous comprenez toutes les langues parlées ; toute créature vous comprend.',
    },
    {
      id: 'moine-ame-de-diamant',
      level: 14,
      name: 'Âme de diamant',
      description:
        'Maîtrise de toutes les sauvegardes ; dépensez 1 ki pour relancer une sauvegarde ratée.',
    },
    {
      id: 'moine-jeunesse-eternelle',
      level: 15,
      name: 'Jeunesse éternelle',
      description:
        'Vous ne subissez plus les affres de la vieillesse et n’avez plus besoin de manger ni boire.',
    },
    {
      id: 'moine-desertion-ame',
      level: 18,
      name: 'Désertion de l’âme',
      description:
        '4 ki : invisible 1 min + résistance à tous les dégâts sauf de force ; 8 ki : Projection astrale sur vous seul.',
    },
    {
      id: 'moine-perfection-de-soi',
      level: 20,
      name: 'Perfection de l’être',
      description: 'À l’initiative, récupérez 4 points de ki si vous n’en avez plus.',
    },
  ],
  Occultiste: [
    {
      id: 'occultiste-invocations',
      level: 2,
      name: 'Manifestations occultes',
      description:
        'Des connaissances interdites (ex. Déchaînement occulte). Vous en connaissez {{invocations}} — échangeables en gagnant un niveau.',
    },
    {
      id: 'occultiste-faveur-de-pacte',
      level: 3,
      name: 'Faveur de pacte',
      description:
        'Pacte de la chaîne (familier amélioré), de la lame (arme de pacte) ou du grimoire (3 tours de magie de n’importe quelle liste).',
    },
    {
      id: 'occultiste-arcanum-6',
      level: 11,
      name: 'Arcanum mystique (sort de niv. 6)',
      description:
        'Apprenez 1 sort de niveau 6, lançable gratuitement 1× par repos long (sans emplacement — DD {{save_dc}}).',
      resource: { max: () => 1, reset: 'long' },
    },
    {
      id: 'occultiste-arcanum-7',
      level: 13,
      name: 'Arcanum mystique (sort de niv. 7)',
      description: 'Apprenez 1 sort de niveau 7, lançable gratuitement 1× par repos long.',
      resource: { max: () => 1, reset: 'long' },
    },
    {
      id: 'occultiste-arcanum-8',
      level: 15,
      name: 'Arcanum mystique (sort de niv. 8)',
      description: 'Apprenez 1 sort de niveau 8, lançable gratuitement 1× par repos long.',
      resource: { max: () => 1, reset: 'long' },
    },
    {
      id: 'occultiste-arcanum-9',
      level: 17,
      name: 'Arcanum mystique (sort de niv. 9)',
      description: 'Apprenez 1 sort de niveau 9, lançable gratuitement 1× par repos long.',
      resource: { max: () => 1, reset: 'long' },
    },
    {
      id: 'occultiste-maitre-occulte',
      level: 20,
      name: 'Maître de l’occulte',
      description:
        'Une fois par repos long, en action, récupérez tous vos emplacements de pacte comme après un repos court.',
      resource: { max: () => 1, reset: 'long' },
    },
  ],
  Paladin: [
    {
      id: 'paladin-sens-divins',
      level: 1,
      name: 'Sens divin',
      description:
        'En action, détectez célestes, fiélons et morts-vivants à 18 m. Utilisations : 1 + {{cha_mod}} (min 1) — repos long.',
      resource: { max: (_level, m) => Math.max(1, 1 + m.cha), reset: 'long' },
    },
    {
      id: 'paladin-imposition-des-mains',
      level: 1,
      name: 'Imposition des mains',
      description:
        'Réserve de PV = 5 × votre niveau ({{lay_on_hands}} PV), repos long. En action : soigner, ou dépenser 5 PV pour neutraliser un poison ou une maladie.',
      resource: { max: (level) => 5 * level, reset: 'long', unit: 'PV' },
    },
    {
      id: 'paladin-chatiment-divin',
      level: 2,
      name: 'Châtiment divin',
      description:
        'Quand vous touchez au corps à corps avec une arme, dépensez un emplacement de sort : +2d8 dégâts radiants (+1d8 par niveau au-delà de 1, max 5d8 — 6d8 contre morts-vivants et fiélons). Accès rapide sur les cartes d’attaque.',
    },
    {
      id: 'paladin-canalisation-divine',
      level: 3,
      name: 'Conduit divin',
      description:
        'Options du serment sacré. Utilisations : 1 (2 au niv. 6, 3 au niv. 18) — repos court ou long.',
      resource: { max: (level) => channelDivinityUses(level), reset: 'short' },
    },
    {
      id: 'paladin-sante-divine',
      level: 3,
      name: 'Santé divine',
      description: 'Vous êtes immunisé contre les maladies.',
    },
    {
      id: 'paladin-attaque-supplementaire',
      level: 5,
      name: 'Attaque supplémentaire',
      description: 'Vous attaquez deux fois par action d’attaque.',
      native: true,
    },
    {
      id: 'paladin-aura-de-protection',
      level: 6,
      name: 'Aura de protection',
      description:
        'Vous et les créatures alliées à 3 m (9 m au niv. 18) ajoutez {{cha_mod}} (min +1) à toutes vos sauvegardes — affiché sur vos sauvegardes.',
      native: true,
    },
    {
      id: 'paladin-aura-de-courage',
      level: 10,
      name: 'Aura de courage',
      description: 'Vous et les alliés à 3 m (9 m au niv. 18) ne pouvez pas être effrayés.',
    },
    {
      id: 'paladin-chatiment-divin-ameliore',
      level: 11,
      name: 'Châtiment divin amélioré',
      description: 'Toutes vos attaques d’arme de mêlée infligent +1d8 dégâts radiants.',
    },
    {
      id: 'paladin-toucher-purificateur',
      level: 14,
      name: 'Contact purifiant',
      description:
        'En action, mettez fin à un sort actif sur vous ou une créature consentante à 3 m. Utilisations = {{cha_mod}} (min 1) — repos long.',
      resource: { max: (_level, m) => Math.max(1, m.cha), reset: 'long' },
    },
    {
      id: 'paladin-amelioration-auras',
      level: 18,
      name: 'Amélioration d’auras',
      description: 'Le rayon de vos auras passe de 3 m à 9 m.',
      native: true,
    },
  ],
  Rôdeur: [
    {
      id: 'rodeur-ennemi-favori',
      level: 1,
      name: 'Ennemi juré',
      description:
        '1 type de créature (+1 au niv. 6, +1 au niv. 14) : avantage pour retrouver ses traces et se souvenir d’informations ; vous apprenez une langue associée.',
    },
    {
      id: 'rodeur-explorateur-naturel',
      level: 1,
      name: 'Explorateur-né',
      description:
        '1 terrain favori (+1 au niv. 6, +1 au niv. 10) : intelligence associée, déplacement et suivi facilités, mémoire précise de la carte.',
    },
    {
      id: 'rodeur-conscience-primordiale',
      level: 3,
      name: 'Vigilance primitive',
      description:
        'En action + 1 emplacement de sort (1 min/niveau) : détectez la présence (pas le nombre) des aberrations, célestes, dragons, élémentaires, fées, fiélons et morts-vivants à 1,5 km (9 km en terrain favori).',
    },
    {
      id: 'rodeur-attaque-supplementaire',
      level: 5,
      name: 'Attaque supplémentaire',
      description: 'Vous attaquez deux fois par action d’attaque.',
      native: true,
    },
    {
      id: 'rodeur-foulee-de-la-terre',
      level: 8,
      name: 'Foulée tellurique',
      description:
        'Terrain difficile magique ou non ne vous coûte pas de déplacement supplémentaire ; les plantes magiques ne vous gênent pas.',
    },
    {
      id: 'rodeur-dissimulation-naturelle',
      level: 10,
      name: 'Camouflage naturel',
      description:
        '1 minute de préparation : camouflage +10 aux tests de Discrétion ({{skill:stealth}}) tant que vous ne bougez pas.',
    },
    {
      id: 'rodeur-disparition',
      level: 14,
      name: 'Disparition',
      description:
        'Se cacher en action bonus ; impossible d’être pisté par des moyens non magiques.',
    },
    {
      id: 'rodeur-sens-feroce',
      level: 18,
      name: 'Sens sauvages',
      description:
        'Pas de désavantage d’attaque contre des créatures que vous ne voyez pas ; position connue des invisibles à 9 m (sauf si cachées de vous).',
    },
    {
      id: 'rodeur-fleau-des-ennemis',
      level: 20,
      name: 'Tueur implacable',
      description:
        'Une fois par tour, ajoutez {{wis_mod}} à un jet d’attaque ou de dégâts contre une créature que vous pouvez voir.',
    },
  ],
  Roublard: [
    {
      id: 'roublard-expertise',
      level: 1,
      name: 'Expertise',
      description:
        'Deux maîtrises doublent leur bonus (+2 au niv. 6) — géré par l’onglet Compétences.',
      native: true,
    },
    {
      id: 'roublard-attaque-sournoise',
      level: 1,
      name: 'Attaque sournoise',
      description:
        'Une fois par tour, +1d6 dégâts ({{sneak_dice}}) avec une arme de finesse ou à distance, si avantage ou un ennemi de la cible est adjacent — affiché sur les cartes d’attaque.',
      native: true,
    },
    {
      id: 'roublard-argot-des-voleurs',
      level: 1,
      name: 'Jargon des voleurs',
      description:
        'Vous comprenez le code secret des voleurs — langue gérée dans l’onglet Compétences.',
      native: true,
    },
    {
      id: 'roublard-action-rusee',
      level: 2,
      name: 'Ruse',
      description:
        'En bonus action : se désengager, se précipiter ou se cacher (Discrétion {{skill:stealth}}).',
    },
    {
      id: 'roublard-archetype',
      level: 3,
      name: 'Archétype de roublard',
      description:
        'Choisissez votre archétype (Voleur, Assassin, Escroc arcanique) — sélectionnable dans l’onglet Caractéristiques.',
      native: true,
    },
    {
      id: 'roublard-esquive-extraordinaire',
      level: 5,
      name: 'Esquive instinctive',
      description: 'En réaction contre un attaquant visible : dégâts d’attaque réduits de moitié.',
    },
    {
      id: 'roublard-evasion',
      level: 7,
      name: 'Esquive totale',
      description:
        'Dégâts nuls en cas de réussite (et demi en cas d’échec) aux sauvegardes de DEX contre les zones d’effet ({{save:dex}}).',
    },
    {
      id: 'roublard-talent-fiable',
      level: 11,
      name: 'Savoir-faire',
      description: 'Les d20 ≤ 10 comptent comme 10 pour vos tests avec maîtrise.',
    },
    {
      id: 'roublard-perception-aveugle',
      level: 14,
      name: 'Perception aveugle',
      description:
        'Si vous entendez, vous connaissez l’emplacement des créatures cachées ou invisibles à 3 m ou moins.',
    },
    {
      id: 'roublard-esprit-glissant',
      level: 15,
      name: 'Esprit fuyant',
      description: 'Maîtrise des sauvegardes de Sagesse — à cocher dans l’onglet Compétences.',
    },
    {
      id: 'roublard-insaisissable',
      level: 18,
      name: 'Insaisissable',
      description: 'Aucun jet d’attaque n’a l’avantage contre vous tant que vous pouvez agir.',
    },
    {
      id: 'roublard-coup-de-chance',
      level: 20,
      name: 'Coup de chance',
      description:
        'Transformez un échec d’attaque en réussite, ou traitez un d20 de test de caractéristique comme un 20 (1 utilisation par repos court ou long).',
      resource: { max: () => 1, reset: 'short' },
    },
  ],
};

// ---------- Sous-classes (SRD 5.1) ----------
// Clerc (divineDomain), Druide (druidCircle/landCircle) et Paladin (sacredOath) utilisent
// leurs colonnes dédiées existantes ; les autres classes partagent la colonne `subclass`.

export const CLASS_SUBCLASSES: Record<string, SubclassDef[]> = {
  Barbare: [
    {
      key: 'berserker',
      label: 'Berserker (Voie du berserker)',
      level: 3,
      features: [
        {
          id: 'berserker-frenesie',
          level: 3,
          name: 'Frénésie',
          description:
            'Pendant la rage : attaque de mêlée en bonus action à chacun de vos tours ; 1 niveau d’épuisement quand la rage se termine.',
        },
        {
          id: 'berserker-rage-aveugle',
          level: 6,
          name: 'Rage aveugle',
          description: 'Vous ne pouvez pas être charmé ni effrayé pendant la rage.',
        },
        {
          id: 'berserker-intimidation',
          level: 10,
          name: 'Présence intimidante',
          description:
            'En action pendant la rage : chaque créature à 3 m choisie est effrayée (sauvegarde de Sagesse, DD {{save_dc}}).',
        },
        {
          id: 'berserker-represailles',
          level: 14,
          name: 'Représailles',
          description:
            'Quand vous subissez des dégâts d’une créature à 1,50 m, réaction : attaque de mêlée contre elle.',
        },
      ],
    },
    {
      key: 'totem',
      label: 'Guerrier totémique',
      level: 3,
      features: [
        {
          id: 'totem-queteur-spirituel',
          level: 3,
          name: 'Quêteur spirituel',
          description:
            'Vous pouvez lancer Communication avec les animaux et Sens animal en rituels, sans les préparer.',
        },
        {
          id: 'totem-esprit',
          level: 3,
          name: 'Esprit totem',
          description:
            'Pendant la rage, l’esprit choisi aide : Ours (résistance à tous les dégâts sauf psychiques), Aigle (désengagement en bonus action) ou Loup (vos alliés ont l’avantage de mêlée contre les ennemis proches de vous).',
        },
        {
          id: 'totem-aspect-de-la-bete',
          level: 6,
          name: 'Aspect de la bête',
          description: 'Un sens ou un talent de votre totem (vue, odorat, vitesse de nage…).',
        },
        {
          id: 'totem-marcheur-spirituel',
          level: 10,
          name: 'Marcheur spirituel',
          description:
            'Vous pouvez lancer Communion avec la nature en rituel, sans l’avoir préparé.',
        },
        {
          id: 'totem-harmonisation',
          level: 14,
          name: 'Lien totémique',
          description:
            'Un pouvoir majeur de votre totem (ex. Ours : un ennemi qui vous touche subit votre riposte).',
        },
      ],
    },
  ],
  Barde: [
    {
      key: 'savoir',
      label: 'Collège du Savoir',
      level: 3,
      features: [
        {
          id: 'savoir-maitrises-supplementaires',
          level: 3,
          name: 'Maîtrises supplémentaires',
          description: '3 compétences supplémentaires + 2 outils ou langues (onglet Compétences).',
        },
        {
          id: 'savoir-mots-cinglants',
          level: 3,
          name: 'Mots cinglants',
          description:
            'En réaction, dépensez une Inspiration bardique pour soustraire le dé ({{bardic_die}}) à un jet ennemi visible à 18 m.',
        },
        {
          id: 'savoir-secrets-magiques',
          level: 6,
          name: 'Secrets magiques supplémentaires',
          description:
            '2 sorts de n’importe quelle classe dès le niveau 6 (hors quota de sorts connus).',
        },
        {
          id: 'savoir-competence-hors-pair',
          level: 14,
          name: 'Compétence hors-pair',
          description:
            'Dépensez une Inspiration bardique pour ajouter le dé ({{bardic_die}}) à vos propres tests de caractéristique.',
        },
      ],
    },
  ],
  Druide: [
    // Cercles natifs (druidCircle) — capacités notables pour le catalogue.
    {
      key: 'terre',
      label: 'Cercle de la Terre',
      level: 2,
      features: [
        {
          id: 'terre-sort-mineur-supplementaire',
          level: 2,
          name: 'Sort mineur supplémentaire',
          description: 'Apprenez un tour de magie de druide bonus, hors quota.',
        },
        {
          id: 'terre-recuperation-naturelle',
          level: 2,
          name: 'Récupération naturelle',
          description:
            'Après un repos court, récupérez des emplacements de sorts d’un niveau total ≤ {{level}} ÷ 2 (arrondi sup., max niv. 5) — 1× par repos long.',
          resource: { max: () => 1, reset: 'long' },
        },
        {
          id: 'terre-foulee-tellurique',
          level: 6,
          name: 'Foulée tellurique',
          description: 'Terrain difficile magique ou non sans surcoût de déplacement.',
        },
        {
          id: 'terre-protege-dame-nature',
          level: 10,
          name: 'Protégé de dame Nature',
          description:
            'Immunisé contre poison et maladies ; ne peut être charmé ni effrayé par les élémentaires et les fées.',
        },
        {
          id: 'terre-sanctuaire-nature',
          level: 14,
          name: 'Sanctuaire de dame Nature',
          description:
            'Les bêtes et plantes doivent réussir un JS ({{save_dc}}) pour vous attaquer.',
        },
      ],
    },
    {
      key: 'lune',
      label: 'Cercle de la Lune',
      level: 2,
      features: [
        {
          id: 'lune-forme-sauvage-combative',
          level: 2,
          name: 'Forme sauvage de combat',
          description:
            'Forme sauvage en bonus action ; en forme, une action (bonus action au niv. 6) pour dépenser un emplacement et vous soigner de 1d8 par niveau d’emplacement.',
        },
        {
          id: 'lune-formes-du-cercle',
          level: 2,
          name: 'Formes du cercle',
          description:
            'CR de forme sauvage = FP 1 au niv. 2, puis niveau de druide ÷ 3 (arrondi inférieur, min 1) dès le niv. 6 — calculé nativement.',
          native: true,
        },
        {
          id: 'lune-frappe-primordiale',
          level: 6,
          name: 'Frappe primitive',
          description: 'Vos attaques en forme sauvage comptent comme magiques.',
        },
        {
          id: 'lune-forme-elementaire',
          level: 10,
          name: 'Forme sauvage élémentaire',
          description:
            'Dépensez 2 utilisations pour devenir un élémentaire — intégré au sélecteur de formes.',
          native: true,
        },
        {
          id: 'lune-mille-formes',
          level: 14,
          name: 'Mille formes',
          description: 'Vous pouvez lancer Modification d’apparence à volonté, sur vous-même.',
        },
      ],
    },
  ],
  Ensorceleur: [
    {
      key: 'draconique',
      label: 'Lignée draconique',
      level: 1,
      features: [
        {
          id: 'draconique-ancetre-draconique',
          level: 1,
          name: 'Ancêtre draconique',
          description:
            'Choisissez votre type de dragon (dégâts des capacités ultérieures) ; vous parlez le draconique et doublez votre maîtrise de CHA face aux dragons.',
        },
        {
          id: 'draconique-resilience',
          level: 1,
          name: 'Résistance draconique',
          description:
            'Sans armure : CA = 13 + DEX (bouclier autorisé) — calculée nativement. PV max +1 par niveau d’ensorceleur.',
          native: true,
        },
        {
          id: 'draconique-affinite-elementaire',
          level: 6,
          name: 'Affinité élémentaire',
          description:
            'Vos sorts du type de votre dragon infligent +{{cha_mod}} dégât ; 1 point de sorcellerie = résistance à ce type pendant 1 h.',
        },
        {
          id: 'draconique-ailes',
          level: 14,
          name: 'Ailes draconiques',
          description:
            'En bonus action, faites pousser des ailes : vitesse de vol = votre vitesse actuelle (sauf armure non prévue).',
        },
        {
          id: 'draconique-presence',
          level: 18,
          name: 'Présence draconique',
          description:
            '1 point de sorcellerie : aura de 18 m charmant ou effrayant pendant la concentration.',
        },
      ],
    },
    {
      key: 'sauvage',
      label: 'Magie sauvage',
      level: 1,
      features: [
        {
          id: 'sauvage-pic-magie',
          level: 1,
          name: 'Pic de magie sauvage',
          description:
            'Sur un sort de niveau 1+, lancez un d20 : sur un 1, roulez sur la table de magie sauvage.',
        },
        {
          id: 'sauvage-maree-du-chaos',
          level: 1,
          name: 'Marée du chaos',
          description:
            'Avantage sur un test, attaque ou sauvegarde — 1× par repos long ; déclenche un pic à la relance.',
          resource: { max: () => 1, reset: 'long' },
        },
        {
          id: 'sauvage-chance-forcée',
          level: 6,
          name: 'Chance forcée',
          description:
            'En réaction, dépensez 2 points de sorcellerie : ±1d4 sur un jet de créature à 18 m.',
        },
        {
          id: 'sauvage-chaos-controle',
          level: 14,
          name: 'Chaos contrôlé',
          description:
            'Pour chaque pic de magie sauvage, lancez deux fois et gardez le résultat choisi.',
        },
        {
          id: 'sauvage-bombardement',
          level: 18,
          name: 'Bombardement de sort',
          description:
            'Quand un dé de dégâts de sort montre sa valeur maximale, relancez-le et additionnez (1× par tour).',
        },
      ],
    },
  ],
  Guerrier: [
    {
      key: 'champion',
      label: 'Champion',
      level: 3,
      features: [
        {
          id: 'champion-critique-ameliore',
          level: 3,
          name: 'Critique amélioré',
          description:
            'Vos attaques critiquent sur 19-20 (18-20 au niv. 15 avec Critique supérieur) — affiché sur les cartes d’attaque.',
          native: true,
        },
        {
          id: 'champion-athlete',
          level: 7,
          name: 'Athlète accompli',
          description:
            'Moitié du bonus de maîtrise (arrondi sup.) aux jets de FOR/DEX/CON sans maîtrise ; sauts en longueur +{{str_mod}} × 30 cm.',
        },
        {
          id: 'champion-style-supplementaire',
          level: 10,
          name: 'Style de combat supplémentaire',
          description: 'Choisissez un second style de combat.',
        },
        {
          id: 'champion-critique-superieur',
          level: 15,
          name: 'Critique supérieur',
          description:
            'Vos attaques avec armes critiquent sur 18-20 — inclus dans les cartes d’attaque.',
          native: true,
        },
        {
          id: 'champion-survivant',
          level: 18,
          name: 'Survivant',
          description: 'Récupérez 5 + {{con_mod}} PV à chaque tour si sous vos PV maximum.',
        },
      ],
    },
    {
      key: 'maitre-de-guerre',
      label: 'Maître de guerre',
      level: 3,
      features: [
        {
          id: 'maitre-guerre-disciple-martial',
          level: 3,
          name: 'Disciple martial',
          description: 'Vous gagnez la maîtrise d’un outil d’artisan de votre choix.',
        },
        {
          id: 'maitre-guerre-superiorite-martial',
          level: 3,
          name: 'Supériorité martiale',
          description:
            '3 manœuvres (+2 aux niv. 7, 10 et 15) et des dés de supériorité d8 (d10 au niv. 10, d12 au niv. 18), tous regagnés après un repos court ou long. DD = {{save_dc}} (Force ou Dextérité).',
          resource: { max: (level) => (level >= 15 ? 6 : level >= 7 ? 5 : 4), reset: 'short' },
        },
        {
          id: 'maitre-guerre-observation-ennemi',
          level: 7,
          name: 'Observation de l’ennemi',
          description:
            'Après 1 minute d’observation hors combat, le MD vous dit si la créature est égale, supérieure ou inférieure à vous pour 2 caractéristiques au choix.',
        },
        {
          id: 'maitre-guerre-implacable',
          level: 15,
          name: 'Implacable',
          description: 'À l’initiative sans dé de supériorité : regagnez-en un.',
        },
      ],
    },
    {
      key: 'chevalier-occulte',
      label: 'Chevalier occulte',
      level: 3,
      features: [
        {
          id: 'chevalier-occulte-incantation',
          level: 3,
          name: 'Incantation',
          description:
            'Sorts de magicien (INT) : 2 tours de magie (+1 au niv. 10) et des sorts d’abjuration/évocation (toute école aux niv. 8, 14, 20), avec les emplacements d’un magicien d’un tiers de votre niveau (repos long).',
        },
        {
          id: 'chevalier-occulte-lien-arme',
          level: 3,
          name: 'Lien avec une arme',
          description:
            'Rituel d’1 heure (repos court possible) liant jusqu’à 2 armes : impossible d’être désarmé, invocation de l’arme en bonus action (même plan).',
        },
        {
          id: 'chevalier-occulte-magie-de-guerre',
          level: 7,
          name: 'Magie de guerre',
          description:
            'Après avoir lancé un tour de magie avec votre action, attaque d’arme en bonus action.',
        },
        {
          id: 'chevalier-occulte-frappe-occulte',
          level: 10,
          name: 'Frappe occulte',
          description:
            'Une créature touchée par votre arme subit un désavantage au prochain JS contre un de vos sorts avant la fin de votre prochain tour.',
        },
        {
          id: 'chevalier-occulte-charge-arcanique',
          level: 15,
          name: 'Charge arcanique',
          description: 'Quand vous utilisez votre Fougue, téléportez-vous jusqu’à 9 m.',
        },
        {
          id: 'chevalier-occulte-magie-de-guerre-amelioree',
          level: 18,
          name: 'Magie de guerre améliorée',
          description:
            'Après avoir lancé n’importe quel sort avec votre action, attaque d’arme en bonus action.',
        },
      ],
    },
  ],
  Magicien: [
    {
      key: 'abjuration',
      label: 'École d’abjuration',
      level: 2,
      features: [
        {
          id: 'abjuration-abjurateur-erudit',
          level: 2,
          name: 'Abjurateur érudit',
          description: 'Copie des sorts d’abjuration à moitié coût et temps.',
        },
        {
          id: 'abjuration-protection-arcanique',
          level: 2,
          name: 'Protection arcanique',
          description:
            'En lançant un sort d’abjuration de niv. 1+, créez un sceau de 2 × {{level}} + 2 × niveaux lancés PV qui absorbe vos dégâts — 1 création par repos long.',
          resource: { max: () => 1, reset: 'long' },
        },
        {
          id: 'abjuration-protection-projetee',
          level: 6,
          name: 'Protection projetée',
          description:
            'En réaction, votre sceau absorbe les dégâts d’une créature alliée visible à 9 m.',
        },
        {
          id: 'abjuration-abjuration-amelioree',
          level: 10,
          name: 'Abjuration améliorée',
          description:
            'Ajoutez votre bonus de maîtrise aux jets imposés par vos sorts d’abjuration.',
        },
        {
          id: 'abjuration-resistance-aux-sorts',
          level: 14,
          name: 'Résistance aux sorts',
          description: 'Avantage aux sauvegardes contre les sorts et effets magiques.',
        },
      ],
    },
    {
      key: 'evocation',
      label: 'École d’évocation',
      level: 2,
      features: [
        {
          id: 'evocation-evocateur-erudit',
          level: 2,
          name: 'Évocateur érudit',
          description: 'Copie des sorts d’évocation à moitié coût et temps.',
        },
        {
          id: 'evocation-faconneur-de-sorts',
          level: 2,
          name: 'Façonneur de sorts',
          description:
            'Les alliés choisis réussissent automatiquement vos sorts de zone et ne subissent aucun dégât (ou la moitié en cas d’échec auto).',
        },
        {
          id: 'evocation-sort-mineur-puissant',
          level: 6,
          name: 'Sort mineur puissant',
          description:
            'Vos tours de magique infligent la moitié des dégâts même en cas de réussite au JS.',
        },
        {
          id: 'evocation-evocation-amelioree',
          level: 10,
          name: 'Évocation améliorée',
          description: 'Ajoutez {{int_mod}} aux dégâts de vos sorts d’évocation.',
        },
        {
          id: 'evocation-surcharge-magique',
          level: 14,
          name: 'Surcharge magique',
          description:
            'Vos sorts de dégâts de niv. 1-5 infligent leurs dégâts maximaux — gratuit 1×, puis 2d12 dégâts nécrotiques par niveau de sort avant un repos long.',
        },
      ],
    },
    {
      key: 'divination',
      label: 'École de divination',
      level: 2,
      features: [
        {
          id: 'divination-devin-erudit',
          level: 2,
          name: 'Devin érudit',
          description: 'Copie des sorts de divination à moitié coût et temps.',
        },
        {
          id: 'divination-presage',
          level: 2,
          name: 'Présage',
          description:
            'Après un repos long, lancez 2 d20 ; remplacez n’importe quel jet d’attaque, test ou sauvegarde par l’un d’eux (1×/tour, chaque dé 1×).',
        },
        {
          id: 'divination-divination-experte',
          level: 6,
          name: 'Divination experte',
          description:
            'En lançant un sort de divination de niv. 2+, récupérez un emplacement dépensé de niveau inférieur (max 5).',
        },
        {
          id: 'divination-troisieme-oeil',
          level: 10,
          name: 'Troisième œil',
          description:
            'En action : Perception obscure, vision dans le noir, voir l’éthéré ou lire n’importe quelle langue — jusqu’au prochain repos court ou long.',
        },
        {
          id: 'divination-presage-superieur',
          level: 14,
          name: 'Présage supérieur',
          description: 'Lancez 3 d20 au lieu de 2 pour le Présage.',
        },
      ],
    },
    {
      key: 'enchantement',
      label: 'École d’enchantement',
      level: 2,
      features: [
        {
          id: 'enchantement-enchanteur-erudit',
          level: 2,
          name: 'Enchanteur érudit',
          description: 'Copie des sorts d’enchantement à moitié coût et temps.',
        },
        {
          id: 'enchantement-regard-hypnotique',
          level: 2,
          name: 'Regard hypnotique',
          description:
            'Action : créature à 3 m charmée et neutralisée (JS Sagesse DD {{save_dc}}), tant que vous maintenez.',
        },
        {
          id: 'enchantement-charme-instinctif',
          level: 6,
          name: 'Charme instinctif',
          description:
            'En réaction quand on vous attaque : l’attaquant (JS Sagesse) cible la créature la plus proche — 1× par attaquant par repos long.',
        },
        {
          id: 'enchantement-partage',
          level: 10,
          name: 'Partage d’enchantement',
          description:
            'Vos sorts d’enchantement à cible unique (niv. 1+) peuvent cibler une seconde créature.',
        },
        {
          id: 'enchantement-alteration-memorielle',
          level: 14,
          name: 'Altération mémorielle',
          description:
            'Vos cibles charmées ignorent leur charme et peuvent oublier 1 + {{cha_mod}} heures (JS Intelligence).',
        },
      ],
    },
    {
      key: 'illusion',
      label: 'École d’illusion',
      level: 2,
      features: [
        {
          id: 'illusion-illusionniste-erudit',
          level: 2,
          name: 'Illusionniste érudit',
          description: 'Copie des sorts d’illusion à moitié coût et temps.',
        },
        {
          id: 'illusion-illusion-mineure-amelioree',
          level: 2,
          name: 'Illusion mineure améliorée',
          description: 'Tours de magie Illusion mineure : son + image simultanés.',
        },
        {
          id: 'illusion-illusions-malleables',
          level: 6,
          name: 'Illusions malléables',
          description: 'En action, modifiez vos illusions (position, taille, nature).',
        },
        {
          id: 'illusion-double-illusoire',
          level: 10,
          name: 'Double illusoire',
          description:
            'En réaction contre un jet d’attaque : il rate automatiquement — 1× par repos court ou long.',
          resource: { max: () => 1, reset: 'short' },
        },
        {
          id: 'illusion-realite-illusoire',
          level: 14,
          name: 'Réalité illusoire',
          description:
            'En bonus action, rendez réel 1 objet non magique d’une illusion de niv. 1+ pendant 1 minute (sans dégâts directs).',
        },
      ],
    },
    {
      key: 'invocation',
      label: 'École d’invocation',
      level: 2,
      features: [
        {
          id: 'invocation-invocateur-erudit',
          level: 2,
          name: 'Invocateur érudit',
          description: 'Copie des sorts d’invocation à moitié coût et temps.',
        },
        {
          id: 'invocation-invocation-mineure',
          level: 2,
          name: 'Invocation mineure',
          description: 'En action : créez un objet inanimé de 1,5 m non magique pendant 1 heure.',
        },
        {
          id: 'invocation-permutation',
          level: 6,
          name: 'Permutation',
          description:
            'En réaction (ou bonus action), échangez de place avec une créature consentante à 27 m, ou téléportez-vous dans une case libre — recharge aussi en lançant un sort d’invocation de niv. 1+.',
          resource: { max: () => 1, reset: 'long' },
        },
        {
          id: 'invocation-invocation-consciencieuse',
          level: 10,
          name: 'Invocation consciencieuse',
          description: 'Vos sorts d’invocation ne peuvent pas être interrompus par les dégâts.',
        },
        {
          id: 'invocation-convocations-coriaces',
          level: 14,
          name: 'Convocations coriaces',
          description:
            '30 PV temporaires aux créatures invoquées ou créées par vos sorts d’invocation.',
        },
      ],
    },
    {
      key: 'necromancie',
      label: 'École de nécromancie',
      level: 2,
      features: [
        {
          id: 'necromancie-necromancien-erudit',
          level: 2,
          name: 'Nécromancien érudit',
          description: 'Copie des sorts de nécromancie à moitié coût et temps.',
        },
        {
          id: 'necromancie-sinistre-moisson',
          level: 2,
          name: 'Sinistre moisson',
          description:
            'Quand vous tuez une créature avec un sort, récupérez 2 × le niveau du sort en PV (1× par tour).',
        },
        {
          id: 'necromancie-serviteurs-morts-vivants',
          level: 6,
          name: 'Serviteurs morts-vivants',
          description:
            'Vos créations de morts-vivants gagnent des PV (+{{level}}) et +{{prof}} de dégâts d’arme.',
        },
        {
          id: 'necromancie-insensibilite-non-vie',
          level: 10,
          name: 'Insensibilité à la non-vie',
          description: 'Résistance aux dégâts nécrotiques ; PV maximum non réductibles.',
        },
        {
          id: 'necromancie-controle-morts-vivants',
          level: 14,
          name: 'Contrôle des morts-vivants',
          description:
            'En action : mort-vivant visible à 18 m (JS Charisme DD {{save_dc}}) devient amical.',
        },
      ],
    },
    {
      key: 'transmutation',
      label: 'École de transmutation',
      level: 2,
      features: [
        {
          id: 'transmutation-transmutateur-erudit',
          level: 2,
          name: 'Transmutateur érudit',
          description: 'Copie des sorts de transmutation à moitié coût et temps.',
        },
        {
          id: 'transmutation-alchimie-mineure',
          level: 2,
          name: 'Alchimie mineure',
          description:
            '10 minutes : transformez le bois, la pierre, le fer ou le cuivre d’un objet (1 m³).',
        },
        {
          id: 'transmutation-pierre-transmutateur',
          level: 6,
          name: 'Pierre du transmutateur',
          description:
            'Une pierre à charge quotidienne : résistance (acide/foudre/feu/froid), +3 m de vitesse, etc.',
        },
        {
          id: 'transmutation-metamorphe',
          level: 10,
          name: 'Métamorphe',
          description:
            'Métamorphose gratuit sur vous-même (bête FP ≤ 1) — 1× par repos court ou long.',
          resource: { max: () => 1, reset: 'short' },
        },
        {
          id: 'transmutation-maitre-transmutateur',
          level: 14,
          name: 'Maître transmutateur',
          description:
            'En action, consommez la pierre (détruite) : Jouvence, Panacée, Restitution de vie ou Transformation majeure — 1 pierre par repos long.',
          resource: { max: () => 1, reset: 'long' },
        },
      ],
    },
  ],
  Moine: [
    {
      key: 'main-ouverte',
      label: 'Voie de la paume',
      level: 3,
      features: [
        {
          id: 'main-ouverte-technique',
          level: 3,
          name: 'Technique de la paume',
          description:
            'Sur une frappe avec Déluge de coups : projeter à 4,5 m (DD {{save_dc}}), priver d’action (DD {{save_dc}}) ou infliger +1d10 dégâts.',
        },
        {
          id: 'main-ouverte-plenitude-physique',
          level: 6,
          name: 'Plénitude physique',
          description: 'Une fois par repos long, guérissez 3 × {{level}} PV (action).',
          resource: { max: () => 1, reset: 'long' },
        },
        {
          id: 'main-ouverte-tranquillite',
          level: 11,
          name: 'Tranquillité',
          description:
            'Après un repos court ou long, vous gagnez l’effet du sort Sanctuaire (DD {{save_dc}}).',
        },
        {
          id: 'main-ouverte-paume-fremissante',
          level: 17,
          name: 'Paume frémissante',
          description:
            '3 ki : vibration létale — la cible réussit une sauvegarde de CON DD {{save_dc}} ou tombe à 0 PV ; en cas de réussite, 10d10 dégâts.',
        },
      ],
    },
  ],
  Occultiste: [
    {
      key: 'archfee',
      label: 'L’Archifée',
      level: 1,
      features: [
        {
          id: 'archfee-presence-feerique',
          level: 1,
          name: 'Présence féerique',
          description: 'Action : créatures à 3 m charmées ou effrayées 1 round (DD {{save_dc}}).',
        },
        {
          id: 'archfee-evasion-feerique',
          level: 6,
          name: 'Échappatoire brumeuse',
          description:
            'En réaction à des dégâts : invisible + téléportation 18 m — recharge après un repos court ou long.',
          resource: { max: () => 1, reset: 'short' },
        },
        {
          id: 'archfee-defenses-captivantes',
          level: 10,
          name: 'Défenses captivantes',
          description:
            'Immunité au charme ; en réaction, charmez en retour (1 min) celui qui tente de vous charmer.',
        },
        {
          id: 'archfee-sombre-delire',
          level: 14,
          name: 'Sombre délire',
          description:
            'Action : charmez ou effrayez une créature 1 min dans un royaume illusoire — 1× par repos court ou long.',
          resource: { max: () => 1, reset: 'short' },
        },
      ],
    },
    {
      key: 'fielon',
      label: 'Le Fiélon',
      level: 1,
      features: [
        {
          id: 'fielon-benediction',
          level: 1,
          name: 'Bénédiction du ténébreux',
          description:
            'PV temporaires = {{cha_mod}} + {{level}} à chaque réduction d’une créature à 0 PV.',
        },
        {
          id: 'fielon-chance-du-tenebreux',
          level: 6,
          name: 'Chance du ténébreux',
          description:
            '+1d10 à un test ou sauvegarde, après le lancé — 1× par repos court ou long.',
          resource: { max: () => 1, reset: 'short' },
        },
        {
          id: 'fielon-resistance-fielonne',
          level: 10,
          name: 'Résistance fiélonne',
          description:
            'Résistance à un type de dégâts au choix, rechoisi après chaque repos court ou long.',
        },
        {
          id: 'fielon-traversee-des-enfers',
          level: 14,
          name: 'Traversée des enfers',
          description:
            'Action : la cible disparaît dans les plans inférieurs et subit 10d10 dégâts psychiques au retour — 1× par repos long.',
          resource: { max: () => 1, reset: 'long' },
        },
      ],
    },
    {
      key: 'grand-ancien',
      label: 'Le Grand Ancien',
      level: 1,
      features: [
        {
          id: 'grand-ancien-esprit-eveille',
          level: 1,
          name: 'Esprit éveillé',
          description: 'Télépathie à 9 m avec toute créature comprenant un langage.',
        },
        {
          id: 'grand-ancien-protection-entropique',
          level: 6,
          name: 'Protection entropique',
          description:
            'En réaction, imposez le désavantage à une attaque ; en cas d’échec, avantage à votre prochaine attaque — 1× par repos court ou long.',
          resource: { max: () => 1, reset: 'short' },
        },
        {
          id: 'grand-ancien-bouclier-mental',
          level: 10,
          name: 'Bouclier mental',
          description:
            'Pensées illisibles, résistance aux dégâts psychiques, renvoi des dégâts psychiques à l’attaquant.',
        },
        {
          id: 'grand-ancien-asservissement',
          level: 14,
          name: 'Asservissement',
          description:
            '8 h : charmez un humanoïde que vous touchez — neutre, incapable d’agir (JS Charisme DD {{save_dc}}).',
        },
      ],
    },
  ],
  Rôdeur: [
    {
      key: 'chasseur',
      label: 'Chasseur',
      level: 3,
      features: [
        {
          id: 'chasseur-proie-du-chasseur',
          level: 3,
          name: 'Proie du chasseur',
          description:
            'Tueur de colosses (+1d8 dégâts, 1×/tour, contre cible blessée), Tueur de géants (attaque en réaction) ou Briseur de hordes (attaque supplémentaire contre une cible adjacente).',
        },
        {
          id: 'chasseur-tactiques-defensives',
          level: 7,
          name: 'Tactiques défensives',
          description:
            'Échapper à la horde, Défense contre les attaques multiples (+4 CA) ou Moral d’acier (avantage contre la peur).',
        },
        {
          id: 'chasseur-attaque-multiple',
          level: 11,
          name: 'Attaques multiples',
          description:
            'Volée (toutes les créatures à 3 m d’un point, sans mod. de dégâts) ou Attaque tourbillonnante (toutes à 1,50 m, sans mod.).',
        },
        {
          id: 'chasseur-defense-superieure',
          level: 15,
          name: 'Défense du chasseur supérieure',
          description:
            'Esquive totale, Retour de bâton (l’attaque manquée se retourne) ou Esquive instinctive (réaction, ½ dégâts).',
        },
      ],
    },
  ],
  Roublard: [
    {
      key: 'voleur',
      label: 'Voleur',
      level: 3,
      features: [
        {
          id: 'voleur-mains-lestes',
          level: 3,
          name: 'Mains lestes',
          description:
            'La Ruse permet aussi Utilisation d’objet, Fouille ou Désamorçage en bonus action.',
        },
        {
          id: 'voleur-monte-en-lair',
          level: 3,
          name: 'Monte-en-l’air',
          description:
            'Grimpez à pleine vitesse ; saut en hauteur en bonus action ; en réaction, réduisez les dégâts de chute de {{level}}.',
        },
        {
          id: 'voleur-discretion-supreme',
          level: 9,
          name: 'Discrétion suprême',
          description:
            'Avantage aux jets de Discrétion ({{skill:stealth}}) en vous déplaçant d’au plus la moitié de votre vitesse.',
        },
        {
          id: 'voleur-utilisation-objets-magiques',
          level: 13,
          name: 'Utilisation d’objets magiques',
          description:
            'Vous ignorez les restrictions de classe, race et niveau des objets magiques.',
        },
        {
          id: 'voleur-reflexes',
          level: 17,
          name: 'Réflexes de voleur',
          description:
            'Deux tours au premier round de combat (le second à votre initiative − 10) — sauf si surpris.',
        },
      ],
    },
    {
      key: 'assassin',
      label: 'Assassin',
      level: 3,
      features: [
        {
          id: 'assassin-maitrises-supplementaires',
          level: 3,
          name: 'Maîtrises supplémentaires',
          description: 'Maîtrise du kit de déguisement et du kit d’empoisonneur.',
        },
        {
          id: 'assassin-assassinat',
          level: 3,
          name: 'Assassinat',
          description:
            'Attaques contre des créatures surprises : avantage ; toute réussite est un coup critique.',
        },
        {
          id: 'assassin-expert-infiltration',
          level: 9,
          name: 'Expert en infiltration',
          description:
            'Créez de fausses identités (1 semaine et 25 po) ; imitez signatures et sceaux.',
        },
        {
          id: 'assassin-imposteur',
          level: 13,
          name: 'Imposteur',
          description:
            'Après 3 h d’étude, imitez le discours, l’écriture et le comportement d’une personne (avantage à la Tromperie si doute).',
        },
        {
          id: 'assassin-frappe-meurtriere',
          level: 17,
          name: 'Frappe meurtrière',
          description:
            'Contre une créature surprise : dégâts doublés (sauvegarde de CON DD {{save_dc}}).',
        },
      ],
    },
    {
      key: 'escroc-arcanique',
      label: 'Escroc arcanique',
      level: 3,
      features: [
        {
          id: 'escroc-arcanique-incantation',
          level: 3,
          name: 'Incantation',
          description:
            'Sorts de magicien (INT) : 3 tours de magie dont Main de mage, sorts d’enchantement/illusion (toute école aux niv. 8, 14, 20), emplacements d’un magicien d’un tiers de votre niveau (repos long).',
        },
        {
          id: 'escroc-arcanique-escamotage',
          level: 3,
          name: 'Escamotage et main de mage',
          description:
            'La Main de mage invisible range, récupère ou crochette à distance (Escamotage opposé à la Perception) — contrôlable via la Ruse.',
        },
        {
          id: 'escroc-arcanique-embuscade-magique',
          level: 9,
          name: 'Embuscade magique',
          description:
            'Sorts lancés alors que vous êtes caché : désavantage aux sauvegardes de la cible pour ce tour.',
        },
        {
          id: 'escroc-arcanique-escroc-polyvalent',
          level: 13,
          name: 'Escroc polyvalent',
          description:
            'En bonus action, désignez une créature à 1,50 m de la main : avantage d’attaque contre elle jusqu’à la fin du tour.',
        },
        {
          id: 'escroc-arcanique-voleur-de-sort',
          level: 17,
          name: 'Voleur de sort',
          description:
            'En réaction contre un sort vous ciblant : JS annule l’effet et vous vole le sort (lançable 8 h) — 1× par repos long.',
          resource: { max: () => 1, reset: 'long' },
        },
      ],
    },
  ],
};

// ---------- Aides ----------

/** Capacités de base + celles de la sous-classe active du personnage, triées par niveau. */
export function featuresForCharacter(character: {
  characterClass?: string | null;
  subclass?: string | null;
  druidCircle?: string | null;
}): ClassFeatureDef[] {
  const cls = character.characterClass ?? '';
  const base = CLASS_FEATURES[cls] ?? [];
  let subclassKey = character.subclass ?? null;
  if (cls === 'Druide') subclassKey = character.druidCircle ?? null; // colonne dédiée
  const sub =
    subclassKey && CLASS_SUBCLASSES[cls]
      ? (CLASS_SUBCLASSES[cls].find((s) => s.key === subclassKey)?.features ?? [])
      : [];
  return [...base, ...sub].sort((a, b) => a.level - b.level);
}

/** Retrouve une définition du catalogue par identifiant (base + toutes sous-classes). */
export function findClassFeature(catalogId: string): ClassFeatureDef | null {
  for (const list of Object.values(CLASS_FEATURES)) {
    const hit = list.find((f) => f.id === catalogId);
    if (hit) return hit;
  }
  for (const subs of Object.values(CLASS_SUBCLASSES)) {
    for (const sub of subs) {
      const hit = sub.features.find((f) => f.id === catalogId);
      if (hit) return hit;
    }
  }
  return null;
}

/** Prochaine acquisition : capacités (base + sous-classe active) du prochain niveau atteint. */
export function nextClassFeatureGain(character: {
  characterClass?: string | null;
  subclass?: string | null;
  druidCircle?: string | null;
  level?: number;
}): { level: number; features: ClassFeatureDef[] } | null {
  const level = character.level ?? 1;
  const all = featuresForCharacter(character);
  for (let l = level + 1; l <= 20; l++) {
    const features = all.filter((f) => f.level === l);
    if (features.length > 0) return { level: l, features };
  }
  return null;
}

/** Taille actuelle de la ressource d'une capacité pour ce personnage (null = pas de compteur). */
export function classFeatureResourceMax(def: ClassFeatureDef, character: Character): number | null {
  if (!def.resource) return null;
  return def.resource.max(character.level ?? 1, modsFrom(character));
}

/** La ressource se recharge-t-elle sur ce type de repos ? */
export function resourceResetsOn(
  def: ClassFeatureDef,
  character: Character,
  restType: 'short' | 'long',
): boolean {
  if (!def.resource) return false;
  if (restType === 'long') return true; // long rest recharge tout
  if (def.resource.reset !== 'short') return false;
  const level = character.level ?? 1;
  if (def.resource.shortFromLevel && level < def.resource.shortFromLevel) return false;
  return true;
}
