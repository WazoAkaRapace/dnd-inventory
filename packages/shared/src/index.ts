/**
 * Shared domain types — imported by both the Fastify API and the React frontend.
 * Weights are ALWAYS in kilograms (SI). The SRD source data (lb) is converted at import.
 */

// ---------- Items ----------

export type ItemCategory =
  | 'weapon'
  | 'armor'
  | 'gear' // adventuring gear
  | 'tool'
  | 'mount' // mounts & vehicles
  | 'ammunition'
  | 'magic' // magic items
  | 'custom';

export type Rarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'veryRare'
  | 'legendary'
  | 'artifact'
  | 'none'; // mundane items have no rarity

export type CostUnit = 'cp' | 'sp' | 'ep' | 'gp' | 'pp';

/** A catalog item (SRD-sourced or GM-created custom). */
export interface Item {
  id: number;
  source: 'srd' | 'custom';
  partyId: number | null; // null for SRD/global; set for custom items
  category: ItemCategory;
  name: string;
  nameFr: string | null;
  rarity: Rarity;
  /** Weight in KILOGRAMS. Null when unknown (some magic items). */
  weightKg: number | null;
  costQty: number | null;
  costUnit: CostUnit | null;
  description: string | null;
  // Weapon/armor specifics
  damageDice: string | null;
  damageType: string | null;
  acBase: number | null;
  strMin: number | null;
  stealthDisadvantage: boolean;
  properties: string[]; // weapon properties: light, finesse, two-handed...
  survivalTags: string[]; // ["food"] / ["water"] / ["food","water"] / []
  aliases: string[]; // alternative search names: ["bricoleur","outils de bricoleur"]
  imagePath: string | null;
}

export type SurvivalTag = 'food' | 'water';

/** Item search/create payloads. */
export interface ItemSearchQuery {
  search?: string;
  category?: ItemCategory;
  rarity?: Rarity;
  limit?: number;
  offset?: number;
}

export interface CreateCustomItem {
  name: string;
  nameFr?: string;
  category: ItemCategory;
  rarity?: Rarity;
  weightKg?: number | null;
  costQty?: number | null;
  costUnit?: CostUnit | null;
  description?: string;
}

// ---------- Users & auth ----------

export interface User {
  id: number;
  username: string;
  displayName: string;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface RegisterPayload {
  username: string;
  password: string;
  displayName: string;
}

export interface LoginPayload {
  username: string;
  password: string;
}

// ---------- Parties ----------

export type EncumbranceMode = 'variant' | 'standard' | 'slots';
export type PartyRole = 'gm' | 'player';

export interface Party {
  id: number;
  name: string;
  gmUserId: number;
  inviteCode: string;
  encumbranceMode: EncumbranceMode;
  createdAt: string;
}

export interface PartyMember {
  userId: number;
  username: string;
  displayName: string;
  role: PartyRole;
  joinedAt: string;
}

/** A user the GM banned — the invite code is locked for them until unbanned. */
export interface BannedPartyUser {
  userId: number;
  username: string;
  displayName: string;
  bannedAt: string;
}

/** API response row for GET /api/parties — party plus the caller's membership context. */
export interface PartyListRow extends Party {
  gmName?: string;
  role: PartyRole;
  memberCount: number;
  characterCount: number;
  /** Roster character names (alphabetical, same order as the party detail). */
  characterNames: string[];
}

/** API response shape for GET /api/parties/:id — wraps the party with related data. */
export interface PartyDetail {
  party: Party;
  members: PartyMember[];
  characters: CharacterSummary[];
  /** Surfaced in the GM's Joueurs tab only. */
  banned: BannedPartyUser[];
}

export interface CreatePartyPayload {
  name: string;
  encumbranceMode: EncumbranceMode;
}

export interface JoinPartyPayload {
  inviteCode: string;
}

// ---------- NPCs ----------

export type NpcDisposition = 'friendly' | 'neutral' | 'hostile' | 'unknown';
export type NpcStatus = 'alive' | 'dead' | 'missing' | 'turned';

export interface Npc {
  id: number;
  partyId: number;
  createdBy: number;
  createdByName: string;
  name: string;
  role: string | null;
  location: string | null;
  faction: string | null;
  disposition: NpcDisposition;
  status: NpcStatus;
  description: string | null;
  secret: string | null; // null if not visible to requesting user
  isShared: boolean;
  sortOrder: number;
}

export interface CreateNpcPayload {
  name: string;
  role?: string;
  location?: string;
  faction?: string;
  disposition?: NpcDisposition;
  status?: NpcStatus;
  description?: string;
  secret?: string;
  isShared?: boolean;
}

export interface PatchNpcPayload {
  name?: string;
  role?: string | null;
  location?: string | null;
  faction?: string | null;
  disposition?: NpcDisposition;
  status?: NpcStatus;
  description?: string | null;
  secret?: string | null;
  isShared?: boolean;
}

export const NPC_DISPOSITION_LABELS_FR: Record<NpcDisposition, string> = {
  friendly: 'Amical',
  neutral: 'Neutre',
  hostile: 'Hostile',
  unknown: 'Inconnu',
};

export const NPC_STATUS_LABELS_FR: Record<NpcStatus, string> = {
  alive: 'En vie',
  dead: 'Mort',
  missing: 'Disparu',
  turned: 'Retourné',
};

// ---------- D&D 5e Conditions (French) ----------

export const DND_CONDITIONS_FR = [
  'Aveuglé',
  'Assourdi',
  'Charmé',
  'Effrayé',
  'Empoisonné',
  'En feu',
  'Entravé',
  'Étourdi',
  'Inconscient',
  'Invisible',
  'Agrippé',
  'À terre',
  'Paralysé',
  'Pétrifié',
  'Possédé',
  'Neutralisé',
] as const;

/**
 * Conditions that incapacitate the character and therefore automatically
 * break concentration (5e SRD: incapacitated = unable to concentrate).
 */
export const CONCENTRATION_BREAKING_CONDITIONS_FR: readonly string[] = [
  'Neutralisé',
  'Étourdi',
  'Inconscient',
  'Paralysé',
  'Pétrifié',
];

// ---------- Characters ----------

export interface CharacterSummary {
  id: number;
  partyId: number;
  ownerId: number;
  ownerName: string;
  name: string;
  strength: number;
  capacityMultiplier: number;
  exhaustion: number; // 0-6
  conditions: string[]; // ["Poisoned", "Frightened", ...]
  foodDays: number; // days without food
  waterDays: number; // days without water
  maxHp: number;
  currentHp: number;
  tempHp: number;
  // Character sheet
  level: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  characterClass: string | null;
  race: string | null;
  background: string | null;
  speed: number; // meters
  skillProficiencies: string[]; // skill keys: ["acrobatics","arcanes",...]
  skillExpertise: string[]; // skill keys with doubled proficiency bonus (Roublard/Barde/Clerc Savoir)
  savingThrowProficiencies: string[]; // ability keys: ["strength","constitution"]
  weaponProficiencies: string[] | null; // tokens 'simple'/'martial' + EN weapon names; null = class default
  fightingStyle: FightingStyle | null; // SRD fighting style (Guerrier/Paladin/Rôdeur)
  spellSlotsUsed: number[]; // 9 entries, used per spell level 1-9
  // Description / personality
  alignment: string | null;
  sex: string | null;
  height: string | null;
  weight: string | null;
  age: string | null;
  skin: string | null;
  eyes: string | null;
  hair: string | null;
  portraitUrl: string | null;
  personalityTraits: string | null;
  ideals: string | null;
  bonds: string | null;
  flaws: string | null;
  appearance: string | null;
  armorClassOverride: number | null;
  deathSaveSuccesses: number; // 0-3
  deathSaveFailures: number; // 0-3
  inspiration: boolean;
  concentrating: boolean; // player is concentrating on a spell
  // Wild Shape (Druide)
  wildShapeSlug: string | null;
  wildShapeHp: number | null;
  wildShapeMaxHp: number | null;
  wildShapeUses: number;
  // Hit dice: level dice of the class die; spent on short rests to heal
  hitDiceUsed: number;
  // Wild Shape: beast slugs the druid has seen (SRD requirement)
  wildShapeSeen: string[];
  // Druidic circle: 'terre' | 'lune' | null
  druidCircle: string | null;
  // Divine domain (Clerc): 'savoir' | 'vie' | … | null
  divineDomain: string | null;
  // Druid Circle of the Land terrain + Paladin Sacred Oath
  landCircle: string | null;
  sacredOath: string | null;
  // Secret prep: hidden characters are invisible to other players (owner + GM
  // still see them) and inactive — excluded from combat rosters and adds.
  hidden: boolean;
}

/** A Constitution save required to maintain concentration after taking damage. */
export interface ConcentrationCheck {
  characterId: number;
  characterName: string;
  damage: number;
  /** DC = max(10, floor(damage / 2)) */
  dc: number;
  /** Set in sync events: the user whose character must roll the save. */
  ownerId?: number;
}

export interface Character extends CharacterSummary {
  notes: string | null;
  // coin purse (cp value)
  copper: number;
  silver: number;
  electrum: number;
  gold: number;
  platinum: number;
  createdAt: string;
}

export interface CreateCharacterPayload {
  name: string;
  strength: number;
  capacityMultiplier?: number;
  characterClass?: string;
  level?: number;
  race?: string;
  background?: string;
  /** Create as a secret character (hidden from other players). */
  hidden?: boolean;
}

export interface PatchCharacterPayload {
  name?: string;
  strength?: number;
  capacityMultiplier?: number;
  exhaustion?: number;
  conditions?: string[];
  foodDays?: number;
  waterDays?: number;
  maxHp?: number;
  currentHp?: number;
  tempHp?: number;
  notes?: string | null;
  copper?: number;
  silver?: number;
  electrum?: number;
  gold?: number;
  platinum?: number;
  // Character sheet
  level?: number;
  dexterity?: number;
  constitution?: number;
  intelligence?: number;
  wisdom?: number;
  charisma?: number;
  characterClass?: string | null;
  race?: string | null;
  background?: string | null;
  speed?: number;
  skillProficiencies?: string[];
  skillExpertise?: string[];
  savingThrowProficiencies?: string[];
  weaponProficiencies?: string[] | null;
  fightingStyle?: FightingStyle | null;
  spellSlotsUsed?: number[];
  // Description / personality
  alignment?: string | null;
  sex?: string | null;
  height?: string | null;
  weight?: string | null;
  age?: string | null;
  skin?: string | null;
  eyes?: string | null;
  hair?: string | null;
  portraitUrl?: string | null;
  personalityTraits?: string | null;
  ideals?: string | null;
  bonds?: string | null;
  flaws?: string | null;
  appearance?: string | null;
  armorClassOverride?: number | null;
  deathSaveSuccesses?: number;
  deathSaveFailures?: number;
  inspiration?: boolean;
  concentrating?: boolean;
  wildShapeSlug?: string | null;
  wildShapeHp?: number | null;
  wildShapeMaxHp?: number | null;
  wildShapeUses?: number;
  hitDiceUsed?: number;
  wildShapeSeen?: string[];
  druidCircle?: string | null;
  divineDomain?: string | null;
  landCircle?: string | null;
  sacredOath?: string | null;
  /** Owner-only: hide this character from other players (secret prep). */
  hidden?: boolean;
}

// ---------- D&D 5e Abilities (Caractéristiques) ----------

export type AbilityKey =
  | 'strength'
  | 'dexterity'
  | 'constitution'
  | 'intelligence'
  | 'wisdom'
  | 'charisma';

export interface AbilityInfo {
  key: AbilityKey;
  label: string; // "Force"
  shortLabel: string; // "FOR"
  abbr: string; // "FOR" (same as shortLabel, for convenience)
}

export const DND_ABILITIES: AbilityInfo[] = [
  { key: 'strength', label: 'Force', shortLabel: 'FOR', abbr: 'FOR' },
  { key: 'dexterity', label: 'Dextérité', shortLabel: 'DEX', abbr: 'DEX' },
  { key: 'constitution', label: 'Constitution', shortLabel: 'CON', abbr: 'CON' },
  { key: 'intelligence', label: 'Intelligence', shortLabel: 'INT', abbr: 'INT' },
  { key: 'wisdom', label: 'Sagesse', shortLabel: 'SAG', abbr: 'SAG' },
  { key: 'charisma', label: 'Charisme', shortLabel: 'CHA', abbr: 'CHA' },
];

export const ABILITY_LABELS_FR: Record<AbilityKey, string> = {
  strength: 'Force',
  dexterity: 'Dextérité',
  constitution: 'Constitution',
  intelligence: 'Intelligence',
  wisdom: 'Sagesse',
  charisma: 'Charisme',
};

export const ABILITY_SHORT_FR: Record<AbilityKey, string> = {
  strength: 'FOR',
  dexterity: 'DEX',
  constitution: 'CON',
  intelligence: 'INT',
  wisdom: 'SAG',
  charisma: 'CHA',
};

/** Compute ability modifier: floor((score - 10) / 2) */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** Format a modifier for display: +3, -1, +0 */
export function formatModifier(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

// ---------- Proficiency Bonus ----------

/** Proficiency bonus by character level (1-20). */
export function proficiencyBonus(level: number): number {
  if (level >= 17) return 6;
  if (level >= 13) return 5;
  if (level >= 9) return 4;
  if (level >= 5) return 3;
  return 2;
}

// ---------- Skills (Compétences) — 18 skills ----------

export type SkillKey =
  | 'acrobatics'
  | 'arcanes'
  | 'athletics'
  | 'deception'
  | 'history'
  | 'insight'
  | 'intimidation'
  | 'investigation'
  | 'medicine'
  | 'nature'
  | 'perception'
  | 'performance'
  | 'persuasion'
  | 'religion'
  | 'sleightOfHand'
  | 'stealth'
  | 'survival'
  | 'animalHandling';

export interface SkillInfo {
  key: SkillKey;
  label: string; // French name: "Acrobaties"
  ability: AbilityKey; // associated ability
}

export const DND_SKILLS: SkillInfo[] = [
  { key: 'acrobatics', label: 'Acrobaties', ability: 'dexterity' },
  { key: 'animalHandling', label: 'Dressage', ability: 'wisdom' },
  { key: 'arcanes', label: 'Arcanes', ability: 'intelligence' },
  { key: 'athletics', label: 'Athlétisme', ability: 'strength' },
  { key: 'deception', label: 'Supercherie', ability: 'charisma' },
  { key: 'history', label: 'Histoire', ability: 'intelligence' },
  { key: 'insight', label: 'Perspicacité', ability: 'wisdom' },
  { key: 'intimidation', label: 'Intimidation', ability: 'charisma' },
  { key: 'investigation', label: 'Investigation', ability: 'intelligence' },
  { key: 'medicine', label: 'Médecine', ability: 'wisdom' },
  { key: 'nature', label: 'Nature', ability: 'intelligence' },
  { key: 'perception', label: 'Perception', ability: 'wisdom' },
  { key: 'performance', label: 'Représentation', ability: 'charisma' },
  { key: 'persuasion', label: 'Persuasion', ability: 'charisma' },
  { key: 'religion', label: 'Religion', ability: 'intelligence' },
  { key: 'sleightOfHand', label: 'Escamotage', ability: 'dexterity' },
  { key: 'stealth', label: 'Discrétion', ability: 'dexterity' },
  { key: 'survival', label: 'Survie', ability: 'wisdom' },
];

/** Skill proficiency level: 0=none, 1=proficient, 2=expertise (double proficiency) */
export type ProficiencyLevel = 0 | 1 | 2;

/** Read a skill's proficiency level: expertise implies proficiency (level 2 wins). */
export function skillProficiencyLevel(
  character: Pick<Character, 'skillProficiencies' | 'skillExpertise'>,
  skillKey: SkillKey,
): ProficiencyLevel {
  if ((character.skillExpertise ?? []).includes(skillKey)) return 2;
  if ((character.skillProficiencies ?? []).includes(skillKey)) return 1;
  return 0;
}

/** Total skill check modifier: ability modifier + proficiency bonus × level (×2 on expertise). */
export function skillModifier(character: Character, skillKey: SkillKey): number {
  const skill = DND_SKILLS.find((s) => s.key === skillKey);
  if (!skill) return 0;
  const score = (character[skill.ability as keyof Character] as number) ?? 10;
  const level = skillProficiencyLevel(character, skillKey);
  const bonus = proficiencyBonus(character.level ?? 1);
  return abilityModifier(score) + (level > 0 ? bonus * level : 0);
}

/** Expertise slots by class/level (SRD): Roublard 2 at level 1 (+2 at 6), Barde 2 at
 *  level 3 (+2 at 10), Clerc du Domaine du Savoir 2 at level 1 (Bénédictions de la Connaissance). */
export function expertiseSlots(character: {
  characterClass?: string | null;
  level?: number;
  divineDomain?: string | null;
}): number {
  const level = character.level ?? 1;
  switch (findClass(character.characterClass)?.name) {
    case 'Roublard':
      return level >= 6 ? 4 : 2;
    case 'Barde':
      return level >= 10 ? 4 : level >= 3 ? 2 : 0;
    case 'Clerc':
      return character.divineDomain === 'savoir' ? 2 : 0;
    default:
      return 0;
  }
}

// ---------- Classes (SRD reference: hit dice, saves, spellcasting) ----------

export type SpellcastingType = 'none' | 'full' | 'half' | 'pact' | 'artificier';

export interface ClassInfo {
  name: string; // French: "Magicien", "Guerrier"
  hitDie: number; // 6, 8, 10, 12
  savingThrows: AbilityKey[]; // 2 abilities
  spellcasting: SpellcastingType;
  spellcastingAbility?: AbilityKey; // INT, WIS, CHA (for casters)
  preparesSpells: boolean; // true = must prepare from known list (Wizard/Cleric/Druid/Paladin/Ranger/Artificer)
}

export const DND_CLASSES: ClassInfo[] = [
  {
    name: 'Artificier',
    hitDie: 8,
    savingThrows: ['constitution', 'intelligence'],
    spellcasting: 'artificier',
    spellcastingAbility: 'intelligence',
    preparesSpells: true,
  },
  {
    name: 'Barbare',
    hitDie: 12,
    savingThrows: ['strength', 'constitution'],
    spellcasting: 'none',
    preparesSpells: false,
  },
  {
    name: 'Barde',
    hitDie: 8,
    savingThrows: ['dexterity', 'charisma'],
    spellcasting: 'full',
    spellcastingAbility: 'charisma',
    preparesSpells: false,
  },
  {
    name: 'Clerc',
    hitDie: 8,
    savingThrows: ['wisdom', 'charisma'],
    spellcasting: 'full',
    spellcastingAbility: 'wisdom',
    preparesSpells: true,
  },
  {
    name: 'Druide',
    hitDie: 8,
    savingThrows: ['intelligence', 'wisdom'],
    spellcasting: 'full',
    spellcastingAbility: 'wisdom',
    preparesSpells: true,
  },
  {
    name: 'Ensorceleur',
    hitDie: 6,
    savingThrows: ['constitution', 'charisma'],
    spellcasting: 'full',
    spellcastingAbility: 'charisma',
    preparesSpells: false,
  },
  {
    name: 'Guerrier',
    hitDie: 10,
    savingThrows: ['strength', 'constitution'],
    spellcasting: 'none',
    preparesSpells: false,
  },
  {
    name: 'Magicien',
    hitDie: 6,
    savingThrows: ['intelligence', 'wisdom'],
    spellcasting: 'full',
    spellcastingAbility: 'intelligence',
    preparesSpells: true,
  },
  {
    name: 'Moine',
    hitDie: 8,
    savingThrows: ['strength', 'dexterity'],
    spellcasting: 'none',
    preparesSpells: false,
  },
  {
    name: 'Occultiste',
    hitDie: 8,
    savingThrows: ['wisdom', 'charisma'],
    spellcasting: 'pact',
    spellcastingAbility: 'charisma',
    preparesSpells: false,
  },
  {
    name: 'Paladin',
    hitDie: 10,
    savingThrows: ['wisdom', 'charisma'],
    spellcasting: 'half',
    spellcastingAbility: 'charisma',
    preparesSpells: true,
  },
  {
    name: 'Rôdeur',
    hitDie: 10,
    savingThrows: ['strength', 'dexterity'],
    spellcasting: 'half',
    spellcastingAbility: 'wisdom',
    preparesSpells: true,
  },
  {
    name: 'Roublard',
    hitDie: 8,
    savingThrows: ['dexterity', 'intelligence'],
    spellcasting: 'none',
    preparesSpells: false,
  },
];

/** Find class info by name (case-insensitive, accent-insensitive match). */
export function findClass(name: string | null | undefined): ClassInfo | null {
  if (!name) return null;
  const normalized = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return (
    DND_CLASSES.find(
      (c) =>
        c.name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') === normalized,
    ) ?? null
  );
}

/**
 * Compute the number of spells a character can have prepared.
 * Returns null for classes that don't prepare spells (Barde, Ensorceleur, Occultiste, non-casters).
 *
 * SRD rules:
 * - Full casters (Magicien, Clerc, Druide): casting ability mod + class level (min 1)
 * - Half casters (Paladin, Rôdeur, Artificier): casting ability mod + floor(level / 2) (min 1)
 */
export function computePreparedSpellsLimit(
  classInfo: ClassInfo,
  level: number,
  castingAbilityScore: number,
): number | null {
  if (!classInfo.preparesSpells || !classInfo.spellcastingAbility) return null;
  const mod = abilityModifier(castingAbilityScore);
  const effectiveLevel =
    classInfo.spellcasting === 'half' || classInfo.spellcasting === 'artificier'
      ? Math.floor(level / 2)
      : level;
  return Math.max(1, mod + effectiveLevel);
}

// ---------- Spell Slots (Emplacements de sort) ----------

/**
 * Full caster spell slots by level (1-20).
 * Each row is [slotsL1..slotsL9] for that character level.
 * Cantrips (L0) are at-will and not tracked here.
 */
export const SPELL_SLOTS_FULL: number[][] = [
  [2, 0, 0, 0, 0, 0, 0, 0, 0], // L1
  [3, 0, 0, 0, 0, 0, 0, 0, 0], // L2
  [4, 2, 0, 0, 0, 0, 0, 0, 0], // L3
  [4, 3, 0, 0, 0, 0, 0, 0, 0], // L4
  [4, 3, 2, 0, 0, 0, 0, 0, 0], // L5
  [4, 3, 3, 0, 0, 0, 0, 0, 0], // L6
  [4, 3, 3, 1, 0, 0, 0, 0, 0], // L7
  [4, 3, 3, 2, 0, 0, 0, 0, 0], // L8
  [4, 3, 3, 3, 1, 0, 0, 0, 0], // L9
  [4, 3, 3, 3, 2, 0, 0, 0, 0], // L10
  [4, 3, 3, 3, 2, 1, 0, 0, 0], // L11
  [4, 3, 3, 3, 2, 1, 0, 0, 0], // L12
  [4, 3, 3, 3, 2, 1, 1, 0, 0], // L13
  [4, 3, 3, 3, 2, 1, 1, 0, 0], // L14
  [4, 3, 3, 3, 2, 1, 1, 1, 0], // L15
  [4, 3, 3, 3, 2, 1, 1, 1, 0], // L16
  [4, 3, 3, 3, 2, 1, 1, 1, 1], // L17
  [4, 3, 3, 3, 3, 1, 1, 1, 1], // L18
  [4, 3, 3, 3, 3, 2, 1, 1, 1], // L19
  [4, 3, 3, 3, 3, 2, 2, 1, 1], // L20
];

/**
 * Half caster (Paladin, Ranger) spell slots by level (1-20).
 * Paladin/Ranger get slots starting at character level 2.
 */
export const SPELL_SLOTS_HALF: number[][] = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0], // L1
  [2, 0, 0, 0, 0, 0, 0, 0, 0], // L2
  [3, 0, 0, 0, 0, 0, 0, 0, 0], // L3
  [3, 0, 0, 0, 0, 0, 0, 0, 0], // L4
  [4, 2, 0, 0, 0, 0, 0, 0, 0], // L5
  [4, 2, 0, 0, 0, 0, 0, 0, 0], // L6
  [4, 3, 0, 0, 0, 0, 0, 0, 0], // L7
  [4, 3, 0, 0, 0, 0, 0, 0, 0], // L8
  [4, 3, 2, 0, 0, 0, 0, 0, 0], // L9
  [4, 3, 2, 0, 0, 0, 0, 0, 0], // L10
  [4, 3, 3, 0, 0, 0, 0, 0, 0], // L11
  [4, 3, 3, 0, 0, 0, 0, 0, 0], // L12
  [4, 3, 3, 1, 0, 0, 0, 0, 0], // L13
  [4, 3, 3, 1, 0, 0, 0, 0, 0], // L14
  [4, 3, 3, 2, 0, 0, 0, 0, 0], // L15
  [4, 3, 3, 2, 0, 0, 0, 0, 0], // L16
  [4, 3, 3, 3, 1, 0, 0, 0, 0], // L17
  [4, 3, 3, 3, 1, 0, 0, 0, 0], // L18
  [4, 3, 3, 3, 2, 0, 0, 0, 0], // L19
  [4, 3, 3, 3, 2, 0, 0, 0, 0], // L20
];

/**
 * Artificier spell slots by level (1-20).
 * Unlike Paladin/Ranger, the Artificier gets spell slots at level 1
 * and follows its own progression table from Tasha's Cauldron.
 * Max spell level is 5 (9-element array, entries 6-9 are always 0).
 */
export const SPELL_SLOTS_ARTIFICIER: number[][] = [
  [2, 0, 0, 0, 0, 0, 0, 0, 0], // L1
  [2, 0, 0, 0, 0, 0, 0, 0, 0], // L2
  [3, 0, 0, 0, 0, 0, 0, 0, 0], // L3
  [3, 0, 0, 0, 0, 0, 0, 0, 0], // L4
  [4, 2, 0, 0, 0, 0, 0, 0, 0], // L5
  [4, 2, 0, 0, 0, 0, 0, 0, 0], // L6
  [4, 3, 0, 0, 0, 0, 0, 0, 0], // L7
  [4, 3, 0, 0, 0, 0, 0, 0, 0], // L8
  [4, 3, 2, 0, 0, 0, 0, 0, 0], // L9
  [4, 3, 2, 0, 0, 0, 0, 0, 0], // L10
  [4, 3, 3, 0, 0, 0, 0, 0, 0], // L11
  [4, 3, 3, 0, 0, 0, 0, 0, 0], // L12
  [4, 3, 3, 1, 0, 0, 0, 0, 0], // L13
  [4, 3, 3, 1, 0, 0, 0, 0, 0], // L14
  [4, 3, 3, 2, 0, 0, 0, 0, 0], // L15
  [4, 3, 3, 2, 0, 0, 0, 0, 0], // L16
  [4, 3, 3, 3, 1, 0, 0, 0, 0], // L17
  [4, 3, 3, 3, 1, 0, 0, 0, 0], // L18
  [4, 3, 3, 3, 2, 0, 0, 0, 0], // L19
  [4, 3, 3, 3, 2, 0, 0, 0, 0], // L20
];

/**
 * Pact magic (Warlock) slots by level (1-20).
 * Warlocks get 2 slots of a single level that scales with character level.
 * Represented as [slotLevel-1 filled with the count, rest 0].
 * e.g. level 5 = [0,2,0,0,0,0,0,0,0] (2 slots of level 2).
 */
export const SPELL_SLOTS_PACT: number[][] = [
  [2, 0, 0, 0, 0, 0, 0, 0, 0], // L1
  [2, 0, 0, 0, 0, 0, 0, 0, 0], // L2
  [2, 0, 0, 0, 0, 0, 0, 0, 0], // L3
  [0, 2, 0, 0, 0, 0, 0, 0, 0], // L4
  [0, 2, 0, 0, 0, 0, 0, 0, 0], // L5
  [0, 0, 2, 0, 0, 0, 0, 0, 0], // L6
  [0, 0, 2, 0, 0, 0, 0, 0, 0], // L7
  [0, 0, 0, 2, 0, 0, 0, 0, 0], // L8
  [0, 0, 0, 2, 0, 0, 0, 0, 0], // L9
  [0, 0, 0, 0, 2, 0, 0, 0, 0], // L10
  [0, 0, 0, 0, 2, 0, 0, 0, 0], // L11
  [0, 0, 0, 0, 2, 0, 0, 0, 0], // L12
  [0, 0, 0, 0, 2, 0, 0, 0, 0], // L13
  [0, 0, 0, 0, 2, 0, 0, 0, 0], // L14
  [0, 0, 0, 0, 2, 0, 0, 0, 0], // L15
  [0, 0, 0, 0, 2, 0, 0, 0, 0], // L16
  [0, 0, 0, 0, 0, 2, 0, 0, 0], // L17
  [0, 0, 0, 0, 0, 2, 0, 0, 0], // L18
  [0, 0, 0, 0, 0, 2, 0, 0, 0], // L19
  [0, 0, 0, 0, 0, 0, 2, 0, 0], // L20
];

/** Get max spell slots for a character level + spellcasting type. Returns 9-element array. */
export function maxSpellSlots(level: number, type: SpellcastingType): number[] {
  const idx = Math.max(0, Math.min(19, level - 1));
  const table =
    type === 'half'
      ? SPELL_SLOTS_HALF
      : type === 'pact'
        ? SPELL_SLOTS_PACT
        : type === 'artificier'
          ? SPELL_SLOTS_ARTIFICIER
          : SPELL_SLOTS_FULL;
  return table[idx] ?? [0, 0, 0, 0, 0, 0, 0, 0, 0];
}

/** Spell save DC: 8 + casting ability modifier + proficiency bonus. */
export function spellSaveDC(castingMod: number, profBonus: number): number {
  return 8 + castingMod + profBonus;
}

/** Passive perception: 10 + WIS mod + proficiency bonus (×2 with expertise). */
export function passivePerception(
  wisMod: number,
  profBonus: number,
  proficiency: ProficiencyLevel,
): number {
  return 10 + wisMod + (proficiency > 0 ? profBonus * proficiency : 0);
}

// ---------- Armor Class (CA) computation ----------

export interface ArmorClassResult {
  ac: number;
  /** Human-readable source, e.g. "Cuirasse · DEX +2" or "Sans armure · 10 + DEX" */
  source: string;
  /** Whether a shield is equipped */
  hasShield: boolean;
}

/**
 * Compute Armor Class from equipped armor items + DEX modifier.
 * Armor type detection by strMin and acBase:
 *   - Heavy (strMin >= 13): acBase, no DEX
 *   - Medium (acBase 12-15): acBase + min(DEX, 2)
 *   - Light (acBase <= 12): acBase + DEX
 * Magic armor (acBase null) resolves to its mundane base + magic bonus,
 * like magic weapons. defenseStyle: +1 CA from the Défense fighting style.
 */
export function computeAC(
  entries: Array<{
    item: {
      category: string;
      acBase: number | null;
      strMin: number | null;
      nameFr: string | null;
      name: string;
      description?: string | null;
    };
    equipped: boolean;
  }>,
  dexMod: number,
  defenseStyle = false,
  character?: { constitution?: number; wisdom?: number; characterClass?: string | null },
): ArmorClassResult {
  // Find equipped armor (non-shield) and shield
  let armor: { acBase: number; armorType: 'light' | 'medium' | 'heavy'; name: string } | null =
    null;
  let hasShield = false;
  let magicAcBonus = 0;

  for (const entry of entries) {
    if (!entry.equipped) continue;
    if (entry.item.category !== 'armor') continue;
    const name = (entry.item.nameFr ?? entry.item.name).toLowerCase();

    // Magic armor: resolve its mundane base (+ bonus) before the acBase filter
    let acBase = entry.item.acBase;
    let base: MundaneArmor | null = null;
    let magicBonus = 0;
    if (acBase === null || acBase === 0) {
      const magic = resolveMagicArmorBase(entry.item);
      if (magic.shield) {
        hasShield = true;
        continue;
      }
      if (!magic.base) continue; // family armor (légère/intermédiaire/lourde): base unknowable
      acBase = magic.base.acBase;
      base = magic.base;
      magicBonus = magic.magicBonus;
    } else {
      // Mundane armor: look up its true type (acBase 12 is studded-leather
      // light AND hide medium — the value alone can't tell them apart)
      base = findMundaneArmorByName(entry.item.name, entry.item.nameFr);
    }

    // Shield gives +2 and is tracked separately
    if (base?.armorType === 'shield' || name.includes('bouclier') || name.includes('shield')) {
      hasShield = true;
      continue;
    }
    // First equipped armor piece wins
    if (!armor) {
      armor = {
        acBase,
        armorType:
          base && base.armorType !== 'shield'
            ? base.armorType
            : entry.item.strMin !== null && entry.item.strMin >= 13
              ? 'heavy'
              : acBase >= 13 && acBase <= 15
                ? 'medium'
                : 'light',
        name: entry.item.nameFr ?? entry.item.name,
      };
      magicAcBonus = magicBonus;
    }
  }

  let ac: number;
  let source: string;

  if (!armor) {
    // Unarmored: 10 + DEX, or a class Unarmored Defense (SRD):
    //   Barbare — 10 + DEX + CON (shield allowed)
    //   Moine   — 10 + DEX + WIS (only without a shield)
    const cls = character ? findClass(character.characterClass)?.name : null;
    if (cls === 'Barbare') {
      const conMod = abilityModifier(character?.constitution ?? 10);
      ac = 10 + dexMod + conMod;
      source = `Sans armure · 10 ${formatModifier(dexMod)} ${formatModifier(conMod)} (Barbare)`;
    } else if (cls === 'Moine' && !hasShield) {
      const wisMod = abilityModifier(character?.wisdom ?? 10);
      ac = 10 + dexMod + wisMod;
      source = `Sans armure · 10 ${formatModifier(dexMod)} ${formatModifier(wisMod)} (Moine)`;
    } else {
      ac = 10 + dexMod;
      source = `Sans armure · 10 ${formatModifier(dexMod)}`;
    }
  } else {
    const isHeavy = armor.armorType === 'heavy';
    const isMedium = armor.armorType === 'medium';
    // Light: acBase + full DEX; Medium: acBase + min(DEX, 2); Heavy: acBase only
    if (isHeavy) {
      ac = armor.acBase;
      source = `${armor.name} · ${armor.acBase}`;
    } else if (isMedium) {
      const dexBonus = Math.min(dexMod, 2);
      ac = armor.acBase + dexBonus;
      source = `${armor.name} · ${armor.acBase} ${formatModifier(dexBonus)}`;
    } else {
      ac = armor.acBase + dexMod;
      source = `${armor.name} · ${armor.acBase} ${formatModifier(dexMod)}`;
    }
    if (magicAcBonus > 0) {
      ac += magicAcBonus;
      source += ` +${magicAcBonus}`;
    }
  }

  if (hasShield) {
    ac += 2;
    source += ' · Bouclier +2';
  }

  // Défense fighting style: +1 while wearing armor
  if (defenseStyle && armor) {
    ac += 1;
    source += ' · Défense +1';
  }

  return { ac, source, hasShield };
}

// ---------- Fighting styles (SRD) ----------

export type FightingStyle = 'archery' | 'defense' | 'dueling' | 'great-weapon' | 'two-weapon';

export const FIGHTING_STYLE_LABELS_FR: Record<FightingStyle, string> = {
  archery: 'Archérie (+2 att. à distance)',
  defense: 'Défense (+1 CA)',
  dueling: 'Duel (+2 dégâts arme à une main)',
  'great-weapon': 'Armes à deux mains',
  'two-weapon': 'Combat à deux armes',
};

/** Classes that can pick a fighting style (SRD). */
export const FIGHTING_STYLE_CLASSES: readonly string[] = ['Guerrier', 'Paladin', 'Rôdeur'];

// ---------- Weapon attack & damage computation (SRD combat rules) ----------

/** French labels for SRD weapon properties. */
export const WEAPON_PROPERTY_LABELS_FR: Record<string, string> = {
  light: 'Légère',
  finesse: 'Finesse',
  thrown: 'Lancer',
  'two-handed': 'À deux mains',
  versatile: 'Polyvalente',
  ammunition: 'Munitions',
  loading: 'Rechargement',
  heavy: 'Lourde',
  reach: 'Allonge',
  special: 'Spéciale',
};

/** French labels for damage types (keys match item damageType: capitalized English). */
export const DAMAGE_TYPE_LABELS_FR: Record<string, string> = {
  Bludgeoning: 'contondants',
  Piercing: 'perforants',
  Slashing: 'tranchants',
  Fire: 'de feu',
  Cold: 'de froid',
  Lightning: 'de foudre',
  Thunder: 'de tonnerre',
  Acid: "d'acide",
  Poison: 'de poison',
  Necrotic: 'nécrotiques',
  Radiant: 'radiants',
  Force: 'de force',
  Psychic: 'psychiques',
};

/** One SRD mundane weapon. nameEn/nameFr match the item catalog exactly. */
export interface MundaneWeapon {
  nameEn: string;
  nameFr: string;
  dice: string;
  damageType: string; // capitalized English, matches item.damageType
  properties: string[];
  simple: boolean; // false = martial
  /** Two-handed dice for versatile weapons. */
  twoHandedDice?: string;
}

/** The 37 SRD mundane weapons (names as they appear in the item catalog). */
export const MUNDANE_WEAPONS: MundaneWeapon[] = [
  // Simple melee
  {
    nameEn: 'Club',
    nameFr: 'Gourdin',
    dice: '1d4',
    damageType: 'Bludgeoning',
    properties: ['light'],
    simple: true,
  },
  {
    nameEn: 'Dagger',
    nameFr: 'Dague',
    dice: '1d4',
    damageType: 'Piercing',
    properties: ['finesse', 'light', 'thrown'],
    simple: true,
  },
  {
    nameEn: 'Greatclub',
    nameFr: 'Massue',
    dice: '1d8',
    damageType: 'Bludgeoning',
    properties: ['two-handed'],
    simple: true,
  },
  {
    nameEn: 'Handaxe',
    nameFr: 'Hachette',
    dice: '1d6',
    damageType: 'Slashing',
    properties: ['light', 'thrown'],
    simple: true,
  },
  {
    nameEn: 'Javelin',
    nameFr: 'Javeline',
    dice: '1d6',
    damageType: 'Piercing',
    properties: ['thrown'],
    simple: true,
  },
  {
    nameEn: 'Light hammer',
    nameFr: 'Marteau léger',
    dice: '1d4',
    damageType: 'Bludgeoning',
    properties: ['light', 'thrown'],
    simple: true,
  },
  {
    nameEn: 'Mace',
    nameFr: "Masse d'armes",
    dice: '1d6',
    damageType: 'Bludgeoning',
    properties: [],
    simple: true,
  },
  {
    nameEn: 'Quarterstaff',
    nameFr: 'Bâton',
    dice: '1d6',
    damageType: 'Bludgeoning',
    properties: ['versatile'],
    simple: true,
    twoHandedDice: '1d8',
  },
  {
    nameEn: 'Sickle',
    nameFr: 'Serpe',
    dice: '1d4',
    damageType: 'Slashing',
    properties: ['light'],
    simple: true,
  },
  {
    nameEn: 'Spear',
    nameFr: 'Lance',
    dice: '1d6',
    damageType: 'Piercing',
    properties: ['thrown', 'versatile'],
    simple: true,
    twoHandedDice: '1d8',
  },
  // Simple ranged
  {
    nameEn: 'Crossbow, light',
    nameFr: 'Arbalète légère',
    dice: '1d8',
    damageType: 'Piercing',
    properties: ['ammunition', 'loading', 'two-handed'],
    simple: true,
  },
  {
    nameEn: 'Dart',
    nameFr: 'Fléchette',
    dice: '1d4',
    damageType: 'Piercing',
    properties: ['finesse', 'thrown'],
    simple: true,
  },
  {
    nameEn: 'Shortbow',
    nameFr: 'Arc court',
    dice: '1d6',
    damageType: 'Piercing',
    properties: ['ammunition', 'two-handed'],
    simple: true,
  },
  {
    nameEn: 'Sling',
    nameFr: 'Fronde',
    dice: '1d4',
    damageType: 'Bludgeoning',
    properties: ['ammunition'],
    simple: true,
  },
  // Martial melee
  {
    nameEn: 'Battleaxe',
    nameFr: "Hache d'armes",
    dice: '1d8',
    damageType: 'Slashing',
    properties: ['versatile'],
    simple: false,
    twoHandedDice: '1d10',
  },
  {
    nameEn: 'Flail',
    nameFr: 'Fléau',
    dice: '1d8',
    damageType: 'Bludgeoning',
    properties: [],
    simple: false,
  },
  {
    nameEn: 'Glaive',
    nameFr: 'Coutille',
    dice: '1d10',
    damageType: 'Slashing',
    properties: ['heavy', 'reach', 'two-handed'],
    simple: false,
  },
  {
    nameEn: 'Greataxe',
    nameFr: 'Hache à deux mains',
    dice: '1d12',
    damageType: 'Slashing',
    properties: ['heavy', 'two-handed'],
    simple: false,
  },
  {
    nameEn: 'Greatsword',
    nameFr: 'Épée à deux mains',
    dice: '2d6',
    damageType: 'Slashing',
    properties: ['heavy', 'two-handed'],
    simple: false,
  },
  {
    nameEn: 'Halberd',
    nameFr: 'Hallebarde',
    dice: '1d10',
    damageType: 'Slashing',
    properties: ['heavy', 'reach', 'two-handed'],
    simple: false,
  },
  {
    nameEn: 'Lance',
    nameFr: "Lance d'arçon",
    dice: '1d12',
    damageType: 'Piercing',
    properties: ['reach', 'special'],
    simple: false,
  },
  {
    nameEn: 'Longsword',
    nameFr: 'Épée longue',
    dice: '1d8',
    damageType: 'Slashing',
    properties: ['versatile'],
    simple: false,
    twoHandedDice: '1d10',
  },
  {
    nameEn: 'Maul',
    nameFr: 'Maillet',
    dice: '2d6',
    damageType: 'Bludgeoning',
    properties: ['heavy', 'two-handed'],
    simple: false,
  },
  {
    nameEn: 'Morningstar',
    nameFr: 'Morgenstern',
    dice: '1d8',
    damageType: 'Piercing',
    properties: [],
    simple: false,
  },
  {
    nameEn: 'Pike',
    nameFr: 'Pique',
    dice: '1d10',
    damageType: 'Piercing',
    properties: ['heavy', 'reach', 'two-handed'],
    simple: false,
  },
  {
    nameEn: 'Rapier',
    nameFr: 'Rapière',
    dice: '1d8',
    damageType: 'Piercing',
    properties: ['finesse'],
    simple: false,
  },
  {
    nameEn: 'Scimitar',
    nameFr: 'Cimeterre',
    dice: '1d6',
    damageType: 'Slashing',
    properties: ['finesse', 'light'],
    simple: false,
  },
  {
    nameEn: 'Shortsword',
    nameFr: 'Épée courte',
    dice: '1d6',
    damageType: 'Piercing',
    properties: ['finesse', 'light'],
    simple: false,
  },
  {
    nameEn: 'Trident',
    nameFr: 'Trident',
    dice: '1d6',
    damageType: 'Piercing',
    properties: ['thrown', 'versatile'],
    simple: false,
    twoHandedDice: '1d8',
  },
  {
    nameEn: 'War pick',
    nameFr: 'Pic de guerre',
    dice: '1d8',
    damageType: 'Piercing',
    properties: [],
    simple: false,
  },
  {
    nameEn: 'Warhammer',
    nameFr: 'Marteau de guerre',
    dice: '1d8',
    damageType: 'Bludgeoning',
    properties: ['versatile'],
    simple: false,
    twoHandedDice: '1d10',
  },
  {
    nameEn: 'Whip',
    nameFr: 'Fouet',
    dice: '1d4',
    damageType: 'Slashing',
    properties: ['finesse', 'reach'],
    simple: false,
  },
  // Martial ranged
  {
    nameEn: 'Blowgun',
    nameFr: 'Sarbacane',
    dice: '1',
    damageType: 'Piercing',
    properties: ['ammunition', 'loading'],
    simple: false,
  },
  {
    nameEn: 'Crossbow, hand',
    nameFr: 'Arbalète de poing',
    dice: '1d6',
    damageType: 'Piercing',
    properties: ['ammunition', 'light', 'loading'],
    simple: false,
  },
  {
    nameEn: 'Crossbow, heavy',
    nameFr: 'Arbalète lourde',
    dice: '1d10',
    damageType: 'Piercing',
    properties: ['ammunition', 'heavy', 'loading', 'two-handed'],
    simple: false,
  },
  {
    nameEn: 'Longbow',
    nameFr: 'Arc long',
    dice: '1d8',
    damageType: 'Piercing',
    properties: ['ammunition', 'heavy', 'two-handed'],
    simple: false,
  },
  {
    nameEn: 'Net',
    nameFr: 'Filet',
    dice: '',
    damageType: 'Slashing',
    properties: ['thrown', 'special'],
    simple: false,
  },
];

/** Weapon proficiency profile for a class (SRD). */
export interface WeaponProficiencySet {
  simple: boolean;
  martial: boolean;
  /** Specific weapons (English item names) granted beyond simple/martial. */
  specific: string[];
}

export const CLASS_WEAPON_PROFICIENCIES: Record<string, WeaponProficiencySet> = {
  Artificier: { simple: true, martial: false, specific: [] },
  Barbare: { simple: true, martial: true, specific: [] },
  Barde: {
    simple: true,
    martial: false,
    specific: ['Crossbow, hand', 'Longsword', 'Rapier', 'Shortsword'],
  },
  Clerc: { simple: true, martial: false, specific: [] },
  Druide: {
    simple: false,
    martial: false,
    specific: ['Club', 'Dagger', 'Dart', 'Quarterstaff', 'Scimitar', 'Sickle', 'Sling', 'Spear'],
  },
  Ensorceleur: {
    simple: false,
    martial: false,
    specific: ['Dagger', 'Dart', 'Sling', 'Quarterstaff', 'Crossbow, light'],
  },
  Guerrier: { simple: true, martial: true, specific: [] },
  Magicien: {
    simple: false,
    martial: false,
    specific: ['Dagger', 'Dart', 'Sling', 'Quarterstaff', 'Crossbow, light'],
  },
  Moine: { simple: true, martial: false, specific: ['Shortsword'] },
  Occultiste: { simple: true, martial: false, specific: ['Crossbow, light'] },
  Paladin: { simple: true, martial: true, specific: [] },
  Rôdeur: { simple: true, martial: true, specific: [] },
  Roublard: {
    simple: true,
    martial: false,
    specific: ['Crossbow, hand', 'Longsword', 'Rapier', 'Shortsword'],
  },
};

/** Class default weapon proficiencies (SRD). Unknown class → nothing. */
export function classWeaponProficiencies(
  className: string | null | undefined,
): WeaponProficiencySet {
  const cls = findClass(className);
  if (!cls) return { simple: false, martial: false, specific: [] };
  return CLASS_WEAPON_PROFICIENCIES[cls.name] ?? { simple: false, martial: false, specific: [] };
}

/**
 * Effective weapon proficiencies for a character: the explicit list
 * (weaponProficiencies tokens: 'simple', 'martial', or English weapon names)
 * when set, otherwise the class default.
 */
export function effectiveWeaponProficiencies(character: {
  characterClass?: string | null;
  weaponProficiencies?: string[] | null;
}): WeaponProficiencySet {
  if (character.weaponProficiencies != null) {
    const tokens = character.weaponProficiencies;
    return {
      simple: tokens.includes('simple'),
      martial: tokens.includes('martial'),
      specific: tokens.filter((t) => t !== 'simple' && t !== 'martial'),
    };
  }
  return classWeaponProficiencies(character.characterClass);
}

/** Is the character proficient with this weapon? (Magic weapons follow their base weapon.) */
export function isProficientWithWeapon(
  item: Pick<
    Item,
    'category' | 'name' | 'nameFr' | 'properties' | 'damageDice' | 'damageType' | 'description'
  >,
  character: { characterClass?: string | null; weaponProficiencies?: string[] | null },
): boolean {
  if (item.category !== 'weapon') return false;
  // Resolve the effective weapon name: the base weapon for magic items
  let nameEn = item.name;
  if (!item.damageDice) {
    const magic = resolveMagicWeaponBase(item);
    if (magic.base) nameEn = magic.base.nameEn;
  }
  const prof = effectiveWeaponProficiencies(character);
  const base = findMundaneByName(nameEn, item.nameFr);
  const simple = base ? base.simple : isSimpleWeaponName(nameEn);
  if (prof.martial && !simple) return true;
  if (prof.simple && simple) return true;
  return prof.specific.includes(nameEn);
}

function isSimpleWeaponName(nameEn: string): boolean {
  const w = MUNDANE_WEAPONS.find((m) => m.nameEn === nameEn);
  return w ? w.simple : false;
}

/** Find a mundane weapon by exact English or French name. */
export function findMundaneByName(
  nameEn: string | null | undefined,
  nameFr: string | null | undefined,
): MundaneWeapon | null {
  if (nameEn) {
    const byEn = MUNDANE_WEAPONS.find((m) => m.nameEn.toLowerCase() === nameEn.toLowerCase());
    if (byEn) return byEn;
  }
  if (nameFr) {
    const byFr = MUNDANE_WEAPONS.find((m) => m.nameFr.toLowerCase() === nameFr.toLowerCase());
    if (byFr) return byFr;
  }
  return null;
}

/** Result of resolving a magic weapon to its base weapon + magic bonus. */
export interface MagicWeaponBase {
  base: MundaneWeapon | null;
  /** True when the base is a family default (e.g. "n'importe quelle épée" → épée longue). */
  presumed: boolean;
  /** Flat attack & damage bonus (+1/+2/+3), 0 when none. */
  magicBonus: number;
}

/**
 * Resolve a magic weapon (damageDice null) to its base weapon and magic bonus.
 *
 * Detection order:
 *  1. Exact mundane name (EN or FR, word-boundary) inside the item name
 *     (e.g. "Dague venimeuse" → Dague).
 *  2. The French SRD description header `Arme (<base>)` — specific bases
 *     (épée longue, marteau de guerre…) or families with a presumed default
 *     (n'importe quelle épée → épée longue, hache → hache d'armes, masse → masse d'armes).
 *  3. Magic bonus: "+N" in the name, or "bonus de +N aux jets d'attaque et
 *     de dégâts" in the description.
 */
export function resolveMagicWeaponBase(
  item: Pick<Item, 'name' | 'nameFr' | 'description' | 'properties' | 'damageDice'>,
): MagicWeaponBase {
  const result: MagicWeaponBase = { base: null, presumed: false, magicBonus: 0 };

  // Magic bonus from name ("Arme +2") or description
  const nameBonus = (item.name ?? '').match(/\+(\d)/);
  if (nameBonus) result.magicBonus = parseInt(nameBonus[1], 10);
  if (result.magicBonus === 0 && item.description) {
    // Accept both straight (') and typographic (’) apostrophes
    const descBonus = item.description.match(/bonus de \+(\d+) aux jets d['’]attaque et de dégâts/);
    if (descBonus) result.magicBonus = parseInt(descBonus[1], 10);
  }

  // 1. Word-boundary name match against mundane weapons (longest names first)
  const haystack = `${item.name ?? ''} ${item.nameFr ?? ''}`.toLowerCase();
  const candidates = [...MUNDANE_WEAPONS].sort((a, b) => b.nameFr.length - a.nameFr.length);
  for (const m of candidates) {
    const en = escapeRegExp(m.nameEn.toLowerCase());
    const fr = escapeRegExp(m.nameFr.toLowerCase());
    if (
      new RegExp(`(^|[^a-zà-öø-ÿ])${en}([^a-zà-öø-ÿ]|$)`).test(haystack) ||
      new RegExp(`(^|[^a-zà-öø-ÿ])${fr}([^a-zà-öø-ÿ]|$)`).test(haystack)
    ) {
      result.base = m;
      return result;
    }
  }

  // 2. Description header: "Arme (<base>)"
  const header = item.description?.match(/^Arme \(([^)]+)\)/i)?.[1]?.toLowerCase() ?? '';
  if (header) {
    const specific: Record<string, string> = {
      dague: 'Dagger',
      javeline: 'Javelin',
      'arc long': 'Longbow',
      cimeterre: 'Scimitar',
      'épée longue': 'Longsword',
      trident: 'Trident',
      'marteau de guerre': 'Warhammer',
      "masse d'armes": 'Mace',
    };
    for (const [needle, nameEn] of Object.entries(specific)) {
      if (header.includes(needle)) {
        result.base = MUNDANE_WEAPONS.find((m) => m.nameEn === nameEn) ?? null;
        return result;
      }
    }
    // Families → presumed defaults
    if (header.includes('épée')) {
      result.base = MUNDANE_WEAPONS.find((m) => m.nameEn === 'Longsword') ?? null;
      result.presumed = true;
    } else if (header.includes('hache')) {
      result.base = MUNDANE_WEAPONS.find((m) => m.nameEn === 'Battleaxe') ?? null;
      result.presumed = true;
    } else if (header.includes('masse')) {
      result.base = MUNDANE_WEAPONS.find((m) => m.nameEn === 'Mace') ?? null;
      result.presumed = true;
    }
  }

  return result;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Computed attack & damage stats for a weapon, from SRD combat rules. */
export interface WeaponAttackStats {
  proficient: boolean;
  /** Ability used for attack & damage. */
  ability: 'strength' | 'dexterity';
  /** d20 attack bonus (ability mod + proficiency if proficient + magic bonus). */
  attackBonus: number;
  /** Damage with modifier & magic bonus, e.g. "2d6+3" (empty when the weapon has no dice, e.g. filet). */
  damageStr: string | null;
  damageTypeFr: string | null;
  /** Two-handed variant for versatile weapons, e.g. "1d10+3". */
  versatileDamageStr: string | null;
  /** Flat magic bonus (+1/+2/+3), 0 for mundane weapons. */
  magicBonus: number;
  /** True when the base weapon was inferred from a family (magic items). */
  presumedBase: boolean;
  /** Moine: the martial arts die replaced the weapon's damage die (SRD). */
  martialArtsDie: boolean;
  ranged: boolean;
  finesse: boolean;
}

function formatDiceWithMod(dice: string, mod: number): string | null {
  if (dice === '') return null;
  if (mod === 0) return dice;
  return mod > 0 ? `${dice}+${mod}` : `${dice}${mod}`;
}

/**
 * Compute attack & damage stats for a weapon item given the character.
 *
 * SRD rules: attack = d20 + ability modifier + proficiency (if proficient) + magic bonus.
 * Ability: melee → STR, ranged (ammunition) → DEX, finesse (and monk weapons for Monks)
 * → best of STR/DEX, thrown without finesse → STR.
 * Damage = weapon dice + same ability modifier (+ magic bonus).
 * Returns null for non-weapons or weapons with no dice and no resolvable base.
 */
export function computeWeaponStats(
  item: Pick<
    Item,
    'category' | 'name' | 'nameFr' | 'description' | 'properties' | 'damageDice' | 'damageType'
  >,
  character: Pick<Character, 'strength' | 'dexterity' | 'level' | 'characterClass'> & {
    weaponProficiencies?: string[] | null;
    fightingStyle?: FightingStyle | null;
  },
): WeaponAttackStats | null {
  if (item.category !== 'weapon') return null;

  // Magic weapons: resolve base weapon + bonus
  let dice: string | null = item.damageDice;
  let damageType = item.damageType;
  let props = item.properties;
  let magicBonus = 0;
  let presumedBase = false;
  let nameEn = item.name;

  if (!dice) {
    const magic = resolveMagicWeaponBase(item);
    if (!magic.base) return null;
    dice = magic.base.dice;
    damageType = magic.base.damageType;
    props = magic.base.properties;
    magicBonus = magic.magicBonus;
    presumedBase = magic.presumed;
    nameEn = magic.base.nameEn;
  }

  const strMod = abilityModifier(character.strength ?? 10);
  const dexMod = abilityModifier(character.dexterity ?? 10);
  const ranged = props.includes('ammunition');
  const finesse = props.includes('finesse');
  // Monk weapons (martial arts): STR or DEX for Monks
  const monkWeapon = props.includes('monk') || isMonkWeaponName(nameEn, item.nameFr);
  const isMonk = findClass(character.characterClass)?.name === 'Moine';

  // Martial arts: the monk's damage die replaces the weapon's when larger
  // ("You can roll a d4 in place of the normal damage of your unarmed
  // strike or monk weapon") — monk weapons are all single-die.
  let martialDieApplied = false;
  if (isMonk && monkWeapon && dice) {
    const mDie = martialArtsDie(character.level ?? 1);
    const w = dice.match(/^(\d+)d(\d+)$/);
    const m = mDie.match(/^(\d+)d(\d+)$/);
    if (
      w &&
      m &&
      parseInt(w[1], 10) === 1 &&
      parseInt(m[1], 10) === 1 &&
      parseInt(m[2], 10) > parseInt(w[2], 10)
    ) {
      dice = mDie;
      martialDieApplied = true;
    }
  }

  let ability: 'strength' | 'dexterity';
  if (finesse || (isMonk && monkWeapon)) {
    ability = dexMod >= strMod ? 'dexterity' : 'strength';
  } else if (ranged) {
    ability = 'dexterity';
  } else {
    ability = 'strength';
  }
  const abilityMod = ability === 'dexterity' ? dexMod : strMod;

  // Proficiency (magic weapons inherit the base weapon's category)
  const prof = effectiveWeaponProficiencies(character);
  const base = findMundaneByName(nameEn, item.nameFr);
  const simple = base ? base.simple : isSimpleWeaponName(nameEn);
  const proficient =
    (prof.martial && !simple) || (prof.simple && simple) || prof.specific.includes(nameEn);

  const attackBonus =
    abilityMod +
    (proficient ? proficiencyBonus(character.level ?? 1) : 0) +
    magicBonus +
    // Fighting style: Archery — +2 to attack rolls with ranged weapons
    (character.fightingStyle === 'archery' && ranged ? 2 : 0);

  // Fighting style: Dueling — +2 damage with a one-handed melee weapon
  // (the SRD "no other weapon" condition can't be checked per-item)
  const dueling = character.fightingStyle === 'dueling' && !ranged && !props.includes('two-handed');
  const damageStr = dice
    ? formatDiceWithMod(dice, abilityMod + magicBonus + (dueling ? 2 : 0))
    : null;
  const twoHanded =
    base?.twoHandedDice ?? MUNDANE_WEAPONS.find((m) => m.nameEn === nameEn)?.twoHandedDice;
  const versatileDamageStr =
    twoHanded && dice ? formatDiceWithMod(twoHanded, abilityMod + magicBonus) : null;

  return {
    proficient,
    ability,
    attackBonus,
    damageStr,
    damageTypeFr: damageType ? (DAMAGE_TYPE_LABELS_FR[damageType] ?? damageType) : null,
    versatileDamageStr,
    magicBonus,
    presumedBase,
    martialArtsDie: martialDieApplied,
    ranged,
    finesse,
  };
}

/** Monk weapon names (SRD martial arts: simple melee + shortsword, minus heavy/two-handed). */
function isMonkWeaponName(nameEn: string, nameFr: string | null): boolean {
  const m = findMundaneByName(nameEn, nameFr);
  if (!m) return false;
  if (!m.simple) return m.nameEn === 'Shortsword';
  // Simple melee weapons (no ammunition) that aren't two-handed
  return !m.properties.includes('ammunition') && !m.properties.includes('two-handed');
}

// ---------- Armor-dependent speed (SRD) ----------

/** Monk Unarmored Movement bonus (meters) by level: 3 at 2, 4.5 at 6, 6 at 10, 7.5 at 14, 9 at 18. */
export function unarmoredMovementBonus(level: number): number {
  if (level >= 18) return 9;
  if (level >= 14) return 7.5;
  if (level >= 10) return 6;
  if (level >= 6) return 4.5;
  if (level >= 2) return 3;
  return 0;
}

export interface SpeedResult {
  /** Effective speed in meters (base + modifiers). */
  speed: number;
  /** Net bonus applied, 0 when none (meters). */
  bonus: number;
  /** Human-readable modifier sources (class bonus, armor penalty…). */
  sources: string[];
}

/**
 * Effective speed with SRD armor-dependent class features:
 *  - Moine, Déplacement sans armure: +bonus while wearing no armor and no shield
 *  - Barbare, Déplacement rapide (level 5+): +3 m unless wearing heavy armor
 */
export function computeSpeed(
  character: { characterClass?: string | null; level?: number; speed?: number; strength?: number },
  entries: Array<{
    item: {
      category: string;
      acBase: number | null;
      strMin: number | null;
      nameFr: string | null;
      name: string;
      description?: string | null;
    };
    equipped: boolean;
  }>,
): SpeedResult {
  const base = character.speed ?? 9;
  const cls = findClass(character.characterClass)?.name;
  const level = character.level ?? 1;

  const worn = entries.filter((e) => {
    if (!e.equipped || e.item.category !== 'armor') return false;
    const name = (e.item.nameFr ?? e.item.name).toLowerCase();
    if (name.includes('bouclier') || name.includes('shield')) return false;
    if (e.item.acBase !== null && e.item.acBase !== 0) return true;
    // Magic armor counts as worn if it resolved to a non-shield base
    return resolveMagicArmorBase(e.item).base !== null;
  });
  const wearingArmor = worn.length > 0;
  const wearingHeavy = worn.some((e) => {
    if (e.item.acBase !== null && e.item.acBase !== 0) {
      const base = findMundaneArmorByName(e.item.name, e.item.nameFr);
      return base ? base.armorType === 'heavy' : e.item.strMin !== null && e.item.strMin >= 13;
    }
    return resolveMagicArmorBase(e.item).base?.armorType === 'heavy';
  });
  const hasShield = entries.some((e) => {
    if (!e.equipped || e.item.category !== 'armor') return false;
    const name = (e.item.nameFr ?? e.item.name).toLowerCase();
    if (name.includes('bouclier') || name.includes('shield')) return true;
    if (e.item.acBase === null || e.item.acBase === 0) return resolveMagicArmorBase(e.item).shield;
    return false;
  });

  const sources: string[] = [];
  let speed = base;

  if (cls === 'Moine' && !wearingArmor && !hasShield) {
    const bonus = unarmoredMovementBonus(level);
    if (bonus > 0) {
      speed += bonus;
      sources.push(`Déplacement sans armure +${bonus} m`);
    }
  } else if (cls === 'Barbare' && level >= 5 && !wearingHeavy) {
    speed += 3;
    sources.push('Déplacement rapide +3 m');
  }

  // SRD: heavy armor worn below its STR minimum costs 3 m of speed
  const heavyWorn = entries.filter((e) => {
    if (!e.equipped || e.item.category !== 'armor') return false;
    const name = (e.item.nameFr ?? e.item.name).toLowerCase();
    if (name.includes('bouclier') || name.includes('shield')) return false;
    if (e.item.acBase !== null && e.item.acBase !== 0) {
      const base = findMundaneArmorByName(e.item.name, e.item.nameFr);
      return base ? base.armorType === 'heavy' : e.item.strMin !== null && e.item.strMin >= 13;
    }
    return resolveMagicArmorBase(e.item).base?.armorType === 'heavy';
  });
  const strScore = character.strength ?? 10;
  const underStrMin = heavyWorn.some((e) => {
    if (e.item.acBase !== null && e.item.acBase !== 0) {
      return (e.item.strMin ?? 0) > strScore;
    }
    return (resolveMagicArmorBase(e.item).base?.strMin ?? 0) > strScore;
  });
  if (underStrMin) {
    speed -= 3;
    sources.push('Armure lourde −3 m (FOR insuffisante)');
  }

  return { speed, bonus: speed - base, sources };
}

// ---------- Spell damage at slot level (SRD scaling) ----------

/** Scaled damage for a spell at a chosen slot level (cantrips: character level). */
export interface SpellDamagePreview {
  /** Dice string, e.g. "9d6". Null when the spell has no damage data. */
  dice: string | null;
  /** French damage type, e.g. "de feu". */
  typeFr: string | null;
}

/** Lowercase English damage types from spell damageJson → French. */
const SPELL_DAMAGE_TYPE_FR: Record<string, string> = {
  fire: 'de feu',
  cold: 'de froid',
  lightning: 'de foudre',
  thunder: 'de tonnerre',
  acid: "d'acide",
  poison: 'de poison',
  necrotic: 'nécrotiques',
  radiant: 'radiants',
  force: 'de force',
  psychic: 'psychiques',
  bludgeoning: 'contondants',
  piercing: 'perforants',
  slashing: 'tranchants',
};

/**
 * Damage a spell deals at the chosen slot level (slotted spells) or the
 * character's level (cantrips), from damageJson's damage_at_slot_level /
 * damage_at_character_level tables. Picks the highest known key at or
 * below the requested level.
 */
export function spellDamageAtLevel(
  spell: { level: number; damageJson: string | null },
  slotLevel: number,
  charLevel: number,
): SpellDamagePreview {
  if (!spell.damageJson) return { dice: null, typeFr: null };
  try {
    const dmg = JSON.parse(spell.damageJson) as {
      damage_type?: { index?: string };
      damage_at_slot_level?: Record<string, string>;
      damage_at_character_level?: Record<string, string>;
    };
    const table = spell.level === 0 ? dmg.damage_at_character_level : dmg.damage_at_slot_level;
    if (!table) return { dice: null, typeFr: null };
    const wanted = spell.level === 0 ? charLevel : slotLevel;
    const keys = Object.keys(table)
      .map(Number)
      .sort((a, b) => a - b);
    const best = [...keys].reverse().find((k) => k <= Math.max(wanted, keys[0]));
    const typeEn = dmg.damage_type?.index ?? '';
    return {
      dice: best !== undefined ? (table[String(best)] ?? null) : null,
      typeFr: SPELL_DAMAGE_TYPE_FR[typeEn] ?? null,
    };
  } catch {
    return { dice: null, typeFr: null };
  }
}

// ---------- Divine domains (Clerc, SRD) ----------

export interface DivineDomainInfo {
  key: string;
  label: string;
  /** Spell level 1-5 → two English spell names (matched against the catalog). */
  spells: Record<number, [string, string]>;
}

/** The seven SRD cleric domains. Domain spells are always prepared and
 *  don't count against the prepared-spells limit. */
export const DIVINE_DOMAINS: DivineDomainInfo[] = [
  {
    key: 'savoir',
    label: 'Savoir',
    spells: {
      1: ['Command', 'Identify'],
      2: ['Augury', 'Suggestion'],
      3: ['Nondetection', 'Speak with Dead'],
      4: ['Arcane Eye', 'Confusion'],
      5: ['Legend Lore', 'Scrying'],
    },
  },
  {
    key: 'vie',
    label: 'Vie',
    spells: {
      1: ['Bless', 'Cure Wounds'],
      2: ['Lesser Restoration', 'Spiritual Weapon'],
      3: ['Beacon of Hope', 'Revivify'],
      4: ['Death Ward', 'Guardian of Faith'],
      5: ['Mass Cure Wounds', 'Raise Dead'],
    },
  },
  {
    key: 'lumiere',
    label: 'Lumière',
    spells: {
      1: ['Burning Hands', 'Faerie Fire'],
      2: ['Flaming Sphere', 'Scorching Ray'],
      3: ['Daylight', 'Fireball'],
      4: ['Guardian of Faith', 'Wall of Fire'],
      5: ['Flame Strike', 'Scrying'],
    },
  },
  {
    key: 'nature',
    label: 'Nature',
    spells: {
      1: ['Animal Friendship', 'Speak with Animals'],
      2: ['Barkskin', 'Spike Growth'],
      3: ['Plant Growth', 'Wind Wall'],
      4: ['Dominate Beast', 'Grasping Vine'],
      5: ['Insect Plague', 'Tree Stride'],
    },
  },
  {
    key: 'tempete',
    label: 'Tempête',
    spells: {
      1: ['Fog Cloud', 'Thunderwave'],
      2: ['Gust of Wind', 'Shatter'],
      3: ['Call Lightning', 'Sleet Storm'],
      4: ['Control Water', 'Ice Storm'],
      5: ['Destructive Wave', 'Insect Plague'],
    },
  },
  {
    key: 'tromperie',
    label: 'Tromperie',
    spells: {
      1: ['Charm Person', 'Disguise Self'],
      2: ['Mirror Image', 'Pass Without Trace'],
      3: ['Blink', 'Dispel Magic'],
      4: ['Dimension Door', 'Polymorph'],
      5: ['Dominate Person', 'Modify Memory'],
    },
  },
  {
    key: 'guerre',
    label: 'Guerre',
    spells: {
      1: ['Divine Favor', 'Shield of Faith'],
      2: ['Magic Weapon', 'Spiritual Weapon'],
      3: ['Crusader s mantle', 'Spirit Guardians'], // OCR: apostrophe lost in the catalog
      4: ['Freedom of Movement', 'Stoneskin'],
      5: ['Flame Strike', 'Hold Monster'],
    },
  },
];

/** Domain spell names unlocked at the given cleric level (spell level L unlocks at 2L−1). */
export function domainSpellsFor(
  domain: string | null | undefined,
  level: number,
): Array<{ level: number; names: string[] }> {
  if (!domain) return [];
  const info = DIVINE_DOMAINS.find((d) => d.key === domain);
  if (!info) return [];
  const out: Array<{ level: number; names: string[] }> = [];
  for (const lvl of [1, 2, 3, 4, 5]) {
    if (level >= 2 * lvl - 1) {
      out.push({ level: lvl, names: [...info.spells[lvl]] });
    }
  }
  return out;
}

// ---------- Circle spells (Druide, Terre) & Oath spells (Paladin, SRD) ----------

export interface LandCircleInfo {
  key: string;
  label: string;
  /** Spell level 2-5 → two English names; unlocked at druid levels 3/5/7/9. */
  spells: Record<number, [string, string]>;
}

/** Circle of the Land terrains — circle spells are always prepared (SRD). */
export const LAND_CIRCLES: LandCircleInfo[] = [
  {
    key: 'arctique',
    label: 'Arctique',
    spells: {
      2: ['Hold Person', 'Spike Growth'],
      3: ['Sleet Storm', 'Slow'],
      4: ['Freedom of Movement', 'Ice Storm'],
      5: ['Commune with Nature', 'Cone of Cold'],
    },
  },
  {
    key: 'littoral',
    label: 'Littoral',
    spells: {
      2: ['Mirror Image', 'Misty Step'],
      3: ['Water Breathing', 'Water Walk'],
      4: ['Control Water', 'Freedom of Movement'],
      5: ['Conjure Elemental', 'Scrying'],
    },
  },
  {
    key: 'desert',
    label: 'Désert',
    spells: {
      2: ['Blur', 'Silence'],
      3: ['Create Food and Water', 'Protection From Energy'],
      4: ['Blight', 'Hallucinatory Terrain'],
      5: ['Insect Plague', 'Wall of Stone'],
    },
  },
  {
    key: 'foret',
    label: 'Forêt',
    spells: {
      2: ['Barkskin', 'Spider Climb'],
      3: ['Call Lightning', 'Plant Growth'],
      4: ['Divination', 'Freedom of Movement'],
      5: ['Commune with Nature', 'Tree Stride'],
    },
  },
  {
    key: 'prairie',
    label: 'Prairie',
    spells: {
      2: ['Invisibility', 'Pass Without Trace'],
      3: ['Daylight', 'Haste'],
      4: ['Divination', 'Freedom of Movement'],
      5: ['Dream', 'Wall of Thorns'],
    },
  },
  {
    key: 'montagne',
    label: 'Montagne',
    spells: {
      2: ['Spider Climb', 'Spike Growth'],
      3: ['Lightning Bolt', 'Meld into Stone'],
      4: ['Stone Shape', 'Stoneskin'],
      5: ['Passwall', 'Wall of Stone'],
    },
  },
  {
    key: 'marais',
    label: 'Marais',
    spells: {
      2: ['Darkness', 'Acid Arrow'], // Acid Arrow = Flèche acide de Melf
      3: ['Water Walk', 'Stinking Cloud'],
      4: ['Freedom of Movement', 'Locate Creature'],
      5: ['Insect Plague', 'Scrying'],
    },
  },
  {
    key: 'outreterre',
    label: 'Outreterre',
    spells: {
      2: ['Spider Climb', 'Web'],
      3: ['Gaseous Form', 'Stinking Cloud'],
      4: ['Greater Invisibility', 'Stone Shape'],
      5: ['Cloudkill', 'Insect Plague'],
    },
  },
];

export interface SacredOathInfo {
  key: string;
  label: string;
  /** Spell level 1-5 → two English names; unlocked at paladin levels 3/5/9/13/17. */
  spells: Record<number, [string, string]>;
}

/** Paladin Sacred Oaths (SRD) — oath spells are always prepared. */
export const SACRED_OATHS: SacredOathInfo[] = [
  {
    key: 'devotion',
    label: 'Dévotion',
    spells: {
      1: ['Protection From Evil and Good', 'Sanctuary'],
      2: ['Aid', 'Zone of Truth'],
      3: ['Beacon of Hope', 'Dispel Magic'],
      4: ['Freedom of Movement', 'Guardian of Faith'],
      5: ['Commune', 'Flame Strike'],
    },
  },
  {
    key: 'anciennes',
    label: 'Anciennes',
    spells: {
      1: ['Ensnaring Strike', 'Speak with Animals'],
      2: ['Moonbeam', 'Misty Step'],
      3: ['Plant Growth', 'Protection From Energy'],
      4: ['Ice Storm', 'Freedom of Movement'],
      5: ['Commune with Nature', 'Tree Stride'],
    },
  },
  {
    key: 'vengeance',
    label: 'Vengeance',
    spells: {
      1: ['Bane', "Hunter's Mark"],
      2: ['Hold Person', 'Misty Step'],
      3: ['Haste', 'Protection From Energy'],
      4: ['Banishment', 'Dimension Door'],
      5: ['Hold Monster', 'Scrying'],
    },
  },
];

/**
 * Always-prepared bonus spells for druid (Circle of the Land terrain) or
 * paladin (Sacred Oath). Druid spell levels 2-5 unlock at levels 3/5/7/9;
 * paladin spell levels 1-5 unlock at levels 3/5/9/13/17.
 */
export function bonusPreparedSpells(
  cls: string | null | undefined,
  subclass: string | null | undefined,
  level: number,
): Array<{ level: number; names: string[] }> {
  if (!subclass) return [];
  const out: Array<{ level: number; names: string[] }> = [];
  if (cls === 'Druide') {
    const terrain = LAND_CIRCLES.find((t) => t.key === subclass);
    if (!terrain) return [];
    const unlock: Record<number, number> = { 2: 3, 3: 5, 4: 7, 5: 9 };
    for (const lvl of [2, 3, 4, 5]) {
      if (level >= unlock[lvl]) out.push({ level: lvl, names: [...terrain.spells[lvl]] });
    }
  } else if (cls === 'Paladin') {
    const oath = SACRED_OATHS.find((o) => o.key === subclass);
    if (!oath) return [];
    const unlock: Record<number, number> = { 1: 3, 2: 5, 3: 9, 4: 13, 5: 17 };
    for (const lvl of [1, 2, 3, 4, 5]) {
      if (level >= unlock[lvl]) out.push({ level: lvl, names: [...oath.spells[lvl]] });
    }
  }
  return out;
}

// ---------- Wild Shape (Druide, SRD) ----------

/**
 * Max beast CR by druid level: 1/4 (2-3), 1/2 (4-7), 1 (8+).
 * Circle of the Moon: level ÷ 3 rounded down, minimum 1 (Circle Forms).
 */
export function wildShapeMaxCR(level: number, circle?: string | null): number {
  if (circle === 'lune') return Math.max(1, Math.floor(level / 3));
  if (level >= 8) return 1;
  if (level >= 4) return 0.5;
  return 0.25;
}

/** Circle of the Moon, Elemental Wild Shape (level 10): the four SRD elementals. */
export const MOON_ELEMENTAL_SLUGS: readonly string[] = [
  'elementaire-de-l-air',
  'elementaire-de-l-eau',
  'elementaire-de-la-terre',
  'elementaire-du-feu',
];

export function wildShapeCanSwim(level: number): boolean {
  return level >= 4;
}

export function wildShapeCanFly(level: number): boolean {
  return level >= 8;
}

/** Wild Shape duration in hours (SRD: half the druid level, rounded down). */
export function wildShapeDurationHours(level: number): number {
  return Math.max(1, Math.floor(level / 2));
}

export interface WildShapeFormSummary {
  slug: string;
  nameFr: string | null;
  name: string;
  challengeRating: number;
  size: string | null;
  armorClass: number | null;
  hitPoints: number | null;
  hitDice: string | null;
  fly: boolean;
  swim: boolean;
  /** The druid has seen this beast before (SRD requirement). */
  seen?: boolean;
}

/**
 * Roll HP from a hit dice formula like "2d6+0" or "18d10+36".
 * Each die is rolled individually, then the flat bonus is added
 * (formulas already include the CON bonus in the flat part).
 * Falls back to the average HP when the formula can't be parsed.
 */
export function rollHitPoints(hitDice: string | null, avgHp: number, _conMod = 0): number {
  if (!hitDice) return Math.max(1, avgHp);
  const match = hitDice.match(/^(\d+)d(\d+)(?:([+-]\d+))?$/);
  if (!match) return Math.max(1, avgHp);
  const numDice = parseInt(match[1], 10);
  const dieSize = parseInt(match[2], 10);
  const flatBonus = match[3] ? parseInt(match[3], 10) : 0;
  let total = flatBonus;
  for (let i = 0; i < numDice; i++) {
    total += Math.floor(Math.random() * dieSize) + 1;
  }
  return Math.max(1, total);
}

// ---------- Sneak Attack & Extra Attack (SRD) ----------

/** Rogue Sneak Attack dice: one d6 per 2 levels (ceil). */
export function sneakAttackDice(level: number): string {
  return `${Math.ceil(level / 2)}d6`;
}

/**
 * Extra Attack: attacks per Attack action.
 * Guerrier 2/3/4 at levels 5/11/20; Barbare, Paladin, Rôdeur 2 at level 5.
 */
export function extraAttacks(characterClass: string | null | undefined, level: number): number {
  const cls = findClass(characterClass)?.name;
  if (cls === 'Guerrier') {
    if (level >= 20) return 4;
    if (level >= 11) return 3;
    if (level >= 5) return 2;
  } else if ((cls === 'Barbare' || cls === 'Paladin' || cls === 'Rôdeur') && level >= 5) {
    return 2;
  }
  return 1;
}

// ---------- Unarmed strikes (SRD) ----------

/** Monk martial arts damage die by level (d4 → d6 at 5 → d8 at 11 → d10 at 17). */
export function martialArtsDie(level: number): string {
  if (level >= 17) return '1d10';
  if (level >= 11) return '1d8';
  if (level >= 5) return '1d6';
  return '1d4';
}

/** Computed unarmed-strike stats (everyone can punch; monks use martial arts). */
export interface UnarmedStats {
  /** d20 attack bonus (ability mod + proficiency — everyone is proficient with unarmed strikes). */
  attackBonus: number;
  ability: 'strength' | 'dexterity';
  /** e.g. "1+2", or "1d4+3" for monks. */
  damageStr: string;
  damageTypeFr: string;
  /** True when the character is a Monk (martial arts die + DEX option). */
  monk: boolean;
  /** Monks: one extra unarmed strike as a bonus action after attacking. */
  bonusActionAttack: boolean;
}

/**
 * Unarmed strike, SRD rules: attack = ability mod + proficiency, damage
 * 1 + mod bludgeoning. Monks (Arts martiaux) use DEX if better and roll
 * their martial arts die (martialArtsDie) instead of the flat 1, and can
 * make one unarmed strike as a bonus action.
 */
export function computeUnarmedStats(
  character: Pick<Character, 'strength' | 'dexterity' | 'level' | 'characterClass'>,
): UnarmedStats {
  const strMod = abilityModifier(character.strength ?? 10);
  const dexMod = abilityModifier(character.dexterity ?? 10);
  const isMonk = findClass(character.characterClass)?.name === 'Moine';
  // Monks may use DEX for unarmed strikes; everyone else uses STR
  const ability: 'strength' | 'dexterity' = isMonk && dexMod >= strMod ? 'dexterity' : 'strength';
  const mod = ability === 'dexterity' ? dexMod : strMod;
  const prof = proficiencyBonus(character.level ?? 1);
  const dice = isMonk ? martialArtsDie(character.level ?? 1) : '1';
  return {
    attackBonus: mod + prof,
    ability,
    damageStr: formatDiceWithMod(dice, mod) ?? dice,
    damageTypeFr: 'contondants',
    monk: isMonk,
    bonusActionAttack: isMonk,
  };
}

// ---------- Magic armor base resolution (SRD) ----------

/** One SRD mundane armor (names match the item catalog). strMin: 0 = no minimum. */
export interface MundaneArmor {
  nameEn: string;
  nameFr: string;
  acBase: number;
  strMin: number;
  stealthDisadvantage: boolean;
  armorType: 'light' | 'medium' | 'heavy' | 'shield';
}

export const MUNDANE_ARMORS: MundaneArmor[] = [
  {
    nameEn: 'Padded Armor',
    nameFr: 'Matelassée',
    acBase: 11,
    strMin: 0,
    stealthDisadvantage: true,
    armorType: 'light',
  },
  {
    nameEn: 'Leather Armor',
    nameFr: 'Cuir',
    acBase: 11,
    strMin: 0,
    stealthDisadvantage: false,
    armorType: 'light',
  },
  {
    nameEn: 'Studded Leather Armor',
    nameFr: 'Cuir clouté',
    acBase: 12,
    strMin: 0,
    stealthDisadvantage: false,
    armorType: 'light',
  },
  {
    nameEn: 'Hide Armor',
    nameFr: 'Peaux',
    acBase: 12,
    strMin: 0,
    stealthDisadvantage: false,
    armorType: 'medium',
  },
  {
    nameEn: 'Chain Shirt',
    nameFr: 'Chemise de mailles',
    acBase: 13,
    strMin: 0,
    stealthDisadvantage: false,
    armorType: 'medium',
  },
  {
    nameEn: 'Scale Mail',
    nameFr: "Cotte d'écailles",
    acBase: 14,
    strMin: 0,
    stealthDisadvantage: true,
    armorType: 'medium',
  },
  {
    nameEn: 'Breastplate',
    nameFr: 'Cuirasse',
    acBase: 14,
    strMin: 0,
    stealthDisadvantage: false,
    armorType: 'medium',
  },
  {
    nameEn: 'Half Plate Armor',
    nameFr: 'Demi-plate',
    acBase: 15,
    strMin: 0,
    stealthDisadvantage: true,
    armorType: 'medium',
  },
  {
    nameEn: 'Ring Mail',
    nameFr: 'Broigne',
    acBase: 14,
    strMin: 0,
    stealthDisadvantage: true,
    armorType: 'heavy',
  },
  {
    nameEn: 'Chain Mail',
    nameFr: 'Cotte de mailles',
    acBase: 16,
    strMin: 13,
    stealthDisadvantage: true,
    armorType: 'heavy',
  },
  {
    nameEn: 'Splint Armor',
    nameFr: 'Clibanion',
    acBase: 17,
    strMin: 15,
    stealthDisadvantage: true,
    armorType: 'heavy',
  },
  {
    nameEn: 'Plate Armor',
    nameFr: 'Harnois',
    acBase: 18,
    strMin: 15,
    stealthDisadvantage: true,
    armorType: 'heavy',
  },
  {
    nameEn: 'Shield',
    nameFr: 'Bouclier',
    acBase: 2,
    strMin: 0,
    stealthDisadvantage: false,
    armorType: 'shield',
  },
];

/** Find a mundane armor by exact English or French name. */
export function findMundaneArmorByName(
  nameEn: string | null | undefined,
  nameFr: string | null | undefined,
): MundaneArmor | null {
  if (nameEn) {
    const byEn = MUNDANE_ARMORS.find((a) => a.nameEn.toLowerCase() === nameEn.toLowerCase());
    if (byEn) return byEn;
  }
  if (nameFr) {
    const byFr = MUNDANE_ARMORS.find((a) => a.nameFr.toLowerCase() === nameFr.toLowerCase());
    if (byFr) return byFr;
  }
  return null;
}

/** Result of resolving a magic armor to its base armor + AC bonus. */
export interface MagicArmorBase {
  base: MundaneArmor | null; // null: family armor (légère/intermédiaire/lourde) — base unknowable
  shield: boolean;
  /** Flat AC bonus (+1/+2/+3), 0 when none. */
  magicBonus: number;
}

/**
 * Resolve a magic armor (acBase null) to its base armor and magic AC bonus.
 *
 * Detection order (mirrors resolveMagicWeaponBase):
 *  1. Shield: name contains bouclier/shield, or the description header
 *     `Armure (bouclier)`.
 *  2. Exact mundane name (EN or FR, word-boundary, longest first).
 *  3. Description header `Armure (<base>)` — specific bases, including the
 *     synonyms "plates"/"armure de plates" → Harnois (Plate). Family headers
 *     (légère/intermédiaire/lourde) resolve to no base.
 *  4. Bonus: "+N" in the name, or "bonus de +N à la CA" in the description —
 *     excluding the conditional "+N à la CA contre …" (Bouclier attrape-flèches).
 */
export function resolveMagicArmorBase(
  item: Pick<Item, 'name' | 'nameFr' | 'description'>,
): MagicArmorBase {
  const result: MagicArmorBase = { base: null, shield: false, magicBonus: 0 };
  const header = item.description?.match(/^Armure \(([^)]+)\)/i)?.[1]?.toLowerCase() ?? '';
  const nameLower = `${item.name ?? ''} ${item.nameFr ?? ''}`.toLowerCase();

  // Shields
  if (
    nameLower.includes('bouclier') ||
    nameLower.includes('shield') ||
    header.includes('bouclier')
  ) {
    result.shield = true;
    result.base = MUNDANE_ARMORS.find((a) => a.armorType === 'shield') ?? null;
  }

  // Magic bonus: +N in the name, or "bonus de +N à la CA" (not the conditional "contre" variant)
  const nameBonus = (item.name ?? '').match(/\+(\d)/);
  if (nameBonus) result.magicBonus = parseInt(nameBonus[1], 10);
  if (result.magicBonus === 0 && item.description) {
    const descBonus = item.description.match(/bonus de \+(\d+) à la CA(?! contre)/i);
    if (descBonus) result.magicBonus = parseInt(descBonus[1], 10);
  }

  if (result.shield) return result;

  // Description header first — canonical and immune to French inflections
  // ("cuir cloutée" never word-matches "Cuir clouté" and would fall through
  // to the shorter base "Cuir")
  if (header) {
    const specific: Array<[string, string]> = [
      ["cotte d'écailles", 'Scale Mail'],
      ['chemise de mailles', 'Chain Shirt'],
      ['cuir clouté', 'Studded Leather Armor'],
      ['plates', 'Plate Armor'],
    ];
    for (const [needle, nameEn] of specific) {
      if (header.includes(needle)) {
        result.base = MUNDANE_ARMORS.find((a) => a.nameEn === nameEn) ?? null;
        return result;
      }
    }
    // Family headers (légère / intermédiaire ou lourde) → fall through to
    // name matching, then no base
  }

  // Exact mundane name (longest FR names first, word boundaries)
  const candidates = [...MUNDANE_ARMORS]
    .filter((a) => a.armorType !== 'shield')
    .sort((a, b) => b.nameFr.length - a.nameFr.length);
  for (const a of candidates) {
    const en = escapeRegExp(a.nameEn.toLowerCase());
    const fr = escapeRegExp(a.nameFr.toLowerCase());
    if (
      new RegExp(`(^|[^a-zà-öø-ÿ])${en}([^a-zà-öø-ÿ]|$)`).test(nameLower) ||
      new RegExp(`(^|[^a-zà-öø-ÿ])${fr}([^a-zà-öø-ÿ]|$)`).test(nameLower)
    ) {
      result.base = a;
      return result;
    }
  }

  return result;
}

// ---------- Spells (SRD catalog) ----------

export type SpellSchool =
  | 'abjuration'
  | 'conjuration'
  | 'divination'
  | 'enchantment'
  | 'evocation'
  | 'illusion'
  | 'necromancy'
  | 'transmutation';

export const SPELL_SCHOOL_LABELS_FR: Record<SpellSchool, string> = {
  abjuration: 'Abjuration',
  conjuration: 'Invocation',
  divination: 'Divination',
  enchantment: 'Enchantement',
  evocation: 'Évocation',
  illusion: 'Illusion',
  necromancy: 'Nécromancie',
  transmutation: 'Transmutation',
};

export interface Spell {
  id: number;
  srdIndex: string;
  name: string;
  nameFr: string | null;
  level: number; // 0-9 (0 = cantrip)
  school: SpellSchool;
  castingTime: string | null;
  rangeText: string | null;
  components: string[]; // ["V","S","M"]
  material: string | null;
  duration: string | null;
  concentration: boolean;
  ritual: boolean;
  description: string | null;
  descriptionFr: string | null;
  higherLevel: string | null;
  higherLevelFr: string | null;
  attackType: string | null; // "ranged"/"melee" or null
  damageJson: string | null;
  dcJson: string | null;
  classes: string[]; // French class names: ["Magicien","Ensorceleur"]
}

export interface CharacterSpell {
  id: number; // character_spells.id
  characterId: number;
  spell: Spell;
  prepared: boolean;
  sortOrder: number;
  addedAt: string;
}

// ---------- Character features (free-form traits with templating) ----------

export type FeatureCategory = 'class' | 'racial' | 'background' | 'feat' | 'custom';

export interface CharacterFeature {
  id: number;
  characterId: number;
  title: string;
  category: FeatureCategory;
  description: string | null; // template text with {{variables}}
  counterMax: number | null; // null/0 = no counter; positive = max charges
  counterCurrent: number | null;
  sortOrder: number;
  createdAt: string;
}

export interface CreateCharacterFeaturePayload {
  title: string;
  category?: FeatureCategory;
  description?: string;
  counterMax?: number;
}

export interface PatchCharacterFeaturePayload {
  title?: string;
  category?: FeatureCategory;
  description?: string | null;
  counterMax?: number | null;
  counterCurrent?: number | null;
}

export const FEATURE_CATEGORY_LABELS_FR: Record<FeatureCategory, string> = {
  class: 'Classe',
  racial: 'Race',
  background: 'Historique',
  feat: 'Don',
  custom: 'Personnalisé',
};

/**
 * Render a feature template by replacing {{variable}} tokens with computed
 * values from the character's stats. Unknown variables are left as-is.
 *
 * Supported variables:
 *   {{name}} {{level}} {{class}} {{race}} {{background}} {{speed}} {{max_hp}}
 *   {{prof}} {{initiative}} {{passive_perception}} {{save_dc}} {{spell_attack}}
 *   {{str}} {{dex}} {{con}} {{int}} {{wis}} {{cha}}
 *   {{str_mod}} {{dex_mod}} {{con_mod}} {{int_mod}} {{wis_mod}} {{cha_mod}}
 *   {{save:str}} {{save:dex}} {{save:con}} {{save:int}} {{save:wis}} {{save:cha}}
 *   {{skill:athletics}} {{skill:perception}} {{skill:arcanes}} ... (18 skills)
 */
export function renderFeatureTemplate(text: string, character: Character): string {
  if (!text) return text;

  const level = character.level ?? 1;
  const prof = proficiencyBonus(level);
  const classInfo = findClass(character.characterClass);
  const castingAbility = classInfo?.spellcastingAbility;
  const isCaster = !!(classInfo && classInfo.spellcasting !== 'none' && castingAbility);
  const castingMod =
    isCaster && castingAbility
      ? abilityModifier((character[castingAbility as keyof Character] as number) ?? 10)
      : 0;
  const wisMod = abilityModifier(character.wisdom ?? 10);
  const dexMod = abilityModifier(character.dexterity ?? 10);
  const perceptionLevel = skillProficiencyLevel(character, 'perception');
  const saveProfs = new Set(character.savingThrowProficiencies ?? []);

  // Build variable map
  const vars: Record<string, string> = {
    name: character.name,
    level: String(level),
    class: character.characterClass ?? '',
    race: character.race ?? '',
    background: character.background ?? '',
    speed: String(character.speed ?? 9),
    max_hp: String(character.maxHp ?? 1),
    prof: formatModifier(prof),
    initiative: formatModifier(dexMod),
    passive_perception: String(passivePerception(wisMod, prof, perceptionLevel)),
  };

  // Spellcasting variables
  if (isCaster) {
    vars.save_dc = String(spellSaveDC(castingMod, prof));
    vars.spell_attack = formatModifier(castingMod + prof);
  }

  // Ability scores and modifiers
  const abilities: Array<{ key: string; field: keyof Character }> = [
    { key: 'str', field: 'strength' },
    { key: 'dex', field: 'dexterity' },
    { key: 'con', field: 'constitution' },
    { key: 'int', field: 'intelligence' },
    { key: 'wis', field: 'wisdom' },
    { key: 'cha', field: 'charisma' },
  ];

  for (const { key, field } of abilities) {
    const score = (character[field] as number) ?? 10;
    vars[key] = String(score);
    vars[`${key}_mod`] = formatModifier(abilityModifier(score));
    // Saving throw modifiers
    vars[`save:${key}`] = formatModifier(
      abilityModifier(score) + (saveProfs.has(field as string) ? prof : 0),
    );
  }

  // Skill modifiers
  for (const skill of DND_SKILLS) {
    vars[`skill:${skill.key}`] = formatModifier(skillModifier(character, skill.key));
  }

  // Replace all {{variable}} tokens
  return text.replace(/\{\{(\w+:[\w]+|\w+)\}\}/g, (match, key: string) => {
    return vars[key] ?? match; // Leave unknown variables as-is
  });
}

// ---------- Character notes (free-form with simple formatting) ----------

export interface CharacterNote {
  id: number;
  characterId: number;
  title: string;
  content: string | null;
  sortOrder: number;
  updatedAt: string;
  createdAt: string;
}

export interface CreateCharacterNotePayload {
  title: string;
  content?: string;
}

export interface PatchCharacterNotePayload {
  title?: string;
  content?: string | null;
}

/** List of available template variables for the help UI. */
export const TEMPLATE_VARIABLES: Array<{ syntax: string; description: string }> = [
  { syntax: '{{name}}', description: 'Nom du personnage' },
  { syntax: '{{level}}', description: 'Niveau' },
  { syntax: '{{class}}', description: 'Classe' },
  { syntax: '{{race}}', description: 'Race' },
  { syntax: '{{prof}}', description: 'Bonus de maîtrise (+3)' },
  { syntax: '{{save_dc}}', description: 'DD de sauvegarde des sorts (14)' },
  { syntax: '{{spell_attack}}', description: "Bonus d'attaque de sort (+6)" },
  { syntax: '{{str_mod}}', description: 'Modificateur de Force (+4)' },
  { syntax: '{{dex_mod}}', description: 'Modificateur de Dextérité (+2)' },
  { syntax: '{{con_mod}}', description: 'Modificateur de Constitution (+1)' },
  { syntax: '{{int_mod}}', description: "Modificateur d'Intelligence (+3)" },
  { syntax: '{{wis_mod}}', description: 'Modificateur de Sagesse (+1)' },
  { syntax: '{{cha_mod}}', description: 'Modificateur de Charisme (+0)' },
  { syntax: '{{save:dex}}', description: 'Sauvegarde de Dextérité (+2)' },
  { syntax: '{{save:con}}', description: 'Sauvegarde de Constitution (+1)' },
  { syntax: '{{skill:perception}}', description: 'Modificateur de Perception (+4)' },
  { syntax: '{{skill:athletics}}', description: "Modificateur d'Athlétisme (+4)" },
  { syntax: '{{passive_perception}}', description: 'Perception passive (14)' },
  { syntax: '{{initiative}}', description: 'Initiative (+2)' },
  { syntax: '{{speed}}', description: 'Vitesse en mètres (9, ou 7.5 pour les petites races)' },
  { syntax: '{{max_hp}}', description: 'PV maximum' },
];

// ---------- Inventory & Storage ----------

export type StorageType = 'carried' | 'mount' | 'container';

export interface StorageLocation {
  id: number;
  characterId: number;
  name: string;
  type: StorageType;
  strength: number | null; // for mounts
  multiplier: number; // Beast of Burden = 2
  capacityKg: number | null; // fixed for containers
  ownWeightKg: number; // container's weight on carrier
  itemId: number | null; // link to catalog item
  sortOrder: number;
}

export interface LocationWeight {
  locationId: number;
  locationName: string;
  locationType: StorageType;
  itemsWeightKg: number; // weight of items in this location
  ownWeightKg: number; // container's own weight
  maxCapacityKg: number | null; // null = uses STR formula (carried)
  pct: number; // fill percentage
}

export interface InventoryEntry {
  id: number;
  characterId: number;
  itemId: number;
  item: Item;
  quantity: number;
  equipped: boolean;
  notes: string | null;
  storageLocationId: number | null;
  addedAt: string;
}

export interface EncumbranceState {
  /** Total carried weight in kg (items + coins). */
  totalWeightKg: number;
  /** Weight of coins alone, in kg. */
  coinWeightKg: number;
  /** STR-derived thresholds (kg). */
  encumberedKg: number;
  heavilyEncumberedKg: number;
  maxCarryKg: number;
  /** Current tier label. */
  tier: 'unencumbered' | 'encumbered' | 'heavilyEncumbered' | 'overburdened';
  /** Percentage of max carry capacity (0-100+, capped at 100 for bar fill). */
  pct: number;
}

export interface CharacterInventory {
  character: Character;
  entries: InventoryEntry[];
  encumbrance: EncumbranceState;
  locations: StorageLocation[];
  locationWeights: LocationWeight[];
}

export interface AddInventoryPayload {
  itemId: number;
  quantity?: number;
  equipped?: boolean;
  notes?: string;
  storageLocationId?: number | null;
}

export interface PatchInventoryPayload {
  quantity?: number;
  equipped?: boolean;
  notes?: string | null;
  storageLocationId?: number | null;
}

export interface CreateStorageLocationPayload {
  name: string;
  type: StorageType;
  strength?: number;
  multiplier?: number;
  capacityKg?: number | null;
  ownWeightKg?: number;
  itemId?: number | null;
}

export interface TransferPayload {
  toCharacterId: number;
  inventoryId: number;
  quantity: number;
}

// ---------- Encumbrance math (shared) ----------

/** 1 lb = 0.4536 kg (used by the import script). */
export const LB_TO_KG = 0.4536;

/**
 * DMG variant encumbrance thresholds.
 * Official French SRD metric values (5e-drs.fr / SRD 5.1 FR):
 * STR × 2.5 / 5 / 7.5 kg (the French publisher rounded to clean metric numbers,
 * instead of converting 5/10/15 lb → 2.27/4.54/6.80 kg).
 */
export const ENCUMBRANCE_FACTORS = {
  encumbered: 2.5,
  heavily: 5.0,
  max: 7.5,
} as const;

/** Standard PHB mode: STR × 7.5 kg (max only). */
export const STANDARD_MAX_FACTOR = 7.5;

export function computeEncumbrance(
  totalWeightKg: number,
  strength: number,
  mode: EncumbranceMode,
  coinWeightKg: number = 0,
  capacityMultiplier: number = 1,
): EncumbranceState {
  const mult = capacityMultiplier > 0 ? capacityMultiplier : 1;
  const encumberedKg = +(strength * ENCUMBRANCE_FACTORS.encumbered * mult).toFixed(2);
  const heavilyEncumberedKg = +(strength * ENCUMBRANCE_FACTORS.heavily * mult).toFixed(2);
  const maxCarryKg = +(strength * ENCUMBRANCE_FACTORS.max * mult).toFixed(2);

  let tier: EncumbranceState['tier'];
  if (mode === 'standard') {
    tier = totalWeightKg > maxCarryKg ? 'overburdened' : 'unencumbered';
  } else if (mode === 'slots') {
    // slots mode doesn't use weight thresholds; report unencumbered unless over max
    tier = totalWeightKg > maxCarryKg ? 'overburdened' : 'unencumbered';
  } else {
    if (totalWeightKg > maxCarryKg) tier = 'overburdened';
    else if (totalWeightKg > heavilyEncumberedKg) tier = 'heavilyEncumbered';
    else if (totalWeightKg > encumberedKg) tier = 'encumbered';
    else tier = 'unencumbered';
  }

  const pct = maxCarryKg > 0 ? Math.min(100, (totalWeightKg / maxCarryKg) * 100) : 0;

  return { totalWeightKg, coinWeightKg, encumberedKg, heavilyEncumberedKg, maxCarryKg, tier, pct };
}

// ---------- Coin conversion ----------

/** Convert all coins to copper pieces (lowest denomination). */
export const COIN_TO_CP: Record<CostUnit, number> = {
  cp: 1,
  sp: 10,
  ep: 50,
  gp: 100,
  pp: 1000,
};

export const COIN_LABELS_FR: Record<CostUnit, string> = {
  cp: 'PC', // Pièce de Cuivre
  sp: 'PA', // Pièce d'Argent
  ep: 'PE', // Pièce d'Électrum
  gp: 'PO', // Pièce d'Or
  pp: 'PP', // Pièce de Platine
};

export const RARITY_LABELS_FR: Record<Rarity, string> = {
  common: 'Commun',
  uncommon: 'Peu commun',
  rare: 'Rare',
  veryRare: 'Très rare',
  legendary: 'Légendaire',
  artifact: 'Artefact',
  none: '—',
};

export const CATEGORY_LABELS_FR: Record<ItemCategory, string> = {
  weapon: 'Arme',
  armor: 'Armure',
  gear: 'Équipement',
  tool: 'Outil',
  mount: 'Monture / Véhicule',
  ammunition: 'Munitions',
  magic: 'Objet magique',
  custom: 'Personnalisé',
};

export const ENCUMBRANCE_LABELS_FR: Record<EncumbranceState['tier'], string> = {
  unencumbered: 'Sans encombre',
  encumbered: 'Encombré',
  heavilyEncumbered: 'Lourdement encombré',
  overburdened: 'Surchargé',
};

// ---------- Monsters (French SRD bestiary) ----------

export interface MonsterAction {
  name: string;
  desc: string;
  attackBonus?: number;
  damageDice?: string;
  damageType?: string;
  cost?: number; // legendary actions only: 1/2/3
}

export interface MonsterSkill {
  name: string;
  isExpert: boolean;
}

/** A full monster stat block from the French SRD bestiary (metric units). */
export interface Monster {
  slug: string;
  nameFr: string;
  type: string;
  subtype: string | null;
  size: string; // French size code: T (Très petit), P (Petit), M (Moyen), G (Grand), TG (Très grand), Gig (Gigantesque), C (Colossal)
  alignment: string | null;
  armorClass: number;
  armorDesc: string | null;
  hitPoints: number;
  hitDice: string | null;
  /** Speeds in meters (walk/swim/fly/climb/burrow). */
  speed: Partial<Record<'walk' | 'swim' | 'fly' | 'climb' | 'burrow', number>>;
  abilities: { for: number; dex: number; con: number; int: number; sag: number; cha: number };
  savingThrows: string[]; // ability short codes that get a save bonus
  skills: MonsterSkill[];
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
}

/** Light row for the picker/search (no prose). */
export interface MonsterSummary {
  slug: string;
  nameFr: string;
  type: string;
  size: string;
  challengeRating: number;
  armorClass: number;
  hitPoints: number;
}

export interface MonsterSearchQuery {
  search?: string;
  limit?: number;
}

/** French size label lookup (5e-drs codes). */
export const MONSTER_SIZE_LABELS_FR: Record<string, string> = {
  T: 'Très petit',
  P: 'Petit',
  M: 'Moyen',
  G: 'Grand',
  TG: 'Très grand',
  Gig: 'Gigantesque',
  C: 'Colossal',
};

/** French CR label (for display). */
export function formatCR(cr: number): string {
  if (cr === 0.125) return '1/8';
  if (cr === 0.25) return '1/4';
  if (cr === 0.5) return '1/2';
  return String(cr);
}

// ---------- Combat (initiative tracker) ----------

export type CombatantType = 'player' | 'monster';

/**
 * A condition applied to a combatant, with an optional duration.
 * duration = number of rounds remaining (decremented at the end of the
 * combatant's turn). null = until dispelled (no auto-expiry).
 */
export interface CombatantCondition {
  name: string;
  duration: number | null;
}

export interface Combatant {
  id: number;
  encounterId: number;
  type: CombatantType;
  characterId: number | null; // set when type === 'player'
  monsterSlug: string | null; // catalog ref when type === 'monster'
  name: string; // display name (player char name / monster name)
  count: number; // group size (1 for players, ≥1 for monster groups)
  groupId: number | null; // shared by grouped monsters (same initiative, independent HP)
  initiative: number | null; // null = not yet rolled
  initiativeBonus: number; // dex mod cached at add time (for tie-breaking)
  armorClass: number | null; // null = hidden (non-owner player can't see)
  hitPoints: number | null; // current (null = hidden)
  maxHitPoints: number | null;
  conditions: CombatantCondition[];
  sortOrder: number;
  defeated: boolean;
  cardColor: string | null; // hex color for the card background, null = default
  /**
   * Vague apparent-health tier for monsters when HP is redacted for non-GM
   * viewers: 0 = dying, 1 = badly hurt, 2 = hurt, 3 = healthy. Computed
   * server-side from the real ratio with a stable per-combatant jitter, so
   * players read "how it looks", never a percentage. Undefined for GM views
   * and for combatants whose HP is not redacted.
   */
  feeling?: number;
}

export type EncounterStatus = 'setup' | 'active' | 'ended';

export interface Encounter {
  id: number;
  partyId: number;
  name: string;
  round: number; // 0 = setup, ≥1 = in combat
  turnIndex: number; // index into the sorted combatants list
  status: EncounterStatus;
  createdAt: string;
}

export interface EncounterDetail extends Encounter {
  combatants: Combatant[];
}

/** One roster line of an encounter summary: a character or an aggregated monster group. */
export interface EncounterRosterEntry {
  name: string;
  count: number;
  player: boolean;
}

export interface EncounterSummary {
  id: number;
  partyId: number;
  name: string;
  round: number;
  turnIndex: number;
  status: EncounterStatus;
  combatantCount: number;
  /** Who is in the fight: characters first, then monster groups by size. */
  roster: EncounterRosterEntry[];
  createdAt: string;
}

export interface CreateEncounterPayload {
  name: string;
}

export interface PatchEncounterPayload {
  name?: string;
  status?: EncounterStatus;
  round?: number;
  turnIndex?: number;
}

export interface AddMonsterPayload {
  monsterSlug: string;
  count?: number;
  name?: string;
}

export interface AddPlayerPayload {
  /** Single character (legacy) — use characterIds to add several at once. */
  characterId?: number;
  characterIds?: number[];
}

export interface PatchCombatantPayload {
  name?: string;
  count?: number;
  initiative?: number;
  armorClass?: number;
  hitPoints?: number;
  maxHitPoints?: number;
  conditions?: CombatantCondition[];
  defeated?: boolean;
  cardColor?: string | null;
}

export interface SetInitiativePayload {
  initiative: number;
}
