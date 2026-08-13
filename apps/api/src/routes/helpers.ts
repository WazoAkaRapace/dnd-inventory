/**
 * Helpers shared across route modules: membership checks, item/character shaping.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { getDb } from '../db/index.ts';
import type {
  Item,
  CharacterSummary,
  Character,
  InventoryEntry,
  ItemCategory,
  Rarity,
  CostUnit,
  Spell,
  CharacterSpell,
  SpellSchool,
  CharacterFeature,
} from '@dnd-inventory/shared';

/** Parse a JSON column that's guaranteed to be an array; never throws. */
function parseJsonArray(raw: any, fallback: any[] = []): any[] {
  if (!raw) return fallback;
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/** Get the authenticated user id from the JWT-decoded payload. */
export function getUserId(req: FastifyRequest): number | null {
  const sub = (req as any).user?.sub;
  return typeof sub === 'number' ? sub : null;
}

/** Reject if not authenticated. Returns userId or sends 401 and returns null. */
export function requireUser(req: FastifyRequest, reply: FastifyReply): number | null {
  const id = getUserId(req);
  if (id === null) {
    reply.code(401).send({ error: 'unauthorized' });
    return null;
  }
  return id;
}

/** Is this user a member (gm or player) of this party? */
export function isPartyMember(partyId: number, userId: number): boolean {
  const db = getDb();
  const row = db.prepare(
    'SELECT 1 FROM party_members WHERE party_id = ? AND user_id = ?',
  ).get(partyId, userId);
  return !!row;
}

/** Is this user the GM of this party? */
export function isPartyGM(partyId: number, userId: number): boolean {
  const db = getDb();
  const row = db.prepare(
    "SELECT 1 FROM party_members WHERE party_id = ? AND user_id = ? AND role = 'gm'",
  ).get(partyId, userId);
  return !!row;
}

/** Generate a 6-char invite code (uppercase, unambiguous chars). */
export function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/** Map a raw DB row to the Item domain type. */
export function mapItem(row: any): Item {
  return {
    id: row.id,
    source: row.source,
    partyId: row.party_id,
    category: row.category as ItemCategory,
    name: row.name,
    nameFr: row.name_fr,
    rarity: row.rarity as Rarity,
    weightKg: row.weight_kg,
    costQty: row.cost_qty,
    costUnit: row.cost_unit as CostUnit | null,
    description: row.description,
    damageDice: row.damage_dice,
    damageType: row.damage_type,
    acBase: row.ac_base,
    strMin: row.str_min,
    stealthDisadvantage: !!row.stealth_disadvantage,
    properties: row.properties_json ? JSON.parse(row.properties_json) : [],
    survivalTags: row.survival_tags ? (typeof row.survival_tags === 'string' ? JSON.parse(row.survival_tags) : row.survival_tags) : [],
    imagePath: row.image_path,
  };
}

/** Map a raw DB row to CharacterSummary. */
export function mapCharacterSummary(row: any): CharacterSummary {
  return {
    id: row.id,
    partyId: row.party_id,
    ownerId: row.owner_id,
    ownerName: row.owner_name ?? row.display_name ?? '',
    name: row.name,
    strength: row.strength,
    capacityMultiplier: row.capacity_multiplier ?? 1,
    exhaustion: row.exhaustion ?? 0,
    conditions: row.conditions ? (typeof row.conditions === 'string' ? JSON.parse(row.conditions) : row.conditions) : [],
    foodDays: row.food_days ?? 0,
    waterDays: row.water_days ?? 0,
    maxHp: row.max_hp ?? 1,
    currentHp: row.current_hp ?? 1,
    tempHp: row.temp_hp ?? 0,
    // Character sheet
    level: row.level ?? 1,
    dexterity: row.dexterity ?? 10,
    constitution: row.constitution ?? 10,
    intelligence: row.intelligence ?? 10,
    wisdom: row.wisdom ?? 10,
    charisma: row.charisma ?? 10,
    characterClass: row.character_class ?? null,
    race: row.race ?? null,
    background: row.background ?? null,
    speed: row.speed ?? 9,
    skillProficiencies: parseJsonArray(row.skill_proficiencies, []),
    savingThrowProficiencies: parseJsonArray(row.saving_throw_proficiencies, []),
    spellSlotsUsed: parseJsonArray(row.spell_slots_used, [0,0,0,0,0,0,0,0,0]),
    // Description / personality
    alignment: row.alignment ?? null,
    sex: row.sex ?? null,
    height: row.height ?? null,
    weight: row.weight ?? null,
    age: row.age ?? null,
    skin: row.skin ?? null,
    eyes: row.eyes ?? null,
    hair: row.hair ?? null,
    portraitUrl: row.portrait_url ?? null,
    personalityTraits: row.personality_traits ?? null,
    ideals: row.ideals ?? null,
    bonds: row.bonds ?? null,
    flaws: row.flaws ?? null,
    appearance: row.appearance ?? null,
  };
}

/** Map a raw DB row to a full Character (with coin purse). */
export function mapCharacter(row: any): Character {
  return {
    ...mapCharacterSummary(row),
    notes: row.notes,
    copper: row.copper,
    silver: row.silver,
    electrum: row.electrum,
    gold: row.gold,
    platinum: row.platinum,
    createdAt: row.created_at,
  };
}

/** Map a raw inventory row (with joined item using i_ aliases) to InventoryEntry. */
export function mapInventoryEntry(row: any): InventoryEntry {
  // Detect whether row uses aliased columns (i_id) or raw (id)
  const usesAliases = row.i_id !== undefined;
  const itemRow = usesAliases ? {
    id: row.i_id,
    source: row.i_source,
    party_id: row.i_party_id,
    category: row.i_category,
    srd_index: row.i_srd_index,
    name: row.i_name,
    name_fr: row.i_name_fr,
    rarity: row.i_rarity,
    weight_kg: row.i_weight_kg,
    cost_qty: row.i_cost_qty,
    cost_unit: row.i_cost_unit,
    description: row.i_description,
    damage_dice: row.i_damage_dice,
    damage_type: row.i_damage_type,
    ac_base: row.i_ac_base,
    str_min: row.i_str_min,
    stealth_disadvantage: row.i_stealth_disadvantage,
    properties_json: row.i_properties_json,
    survival_tags: row.i_survival_tags,
    image_path: row.i_image_path,
  } : row;

  return {
    id: row.id,
    characterId: row.character_id,
    itemId: row.item_id,
    item: mapItem(itemRow),
    quantity: row.quantity,
    equipped: !!row.equipped,
    notes: row.notes,
    storageLocationId: row.storage_location_id ?? null,
    addedAt: row.added_at,
  };
}

/**
 * Map a raw spells row to the Spell domain type.
 * Handles snake_case → camelCase and JSON parsing of
 * components / classes_json / damage_json / dc_json.
 */
export function mapSpell(row: any): Spell {
  return {
    id: row.id,
    srdIndex: row.srd_index,
    name: row.name,
    nameFr: row.name_fr ?? null,
    level: row.level,
    school: row.school as SpellSchool,
    castingTime: row.casting_time ?? null,
    rangeText: row.range_text ?? null,
    components: parseJsonArray(row.components, []),
    material: row.material ?? null,
    duration: row.duration ?? null,
    concentration: !!row.concentration,
    ritual: !!row.ritual,
    description: row.description ?? null,
    descriptionFr: row.description_fr ?? null,
    higherLevel: row.higher_level ?? null,
    higherLevelFr: row.higher_level_fr ?? null,
    attackType: row.attack_type ?? null,
    // damage_json / dc_json are kept as raw JSON strings per the Spell type
    damageJson: row.damage_json ?? null,
    dcJson: row.dc_json ?? null,
    classes: parseJsonArray(row.classes_json, []),
  };
}

/**
 * Map a joined character_spells + spells row to CharacterSpell.
 * Expects spell columns to be prefixed with `s_` to avoid collisions
 * with the link table's own columns (id, prepared, sort_order, ...).
 */
export function mapCharacterSpell(row: any): CharacterSpell {
  const spellRow = {
    id: row.s_id,
    srd_index: row.s_srd_index,
    name: row.s_name,
    name_fr: row.s_name_fr,
    level: row.s_level,
    school: row.s_school,
    casting_time: row.s_casting_time,
    range_text: row.s_range_text,
    components: row.s_components,
    material: row.s_material,
    duration: row.s_duration,
    concentration: row.s_concentration,
    ritual: row.s_ritual,
    description: row.s_description,
    description_fr: row.s_description_fr,
    higher_level: row.s_higher_level,
    higher_level_fr: row.s_higher_level_fr,
    attack_type: row.s_attack_type,
    damage_json: row.s_damage_json,
    dc_json: row.s_dc_json,
    classes_json: row.s_classes_json,
  };
  return {
    id: row.id,
    characterId: row.character_id,
    spell: mapSpell(spellRow),
    prepared: !!row.prepared,
    sortOrder: row.sort_order ?? 0,
    addedAt: row.added_at,
  };
}

/**
 * Map a raw character_features row to CharacterFeature.
 * Handles snake_case → camelCase for the free-form trait columns.
 */
export function mapFeature(row: any): CharacterFeature {
  return {
    id: row.id,
    characterId: row.character_id,
    title: row.title,
    category: row.category,
    description: row.description,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}
