/**
 * Storage locations routes: CRUD for mounts, containers, and carried.
 * Each character gets a default "carried" location on creation.
 */

import type { CreateStorageLocationPayload } from '@dnd-inventory/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getDb } from '../db/index.ts';
import { bus } from '../sync/bus.ts';
import { characterVisibleTo, isOwnerOrGM, isPartyMember, requireUser } from './helpers.ts';

/** Ensure a character has a default "carried" location. Returns its ID. */
export function ensureCarriedLocation(db: any, characterId: number): number {
  const existing = db
    .prepare("SELECT id FROM storage_locations WHERE character_id = ? AND type = 'carried'")
    .get(characterId);
  if (existing) return existing.id;

  const info = db
    .prepare(`
    INSERT INTO storage_locations (character_id, name, type, sort_order)
    VALUES (?, 'Sur moi', 'carried', 0)
  `)
    .run(characterId);
  return info.lastInsertRowid as number;
}

export async function locationRoutes(app: FastifyInstance) {
  // ---------- List locations for a character ----------
  app.get(
    '/characters/:id/locations',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const db = getDb();
      const char = db
        .prepare('SELECT * FROM characters WHERE id = ?')
        .get(Number(req.params.id)) as any;
      if (!char) return reply.code(404).send({ error: 'character not found' });
      if (!isPartyMember(char.party_id, userId))
        return reply.code(403).send({ error: 'not a member' });
      // Hidden character: 404 for everyone but its owner and the GM
      if (!characterVisibleTo(char, userId))
        return reply.code(404).send({ error: 'character not found' });

      // Ensure carried exists
      ensureCarriedLocation(db, char.id);

      const rows = db
        .prepare(`
        SELECT * FROM storage_locations WHERE character_id = ? ORDER BY sort_order, type, id
      `)
        .all(char.id);

      return reply.send({
        locations: rows.map((r: any) => ({
          id: r.id,
          characterId: r.character_id,
          name: r.name,
          type: r.type,
          strength: r.strength,
          multiplier: r.multiplier,
          capacityKg: r.capacity_kg,
          ownWeightKg: r.own_weight_kg,
          itemId: r.item_id,
          sortOrder: r.sort_order,
        })),
      });
    },
  );

  // ---------- Create a storage location ----------
  app.post(
    '/characters/:id/locations',
    async (
      req: FastifyRequest<{ Params: { id: string }; Body: CreateStorageLocationPayload }>,
      reply: FastifyReply,
    ) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const db = getDb();
      const char = db
        .prepare('SELECT * FROM characters WHERE id = ?')
        .get(Number(req.params.id)) as any;
      if (!char) return reply.code(404).send({ error: 'character not found' });
      if (!isOwnerOrGM(char, userId))
        return reply.code(403).send({ error: 'only the owner or GM can edit this inventory' });

      const body = req.body || ({} as CreateStorageLocationPayload);
      if (!body.name?.trim()) return reply.code(400).send({ error: 'name is required' });

      const maxOrder =
        (
          db
            .prepare('SELECT MAX(sort_order) as m FROM storage_locations WHERE character_id = ?')
            .get(char.id) as any
        )?.m ?? 0;

      const info = db
        .prepare(`
        INSERT INTO storage_locations (character_id, name, type, strength, multiplier, capacity_kg, own_weight_kg, item_id, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
        .run(
          char.id,
          body.name.trim(),
          body.type || 'mount',
          body.strength ?? null,
          body.multiplier ?? 1,
          body.capacityKg ?? null,
          body.ownWeightKg ?? 0,
          body.itemId ?? null,
          maxOrder + 1,
        );

      const row = db
        .prepare('SELECT * FROM storage_locations WHERE id = ?')
        .get(info.lastInsertRowid) as any;

      bus.emitChange({
        type: 'inventory:change',
        partyId: char.party_id,
        characterId: char.id,
        action: 'adjust',
      });

      return reply.code(201).send({
        location: {
          id: row.id,
          characterId: row.character_id,
          name: row.name,
          type: row.type,
          strength: row.strength,
          multiplier: row.multiplier,
          capacityKg: row.capacity_kg,
          ownWeightKg: row.own_weight_kg,
          itemId: row.item_id,
          sortOrder: row.sort_order,
        },
      });
    },
  );

  // ---------- Delete a storage location ----------
  app.delete(
    '/locations/:locId',
    async (req: FastifyRequest<{ Params: { locId: string } }>, reply: FastifyReply) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const db = getDb();
      const loc = db
        .prepare('SELECT * FROM storage_locations WHERE id = ?')
        .get(Number(req.params.locId)) as any;
      if (!loc) return reply.code(404).send({ error: 'location not found' });

      // Don't allow deleting the carried location
      if (loc.type === 'carried')
        return reply.code(400).send({ error: 'cannot delete carried location' });

      const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(loc.character_id) as any;
      if (!isOwnerOrGM(char, userId))
        return reply.code(403).send({ error: 'only the owner or GM can edit this inventory' });

      // Move items back to carried (merge with existing entries to avoid UNIQUE constraint)
      const carriedId = ensureCarriedLocation(db, char.id);

      // For each item on this location, either add to existing carried entry or move
      const itemsToMove = db
        .prepare(
          'SELECT id, item_id, quantity, equipped, notes FROM inventory WHERE storage_location_id = ?',
        )
        .all(loc.id) as any[];

      for (const item of itemsToMove) {
        const existing = db
          .prepare(
            'SELECT id, quantity FROM inventory WHERE character_id = ? AND item_id = ? AND storage_location_id = ?',
          )
          .get(char.id, item.item_id, carriedId) as any;

        if (existing) {
          // Merge: add quantity to existing entry, delete the moving one
          db.prepare('UPDATE inventory SET quantity = quantity + ? WHERE id = ?').run(
            item.quantity,
            existing.id,
          );
          db.prepare('DELETE FROM inventory WHERE id = ?').run(item.id);
        } else {
          // Just move it
          db.prepare('UPDATE inventory SET storage_location_id = ? WHERE id = ?').run(
            carriedId,
            item.id,
          );
        }
      }

      db.prepare('DELETE FROM storage_locations WHERE id = ?').run(loc.id);

      bus.emitChange({
        type: 'inventory:change',
        partyId: char.party_id,
        characterId: char.id,
        action: 'adjust',
      });

      return reply.code(204).send();
    },
  );
}
