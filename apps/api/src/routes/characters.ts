/**
 * Character routes: create, list, get, update, delete.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getDb } from '../db/index.ts';
import { bus } from '../sync/bus.ts';
import {
  requireUser,
  isPartyMember,
  isPartyGM,
  mapCharacter,
  mapCharacterSummary,
} from './helpers.ts';
import type { CreateCharacterPayload, PatchCharacterPayload } from '@dnd-inventory/shared';

export async function characterRoutes(app: FastifyInstance) {
  // ---------- Create character in a party ----------
  app.post(
    '/parties/:partyId/characters',
    async (
      req: FastifyRequest<{ Params: { partyId: string }; Body: CreateCharacterPayload }>,
      reply: FastifyReply,
    ) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const partyId = Number(req.params.partyId);
      if (!isPartyMember(partyId, userId)) return reply.code(403).send({ error: 'not a member' });

      const body = req.body || ({} as CreateCharacterPayload);
      if (!body.name || !body.name.trim()) return reply.code(400).send({ error: 'name is required' });
      const strength = body.strength ?? 10;
      if (strength < 1) return reply.code(400).send({ error: 'strength must be ≥ 1' });
      const maxHp = body.maxHp ?? 1;
      const currentHp = body.currentHp ?? maxHp;

      const db = getDb();
      const info = db.prepare(`
        INSERT INTO characters
          (party_id, owner_id, name, race, class_name, level, strength, max_hp, current_hp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        partyId,
        userId,
        body.name.trim(),
        body.race || null,
        body.className || null,
        body.level || 1,
        strength,
        maxHp,
        currentHp,
      );
      const row = db.prepare(`
        SELECT c.*, u.display_name AS owner_name
        FROM characters c JOIN users u ON u.id = c.owner_id
        WHERE c.id = ?
      `).get(info.lastInsertRowid);
      bus.emitChange({ type: 'party:change', partyId, characterId: info.lastInsertRowid as number, action: 'stats', actorUserId: userId });
      return reply.code(201).send({ character: mapCharacterSummary(row) });
    },
  );

  // ---------- List characters in a party ----------
  app.get(
    '/parties/:partyId/characters',
    async (req: FastifyRequest<{ Params: { partyId: string } }>, reply: FastifyReply) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const partyId = Number(req.params.partyId);
      if (!isPartyMember(partyId, userId)) return reply.code(403).send({ error: 'not a member' });

      const db = getDb();
      const rows = db.prepare(`
        SELECT c.*, u.display_name AS owner_name
        FROM characters c JOIN users u ON u.id = c.owner_id
        WHERE c.party_id = ?
        ORDER BY c.name COLLATE NOCASE ASC
      `).all(partyId);
      return reply.send({ characters: rows.map(mapCharacterSummary) });
    },
  );

  // ---------- Get single character ----------
  app.get('/characters/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const userId = requireUser(req, reply);
    if (userId === null) return;
    const db = getDb();
    const row = db.prepare(`
      SELECT c.*, u.display_name AS owner_name
      FROM characters c JOIN users u ON u.id = c.owner_id
      WHERE c.id = ?
    `).get(Number(req.params.id)) as any;
    if (!row) return reply.code(404).send({ error: 'character not found' });
    if (!isPartyMember(row.party_id, userId)) return reply.code(403).send({ error: 'not a member' });
    return reply.send({ character: mapCharacter(row) });
  });

  // ---------- Update character ----------
  app.patch(
    '/characters/:id',
    async (req: FastifyRequest<{ Params: { id: string }; Body: PatchCharacterPayload }>, reply: FastifyReply) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const db = getDb();
      const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(Number(req.params.id)) as any;
      if (!char) return reply.code(404).send({ error: 'character not found' });
      // Owner or GM can edit
      const isGM = isPartyGM(char.party_id, userId);
      if (char.owner_id !== userId && !isGM) {
        return reply.code(403).send({ error: 'only the owner or GM can edit' });
      }

      const body = req.body || {};
      const allowed: (keyof PatchCharacterPayload)[] = [
        'name', 'race', 'className', 'level', 'strength', 'maxHp', 'currentHp',
        'notes', 'copper', 'silver', 'electrum', 'gold', 'platinum',
      ];
      const sets: string[] = [];
      const vals: any[] = [];
      const fieldMap: Record<string, string> = {
        className: 'class_name',
        maxHp: 'max_hp',
        currentHp: 'current_hp',
      };
      for (const key of allowed) {
        if (body[key] !== undefined) {
          const col = fieldMap[key as string] || key;
          sets.push(`${col} = ?`);
          vals.push(body[key]);
        }
      }
      if (sets.length === 0) return reply.code(400).send({ error: 'no fields to update' });
      vals.push(char.id);
      db.prepare(`UPDATE characters SET ${sets.join(', ')} WHERE id = ?`).run(...vals);

      const row = db.prepare(`
        SELECT c.*, u.display_name AS owner_name
        FROM characters c JOIN users u ON u.id = c.owner_id
        WHERE c.id = ?
      `).get(char.id);
      // Detect if this was a coin change vs stat change for the event action
      const coinKeys = ['copper', 'silver', 'electrum', 'gold', 'platinum'];
      const isCoinChange = Object.keys(body).some((k) => coinKeys.includes(k));
      bus.emitChange({ type: 'character:change', partyId: char.party_id, characterId: char.id, action: isCoinChange ? 'coins' : 'stats', actorUserId: userId });
      return reply.send({ character: mapCharacter(row) });
    },
  );

  // ---------- Delete character ----------
  app.delete('/characters/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const userId = requireUser(req, reply);
    if (userId === null) return;
    const db = getDb();
    const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(Number(req.params.id)) as any;
    if (!char) return reply.code(404).send({ error: 'character not found' });
    const isGM = isPartyGM(char.party_id, userId);
    if (char.owner_id !== userId && !isGM) {
      return reply.code(403).send({ error: 'only the owner or GM can delete' });
    }
    db.prepare('DELETE FROM characters WHERE id = ?').run(char.id);
    bus.emitChange({ type: 'party:change', partyId: char.party_id, characterId: char.id, action: 'stats', actorUserId: userId });
    return reply.code(204).send();
  });
}
