/**
 * Inventory routes: list (with encumbrance in kg), add, update, delete, transfer.
 * All weight math uses the shared computeEncumbrance() helper (kg).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getDb } from '../db/index.ts';
import { bus } from '../sync/bus.ts';
import {
  requireUser,
  isPartyMember,
  isPartyGM,
  mapInventoryEntry,
} from './helpers.ts';
import {
  computeEncumbrance,
  type AddInventoryPayload,
  type PatchInventoryPayload,
  type TransferPayload,
  type CharacterInventory,
} from '@dnd-inventory/shared';

export async function inventoryRoutes(app: FastifyInstance) {
  // ---------- Get character inventory (with computed kg encumbrance) ----------
  app.get(
    '/characters/:id/inventory',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const db = getDb();

      const char = db.prepare(`
        SELECT c.*, p.encumbrance_mode, u.display_name AS owner_name
        FROM characters c
        JOIN parties p ON p.id = c.party_id
        JOIN users u ON u.id = c.owner_id
        WHERE c.id = ?
      `).get(Number(req.params.id)) as any;
      if (!char) return reply.code(404).send({ error: 'character not found' });
      if (!isPartyMember(char.party_id, userId)) {
        return reply.code(403).send({ error: 'not a member' });
      }

      // Re-fetch with explicit aliases to avoid column-name collisions from the JOIN.
      const cleanRows = db.prepare(`
        SELECT
          inv.id AS id, inv.character_id AS character_id, inv.item_id AS item_id,
          inv.quantity AS quantity, inv.equipped AS equipped, inv.notes AS notes, inv.added_at AS added_at,
          i.id AS i_id, i.source AS i_source, i.party_id AS i_party_id, i.category AS i_category,
          i.srd_index AS i_srd_index, i.name AS i_name, i.name_fr AS i_name_fr, i.rarity AS i_rarity,
          i.weight_kg AS i_weight_kg, i.cost_qty AS i_cost_qty, i.cost_unit AS i_cost_unit,
          i.description AS i_description, i.damage_dice AS i_damage_dice, i.damage_type AS i_damage_type,
          i.ac_base AS i_ac_base, i.str_min AS i_str_min, i.stealth_disadvantage AS i_stealth_disadvantage,
          i.properties_json AS i_properties_json, i.image_path AS i_image_path
        FROM inventory inv
        JOIN items i ON i.id = inv.item_id
        WHERE inv.character_id = ?
        ORDER BY inv.equipped DESC, i.name COLLATE NOCASE ASC
      `).all(char.id);

      const cleanEntries = cleanRows.map((r: any) => ({
        id: r.id,
        characterId: r.character_id,
        itemId: r.item_id,
        item: {
          id: r.i_id,
          source: r.i_source,
          partyId: r.i_party_id,
          category: r.i_category,
          name: r.i_name,
          nameFr: r.i_name_fr,
          rarity: r.i_rarity,
          weightKg: r.i_weight_kg,
          costQty: r.i_cost_qty,
          costUnit: r.i_cost_unit,
          description: r.i_description,
          damageDice: r.i_damage_dice,
          damageType: r.i_damage_type,
          acBase: r.i_ac_base,
          strMin: r.i_str_min,
          stealthDisadvantage: !!r.i_stealth_disadvantage,
          properties: r.i_properties_json ? JSON.parse(r.i_properties_json) : [],
          imagePath: r.i_image_path,
        },
        quantity: r.quantity,
        equipped: !!r.equipped,
        notes: r.notes,
        addedAt: r.added_at,
      })) as any[];

      // Item weight
      const itemWeightKg = cleanEntries.reduce((sum: number, e: any) => {
        const w = e.item.weightKg;
        return sum + (typeof w === 'number' ? w * e.quantity : 0);
      }, 0);

      // Coin weight: 50 coins = 1 lb = 0.4536 kg, so 1 coin = 0.009072 kg
      const COIN_WEIGHT_KG = 0.4536 / 50;
      const coinCount = char.copper + char.silver + char.electrum + char.gold + char.platinum;
      const coinWeightKg = coinCount * COIN_WEIGHT_KG;

      const totalWeightKg = itemWeightKg + coinWeightKg;

      const encumbrance = computeEncumbrance(
        +totalWeightKg.toFixed(3),
        char.strength,
        char.encumbrance_mode,
        +coinWeightKg.toFixed(3),
      );

      const character = {
        id: char.id,
        partyId: char.party_id,
        ownerId: char.owner_id,
        ownerName: char.owner_name,
        name: char.name,
        strength: char.strength,
        notes: char.notes,
        copper: char.copper,
        silver: char.silver,
        electrum: char.electrum,
        gold: char.gold,
        platinum: char.platinum,
        createdAt: char.created_at,
      };

      const result: CharacterInventory = {
        character,
        entries: cleanEntries,
        encumbrance,
      };
      return reply.send(result);
    },
  );

  // ---------- Add item to inventory ----------
  app.post(
    '/characters/:id/inventory',
    async (
      req: FastifyRequest<{ Params: { id: string }; Body: AddInventoryPayload }>,
      reply: FastifyReply,
    ) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const db = getDb();
      const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(Number(req.params.id)) as any;
      if (!char) return reply.code(404).send({ error: 'character not found' });
      if (!isPartyMember(char.party_id, userId)) return reply.code(403).send({ error: 'not a member' });

      const body = req.body || ({} as AddInventoryPayload);
      if (!body.itemId) return reply.code(400).send({ error: 'itemId is required' });
      const qty = Math.max(1, body.quantity ?? 1);
      const equipped = body.equipped ? 1 : 0;
      const notes = body.notes || null;

      const result = db.prepare(`
        INSERT INTO inventory (character_id, item_id, quantity, equipped, notes)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(character_id, item_id) DO UPDATE SET
          quantity = quantity + excluded.quantity,
          equipped = excluded.equipped,
          notes = excluded.notes
      `).run(char.id, body.itemId, qty, equipped, notes);

      // Log transaction
      const itemRow = db.prepare('SELECT name FROM items WHERE id = ?').get(body.itemId) as any;
      db.prepare(`
        INSERT INTO transactions (party_id, character_id, item_id, item_name, delta_qty, reason, actor_user_id)
        VALUES (?, ?, ?, ?, ?, 'add', ?)
      `).run(char.party_id, char.id, body.itemId, itemRow?.name || 'item', qty, userId);

      const invRow = db.prepare(`
        SELECT inv.*, i.*
        FROM inventory inv JOIN items i ON i.id = inv.item_id
        WHERE inv.id = ?
      `).get(result.lastInsertRowid);
      bus.emitChange({ type: 'inventory:change', partyId: char.party_id, characterId: char.id, action: 'add', itemName: itemRow?.name_fr || itemRow?.name, actorUserId: userId });
      return reply.code(201).send({ entry: mapInventoryEntry(invRow) });
    },
  );

  // ---------- Update inventory entry (quantity, equipped, notes) ----------
  app.patch(
    '/inventory/:invId',
    async (
      req: FastifyRequest<{ Params: { invId: string }; Body: PatchInventoryPayload }>,
      reply: FastifyReply,
    ) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const db = getDb();
      const inv = db.prepare('SELECT * FROM inventory WHERE id = ?').get(Number(req.params.invId)) as any;
      if (!inv) return reply.code(404).send({ error: 'inventory entry not found' });
      const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(inv.character_id) as any;
      if (!isPartyMember(char.party_id, userId)) return reply.code(403).send({ error: 'not a member' });

      const body = req.body || {};
      const sets: string[] = [];
      const vals: any[] = [];
      const oldQty = inv.quantity;
      if (body.quantity !== undefined) {
        const q = Math.max(0, Math.floor(body.quantity));
        sets.push('quantity = ?');
        vals.push(q);
      }
      if (body.equipped !== undefined) {
        sets.push('equipped = ?');
        vals.push(body.equipped ? 1 : 0);
      }
      if (body.notes !== undefined) {
        sets.push('notes = ?');
        vals.push(body.notes);
      }
      if (sets.length === 0) return reply.code(400).send({ error: 'no fields to update' });
      vals.push(inv.id);
      db.prepare(`UPDATE inventory SET ${sets.join(', ')} WHERE id = ?`).run(...vals);

      // If quantity changed, log transaction
      if (body.quantity !== undefined) {
        const delta = body.quantity - oldQty;
        if (delta !== 0) {
          const itemRow = db.prepare('SELECT name FROM items WHERE id = ?').get(inv.item_id) as any;
          db.prepare(`
            INSERT INTO transactions (party_id, character_id, item_id, item_name, delta_qty, reason, actor_user_id)
            VALUES (?, ?, ?, ?, ?, 'adjust', ?)
          `).run(char.party_id, char.id, inv.item_id, itemRow?.name || 'item', delta, userId);
        }
      }

      // If quantity reached 0, delete the entry
      if (body.quantity === 0) {
        db.prepare('DELETE FROM inventory WHERE id = ?').run(inv.id);
        bus.emitChange({ type: 'inventory:change', partyId: char.party_id, characterId: char.id, action: 'remove', actorUserId: userId });
        return reply.code(204).send();
      }

      const row = db.prepare(`
        SELECT inv.*, i.* FROM inventory inv JOIN items i ON i.id = inv.item_id WHERE inv.id = ?
      `).get(inv.id);
      bus.emitChange({ type: 'inventory:change', partyId: char.party_id, characterId: char.id, action: 'adjust', actorUserId: userId });
      return reply.send({ entry: mapInventoryEntry(row) });
    },
  );

  // ---------- Delete inventory entry ----------
  app.delete(
    '/inventory/:invId',
    async (req: FastifyRequest<{ Params: { invId: string } }>, reply: FastifyReply) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const db = getDb();
      const inv = db.prepare('SELECT * FROM inventory WHERE id = ?').get(Number(req.params.invId)) as any;
      if (!inv) return reply.code(404).send({ error: 'inventory entry not found' });
      const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(inv.character_id) as any;
      if (!isPartyMember(char.party_id, userId)) return reply.code(403).send({ error: 'not a member' });

      const itemRow = db.prepare('SELECT name FROM items WHERE id = ?').get(inv.item_id) as any;
      db.prepare(`
        INSERT INTO transactions (party_id, character_id, item_id, item_name, delta_qty, reason, actor_user_id)
        VALUES (?, ?, ?, ?, ?, 'remove', ?)
      `).run(char.party_id, char.id, inv.item_id, itemRow?.name || 'item', -inv.quantity, userId);

      db.prepare('DELETE FROM inventory WHERE id = ?').run(inv.id);
      bus.emitChange({ type: 'inventory:change', partyId: char.party_id, characterId: char.id, action: 'remove', itemName: itemRow?.name_fr || itemRow?.name, actorUserId: userId });
      return reply.code(204).send();
    },
  );

  // ---------- Transfer item between characters ----------
  app.post(
    '/characters/:id/transfer',
    async (
      req: FastifyRequest<{ Params: { id: string }; Body: TransferPayload }>,
      reply: FastifyReply,
    ) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const fromCharId = Number(req.params.id);
      const { toCharacterId, inventoryId, quantity } = req.body || {};
      const qty = Math.max(1, Math.floor(quantity ?? 1));

      const db = getDb();
      const fromChar = db.prepare('SELECT * FROM characters WHERE id = ?').get(fromCharId) as any;
      const toChar = db.prepare('SELECT * FROM characters WHERE id = ?').get(toCharacterId) as any;
      if (!fromChar || !toChar) return reply.code(404).send({ error: 'character not found' });
      if (fromChar.party_id !== toChar.party_id) {
        return reply.code(400).send({ error: 'characters must be in the same party' });
      }
      if (!isPartyMember(fromChar.party_id, userId)) {
        return reply.code(403).send({ error: 'not a member' });
      }

      const inv = db.prepare('SELECT * FROM inventory WHERE id = ?').get(inventoryId) as any;
      if (!inv || inv.character_id !== fromCharId) {
        return reply.code(404).send({ error: 'inventory entry not found for this character' });
      }
      if (qty > inv.quantity) return reply.code(400).send({ error: 'not enough quantity to transfer' });

      const tx = db.transaction(() => {
        // Remove from source
        if (qty >= inv.quantity) {
          db.prepare('DELETE FROM inventory WHERE id = ?').run(inv.id);
        } else {
          db.prepare('UPDATE inventory SET quantity = quantity - ? WHERE id = ?').run(qty, inv.id);
        }
        // Add to destination
        db.prepare(`
          INSERT INTO inventory (character_id, item_id, quantity, equipped, notes)
          VALUES (?, ?, ?, 0, NULL)
          ON CONFLICT(character_id, item_id) DO UPDATE SET quantity = quantity + excluded.quantity
        `).run(toCharacterId, inv.item_id, qty);

        const itemRow = db.prepare('SELECT name FROM items WHERE id = ?').get(inv.item_id) as any;
        const itemName = itemRow?.name || 'item';
        db.prepare(`
          INSERT INTO transactions (party_id, character_id, item_id, item_name, delta_qty, reason, actor_user_id)
          VALUES (?, ?, ?, ?, ?, 'transfer-out', ?)
        `).run(fromChar.party_id, fromCharId, inv.item_id, itemName, -qty, userId);
        db.prepare(`
          INSERT INTO transactions (party_id, character_id, item_id, item_name, delta_qty, reason, actor_user_id)
          VALUES (?, ?, ?, ?, ?, 'transfer-in', ?)
        `).run(toChar.party_id, toCharacterId, inv.item_id, itemName, qty, userId);
      });
      tx();

      // Emit events for both source and destination characters
      bus.emitChange({ type: 'inventory:change', partyId: fromChar.party_id, characterId: fromCharId, toCharacterId, action: 'transfer', itemName, actorUserId: userId });

      return reply.code(200).send({ transferred: qty });
    },
  );

  // ---------- GM: transaction log for a party ----------
  app.get(
    '/parties/:partyId/transactions',
    async (req: FastifyRequest<{ Params: { partyId: string } }>, reply: FastifyReply) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const partyId = Number(req.params.partyId);
      if (!isPartyGM(partyId, userId)) return reply.code(403).send({ error: 'GM only' });

      const db = getDb();
      const rows = db.prepare(`
        SELECT t.*, u.display_name AS actor_name
        FROM transactions t LEFT JOIN users u ON u.id = t.actor_user_id
        WHERE t.party_id = ?
        ORDER BY t.at DESC, t.id DESC
        LIMIT 200
      `).all(partyId);
      return reply.send({
        transactions: rows.map((r: any) => ({
          id: r.id,
          partyId: r.party_id,
          characterId: r.character_id,
          itemId: r.item_id,
          itemName: r.item_name,
          deltaQty: r.delta_qty,
          reason: r.reason,
          actorName: r.actor_name,
          at: r.at,
        })),
      });
    },
  );
}
