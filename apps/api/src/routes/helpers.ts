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
} from '@dnd-inventory/shared';

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
    race: row.race,
    className: row.class_name,
    level: row.level,
    strength: row.strength,
    maxHp: row.max_hp,
    currentHp: row.current_hp,
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

/** Map a raw inventory row (with joined item) to InventoryEntry. */
export function mapInventoryEntry(row: any): InventoryEntry {
  return {
    id: row.id,
    characterId: row.character_id,
    itemId: row.item_id,
    item: mapItem(row),
    quantity: row.quantity,
    equipped: !!row.equipped,
    notes: row.notes,
    addedAt: row.added_at,
  };
}
