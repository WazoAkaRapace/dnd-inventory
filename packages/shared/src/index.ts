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
}

export interface PatchCharacterPayload {
  name?: string;
  strength?: number;
  capacityMultiplier?: number;
  exhaustion?: number;
  conditions?: string[];
  foodDays?: number;
  waterDays?: number;
  notes?: string | null;
  copper?: number;
  silver?: number;
  electrum?: number;
  gold?: number;
  platinum?: number;
}

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
