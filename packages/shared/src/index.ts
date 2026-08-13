/**
 * Shared domain types — imported by both the Fastify API and the React frontend.
 * Weights are ALWAYS in kilograms (SI). The SRD source data (lb) is converted at import.
 */

// ---------- Items ----------

export type ItemCategory =
  | 'weapon'
  | 'armor'
  | 'gear'          // adventuring gear
  | 'tool'
  | 'mount'         // mounts & vehicles
  | 'ammunition'
  | 'magic'         // magic items
  | 'custom';

export type Rarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'veryRare'
  | 'legendary'
  | 'artifact'
  | 'none';         // mundane items have no rarity

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

/** API response shape for GET /api/parties/:id — wraps the party with related data. */
export interface PartyDetail {
  party: Party;
  members: PartyMember[];
  characters: CharacterSummary[];
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
  secret: string | null;       // null if not visible to requesting user
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

// ---------- Characters ----------

export interface CharacterSummary {
  id: number;
  partyId: number;
  ownerId: number;
  ownerName: string;
  name: string;
  strength: number;
  capacityMultiplier: number;
  exhaustion: number;        // 0-6
  conditions: string[];      // ["Poisoned", "Frightened", ...]
  foodDays: number;          // days without food
  waterDays: number;         // days without water
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
  speed: number;             // meters
  skillProficiencies: string[];        // skill keys: ["acrobatics","arcanes",...]
  savingThrowProficiencies: string[];  // ability keys: ["strength","constitution"]
  spellSlotsUsed: number[];            // 9 entries, used per spell level 1-9
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
  savingThrowProficiencies?: string[];
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
}

// ---------- D&D 5e Abilities (Caractéristiques) ----------

export type AbilityKey = 'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma';

export interface AbilityInfo {
  key: AbilityKey;
  label: string;      // "Force"
  shortLabel: string; // "FOR"
  abbr: string;       // "FOR" (same as shortLabel, for convenience)
}

export const DND_ABILITIES: AbilityInfo[] = [
  { key: 'strength',     label: 'Force',         shortLabel: 'FOR', abbr: 'FOR' },
  { key: 'dexterity',    label: 'Dextérité',     shortLabel: 'DEX', abbr: 'DEX' },
  { key: 'constitution', label: 'Constitution',  shortLabel: 'CON', abbr: 'CON' },
  { key: 'intelligence', label: 'Intelligence',  shortLabel: 'INT', abbr: 'INT' },
  { key: 'wisdom',       label: 'Sagesse',       shortLabel: 'SAG', abbr: 'SAG' },
  { key: 'charisma',     label: 'Charisme',      shortLabel: 'CHA', abbr: 'CHA' },
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
  | 'acrobatics' | 'arcanes' | 'athletics' | 'deception' | 'history'
  | 'insight' | 'intimidation' | 'investigation' | 'medicine' | 'nature'
  | 'perception' | 'performance' | 'persuasion' | 'religion'
  | 'sleightOfHand' | 'stealth' | 'survival' | 'animalHandling';

export interface SkillInfo {
  key: SkillKey;
  label: string;       // French name: "Acrobaties"
  ability: AbilityKey; // associated ability
}

export const DND_SKILLS: SkillInfo[] = [
  { key: 'acrobatics',      label: 'Acrobaties',     ability: 'dexterity' },
  { key: 'animalHandling',  label: 'Dressage',       ability: 'wisdom' },
  { key: 'arcanes',         label: 'Arcanes',        ability: 'intelligence' },
  { key: 'athletics',       label: 'Athlétisme',     ability: 'strength' },
  { key: 'deception',       label: 'Supercherie',    ability: 'charisma' },
  { key: 'history',         label: 'Histoire',       ability: 'intelligence' },
  { key: 'insight',         label: 'Perspicacité',   ability: 'wisdom' },
  { key: 'intimidation',    label: 'Intimidation',   ability: 'charisma' },
  { key: 'investigation',   label: 'Investigation',  ability: 'intelligence' },
  { key: 'medicine',        label: 'Médecine',       ability: 'wisdom' },
  { key: 'nature',          label: 'Nature',         ability: 'intelligence' },
  { key: 'perception',      label: 'Perception',     ability: 'wisdom' },
  { key: 'performance',     label: 'Représentation', ability: 'charisma' },
  { key: 'persuasion',      label: 'Persuasion',     ability: 'charisma' },
  { key: 'religion',        label: 'Religion',       ability: 'intelligence' },
  { key: 'sleightOfHand',   label: 'Escamotage',    ability: 'dexterity' },
  { key: 'stealth',         label: 'Discrétion',     ability: 'dexterity' },
  { key: 'survival',        label: 'Survie',         ability: 'wisdom' },
];

/** Skill proficiency level: 0=none, 1=proficient, 2=expertise (double proficiency) */
export type ProficiencyLevel = 0 | 1 | 2;

// ---------- Classes (SRD reference: hit dice, saves, spellcasting) ----------

export type SpellcastingType = 'none' | 'full' | 'half' | 'pact';

export interface ClassInfo {
  name: string;                    // French: "Magicien", "Guerrier"
  hitDie: number;                  // 6, 8, 10, 12
  savingThrows: AbilityKey[];      // 2 abilities
  spellcasting: SpellcastingType;
  spellcastingAbility?: AbilityKey; // INT, WIS, CHA (for casters)
}

export const DND_CLASSES: ClassInfo[] = [
  { name: 'Artificier',   hitDie: 8,  savingThrows: ['constitution', 'intelligence'], spellcasting: 'half', spellcastingAbility: 'intelligence' },
  { name: 'Barbare',      hitDie: 12, savingThrows: ['strength', 'constitution'],  spellcasting: 'none' },
  { name: 'Barde',        hitDie: 8,  savingThrows: ['dexterity', 'charisma'],     spellcasting: 'full', spellcastingAbility: 'charisma' },
  { name: 'Clerc',        hitDie: 8,  savingThrows: ['wisdom', 'charisma'],        spellcasting: 'full', spellcastingAbility: 'wisdom' },
  { name: 'Druide',       hitDie: 8,  savingThrows: ['intelligence', 'wisdom'],    spellcasting: 'full', spellcastingAbility: 'wisdom' },
  { name: 'Ensorceleur',  hitDie: 6,  savingThrows: ['constitution', 'charisma'],  spellcasting: 'full', spellcastingAbility: 'charisma' },
  { name: 'Guerrier',     hitDie: 10, savingThrows: ['strength', 'constitution'],  spellcasting: 'none' },
  { name: 'Magicien',     hitDie: 6,  savingThrows: ['intelligence', 'wisdom'],    spellcasting: 'full', spellcastingAbility: 'intelligence' },
  { name: 'Moine',        hitDie: 8,  savingThrows: ['strength', 'dexterity'],     spellcasting: 'none' },
  { name: 'Occultiste',   hitDie: 8,  savingThrows: ['wisdom', 'charisma'],        spellcasting: 'pact', spellcastingAbility: 'charisma' },
  { name: 'Paladin',      hitDie: 10, savingThrows: ['wisdom', 'charisma'],        spellcasting: 'half', spellcastingAbility: 'charisma' },
  { name: 'Rôdeur',       hitDie: 10, savingThrows: ['strength', 'dexterity'],     spellcasting: 'half', spellcastingAbility: 'wisdom' },
  { name: 'Roublard',     hitDie: 8,  savingThrows: ['dexterity', 'intelligence'], spellcasting: 'none' },
];

/** Find class info by name (case-insensitive, accent-insensitive match). */
export function findClass(name: string | null | undefined): ClassInfo | null {
  if (!name) return null;
  const normalized = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return DND_CLASSES.find((c) =>
    c.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === normalized
  ) ?? null;
}

// ---------- Spell Slots (Emplacements de sort) ----------

/**
 * Full caster spell slots by level (1-20).
 * Each row is [slotsL1..slotsL9] for that character level.
 * Cantrips (L0) are at-will and not tracked here.
 */
export const SPELL_SLOTS_FULL: number[][] = [
  [2,0,0,0,0,0,0,0,0], // L1
  [3,0,0,0,0,0,0,0,0], // L2
  [4,2,0,0,0,0,0,0,0], // L3
  [4,3,0,0,0,0,0,0,0], // L4
  [4,3,2,0,0,0,0,0,0], // L5
  [4,3,3,0,0,0,0,0,0], // L6
  [4,3,3,1,0,0,0,0,0], // L7
  [4,3,3,2,0,0,0,0,0], // L8
  [4,3,3,3,1,0,0,0,0], // L9
  [4,3,3,3,2,0,0,0,0], // L10
  [4,3,3,3,2,1,0,0,0], // L11
  [4,3,3,3,2,1,0,0,0], // L12
  [4,3,3,3,2,1,1,0,0], // L13
  [4,3,3,3,2,1,1,0,0], // L14
  [4,3,3,3,2,1,1,1,0], // L15
  [4,3,3,3,2,1,1,1,0], // L16
  [4,3,3,3,2,1,1,1,1], // L17
  [4,3,3,3,3,1,1,1,1], // L18
  [4,3,3,3,3,2,1,1,1], // L19
  [4,3,3,3,3,2,2,1,1], // L20
];

/**
 * Half caster (Paladin, Ranger) spell slots by level (1-20).
 * Paladin/Ranger get slots starting at character level 2.
 */
export const SPELL_SLOTS_HALF: number[][] = [
  [0,0,0,0,0,0,0,0,0], // L1
  [2,0,0,0,0,0,0,0,0], // L2
  [3,0,0,0,0,0,0,0,0], // L3
  [3,0,0,0,0,0,0,0,0], // L4
  [4,2,0,0,0,0,0,0,0], // L5
  [4,2,0,0,0,0,0,0,0], // L6
  [4,3,0,0,0,0,0,0,0], // L7
  [4,3,0,0,0,0,0,0,0], // L8
  [4,3,2,0,0,0,0,0,0], // L9
  [4,3,2,0,0,0,0,0,0], // L10
  [4,3,3,0,0,0,0,0,0], // L11
  [4,3,3,0,0,0,0,0,0], // L12
  [4,3,3,1,0,0,0,0,0], // L13
  [4,3,3,1,0,0,0,0,0], // L14
  [4,3,3,2,0,0,0,0,0], // L15
  [4,3,3,2,0,0,0,0,0], // L16
  [4,3,3,3,1,0,0,0,0], // L17
  [4,3,3,3,1,0,0,0,0], // L18
  [4,3,3,3,2,0,0,0,0], // L19
  [4,3,3,3,2,0,0,0,0], // L20
];

/**
 * Pact magic (Warlock) slots by level (1-20).
 * Warlocks get 2 slots of a single level that scales with character level.
 * Represented as [slotLevel-1 filled with the count, rest 0].
 * e.g. level 5 = [0,2,0,0,0,0,0,0,0] (2 slots of level 2).
 */
export const SPELL_SLOTS_PACT: number[][] = [
  [2,0,0,0,0,0,0,0,0], // L1
  [2,0,0,0,0,0,0,0,0], // L2
  [2,0,0,0,0,0,0,0,0], // L3
  [0,2,0,0,0,0,0,0,0], // L4
  [0,2,0,0,0,0,0,0,0], // L5
  [0,0,2,0,0,0,0,0,0], // L6
  [0,0,2,0,0,0,0,0,0], // L7
  [0,0,0,2,0,0,0,0,0], // L8
  [0,0,0,2,0,0,0,0,0], // L9
  [0,0,0,0,2,0,0,0,0], // L10
  [0,0,0,0,2,0,0,0,0], // L11
  [0,0,0,0,2,0,0,0,0], // L12
  [0,0,0,0,2,0,0,0,0], // L13
  [0,0,0,0,2,0,0,0,0], // L14
  [0,0,0,0,2,0,0,0,0], // L15
  [0,0,0,0,2,0,0,0,0], // L16
  [0,0,0,0,0,2,0,0,0], // L17
  [0,0,0,0,0,2,0,0,0], // L18
  [0,0,0,0,0,2,0,0,0], // L19
  [0,0,0,0,0,0,2,0,0], // L20
];

/** Get max spell slots for a character level + spellcasting type. Returns 9-element array. */
export function maxSpellSlots(level: number, type: SpellcastingType): number[] {
  const idx = Math.max(0, Math.min(19, level - 1));
  const table = type === 'half' ? SPELL_SLOTS_HALF : type === 'pact' ? SPELL_SLOTS_PACT : SPELL_SLOTS_FULL;
  return table[idx] ?? [0,0,0,0,0,0,0,0,0];
}

/** Spell save DC: 8 + casting ability modifier + proficiency bonus. */
export function spellSaveDC(castingMod: number, profBonus: number): number {
  return 8 + castingMod + profBonus;
}

/** Passive perception: 10 + WIS mod + proficiency bonus (if proficient). */
export function passivePerception(wisMod: number, profBonus: number, proficient: boolean): number {
  return 10 + wisMod + (proficient ? profBonus : 0);
}

// ---------- Spells (SRD catalog) ----------

export type SpellSchool =
  | 'abjuration' | 'conjuration' | 'divination' | 'enchantment'
  | 'evocation' | 'illusion' | 'necromancy' | 'transmutation';

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
  level: number;               // 0-9 (0 = cantrip)
  school: SpellSchool;
  castingTime: string | null;
  rangeText: string | null;
  components: string[];        // ["V","S","M"]
  material: string | null;
  duration: string | null;
  concentration: boolean;
  ritual: boolean;
  description: string | null;
  descriptionFr: string | null;
  higherLevel: string | null;
  higherLevelFr: string | null;
  attackType: string | null;   // "ranged"/"melee" or null
  damageJson: string | null;
  dcJson: string | null;
  classes: string[];           // French class names: ["Magicien","Ensorceleur"]
}

export interface CharacterSpell {
  id: number;                  // character_spells.id
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
  description: string | null;  // template text with {{variables}}
  sortOrder: number;
  createdAt: string;
}

export interface CreateCharacterFeaturePayload {
  title: string;
  category?: FeatureCategory;
  description?: string;
}

export interface PatchCharacterFeaturePayload {
  title?: string;
  category?: FeatureCategory;
  description?: string | null;
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
  const castingMod = isCaster && castingAbility
    ? abilityModifier((character[castingAbility as keyof Character] as number) ?? 10)
    : 0;
  const wisMod = abilityModifier(character.wisdom ?? 10);
  const dexMod = abilityModifier(character.dexterity ?? 10);
  const hasPerception = (character.skillProficiencies ?? []).includes('perception');
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
    passive_perception: String(passivePerception(wisMod, prof, hasPerception)),
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
    const score = (character[skill.ability as keyof Character] as number) ?? 10;
    const proficient = (character.skillProficiencies ?? []).includes(skill.key);
    vars[`skill:${skill.key}`] = formatModifier(
      abilityModifier(score) + (proficient ? prof : 0),
    );
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
  { syntax: '{{spell_attack}}', description: 'Bonus d\'attaque de sort (+6)' },
  { syntax: '{{str_mod}}', description: 'Modificateur de Force (+4)' },
  { syntax: '{{dex_mod}}', description: 'Modificateur de Dextérité (+2)' },
  { syntax: '{{con_mod}}', description: 'Modificateur de Constitution (+1)' },
  { syntax: '{{int_mod}}', description: 'Modificateur d\'Intelligence (+3)' },
  { syntax: '{{wis_mod}}', description: 'Modificateur de Sagesse (+1)' },
  { syntax: '{{cha_mod}}', description: 'Modificateur de Charisme (+0)' },
  { syntax: '{{save:dex}}', description: 'Sauvegarde de Dextérité (+2)' },
  { syntax: '{{save:con}}', description: 'Sauvegarde de Constitution (+1)' },
  { syntax: '{{skill:perception}}', description: 'Modificateur de Perception (+4)' },
  { syntax: '{{skill:athletics}}', description: "Modificateur d'Athlétisme (+4)" },
  { syntax: '{{passive_perception}}', description: 'Perception passive (14)' },
  { syntax: '{{initiative}}', description: 'Initiative (+2)' },
  { syntax: '{{speed}}', description: 'Vitesse en mètres (9)' },
  { syntax: '{{max_hp}}', description: 'PV maximum' },
];

// ---------- Inventory & Storage ----------

export type StorageType = 'carried' | 'mount' | 'container';

export interface StorageLocation {
  id: number;
  characterId: number;
  name: string;
  type: StorageType;
  strength: number | null;     // for mounts
  multiplier: number;          // Beast of Burden = 2
  capacityKg: number | null;   // fixed for containers
  ownWeightKg: number;         // container's weight on carrier
  itemId: number | null;       // link to catalog item
  sortOrder: number;
}

export interface LocationWeight {
  locationId: number;
  locationName: string;
  locationType: StorageType;
  itemsWeightKg: number;       // weight of items in this location
  ownWeightKg: number;         // container's own weight
  maxCapacityKg: number | null; // null = uses STR formula (carried)
  pct: number;                 // fill percentage
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
  cp: 'PC',  // Pièce de Cuivre
  sp: 'PA',  // Pièce d'Argent
  ep: 'PE',  // Pièce d'Électrum
  gp: 'PO',  // Pièce d'Or
  pp: 'PP',  // Pièce de Platine
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
