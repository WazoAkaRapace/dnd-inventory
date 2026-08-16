/**
 * NPC routes: CRUD with party-level sharing + private visibility.
 * Any party member can create NPCs. Creator chooses shared/private.
 * Secrets are visible only to creator + GM.
 */

import type { CreateNpcPayload, PatchNpcPayload } from '@dnd-inventory/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getDb } from '../db/index.ts';
import { bus } from '../sync/bus.ts';
import { isPartyGM, isPartyMember, requireUser } from './helpers.ts';

export interface NpcRow {
  id: number;
  partyId: number;
  createdBy: number;
  createdByName: string;
  name: string;
  role: string | null;
  location: string | null;
  faction: string | null;
  disposition: string;
  status: string;
  description: string | null;
  secret: string | null;
  isShared: boolean;
  sortOrder: number;
}

function mapNpc(row: any, includeSecret: boolean): NpcRow {
  return {
    id: row.id,
    partyId: row.party_id,
    createdBy: row.created_by,
    createdByName: row.creator_name ?? '',
    name: row.name,
    role: row.role,
    location: row.location,
    faction: row.faction,
    disposition: row.disposition,
    status: row.status,
    description: row.description,
    secret: includeSecret ? row.secret || null : null,
    isShared: !!row.is_shared,
    sortOrder: row.sort_order ?? 0,
  };
}

export async function npcRoutes(app: FastifyInstance) {
  // ---------- List NPCs visible to the requesting user ----------
  app.get(
    '/parties/:partyId/npcs',
    async (req: FastifyRequest<{ Params: { partyId: string } }>, reply: FastifyReply) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const partyId = Number(req.params.partyId);
      if (!isPartyMember(partyId, userId)) return reply.code(403).send({ error: 'not a member' });

      const gm = isPartyGM(partyId, userId);
      const db = getDb();

      // GM sees all; players see shared + their own private
      const where = gm ? 'party_id = ?' : '(party_id = ? AND (is_shared = 1 OR created_by = ?))';
      const params = gm ? [partyId] : [partyId, userId];

      const rows = db
        .prepare(`
        SELECT n.*, u.display_name AS creator_name
        FROM npcs n JOIN users u ON u.id = n.created_by
        WHERE ${where}
        ORDER BY n.sort_order, n.name COLLATE NOCASE ASC
      `)
        .all(...params);

      const npcs = rows.map((r: any) => {
        // Secret visible to creator + GM
        const canSeeSecret = gm || r.created_by === userId;
        return mapNpc(r, canSeeSecret);
      });

      return reply.send({ npcs });
    },
  );

  // ---------- Create NPC ----------
  app.post(
    '/parties/:partyId/npcs',
    async (
      req: FastifyRequest<{ Params: { partyId: string }; Body: CreateNpcPayload }>,
      reply: FastifyReply,
    ) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const partyId = Number(req.params.partyId);
      if (!isPartyMember(partyId, userId)) return reply.code(403).send({ error: 'not a member' });

      const body = req.body || ({} as CreateNpcPayload);
      if (!body.name?.trim()) return reply.code(400).send({ error: 'name is required' });

      const db = getDb();
      const maxOrder =
        (db.prepare('SELECT MAX(sort_order) as m FROM npcs WHERE party_id = ?').get(partyId) as any)
          ?.m ?? 0;

      const info = db
        .prepare(`
        INSERT INTO npcs (party_id, created_by, name, role, location, faction, disposition, status, description, secret, is_shared, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
        .run(
          partyId,
          userId,
          body.name.trim(),
          body.role || null,
          body.location || null,
          body.faction || null,
          body.disposition || 'neutral',
          body.status || 'alive',
          body.description || null,
          body.secret || null,
          body.isShared === false ? 0 : 1,
          maxOrder + 1,
        );

      const row = db
        .prepare(`
        SELECT n.*, u.display_name AS creator_name
        FROM npcs n JOIN users u ON u.id = n.created_by
        WHERE n.id = ?
      `)
        .get(info.lastInsertRowid);

      bus.emitChange({ type: 'party:change', partyId, action: 'custom-item', actorUserId: userId });

      return reply.code(201).send({ npc: mapNpc(row, true) });
    },
  );

  // ---------- Update NPC (creator or GM) ----------
  app.patch(
    '/npcs/:npcId',
    async (
      req: FastifyRequest<{ Params: { npcId: string }; Body: PatchNpcPayload }>,
      reply: FastifyReply,
    ) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const db = getDb();
      const npc = db
        .prepare('SELECT * FROM npcs WHERE id = ?')
        .get(Number(req.params.npcId)) as any;
      if (!npc) return reply.code(404).send({ error: 'NPC not found' });

      const gm = isPartyGM(npc.party_id, userId);
      if (npc.created_by !== userId && !gm) {
        return reply.code(403).send({ error: 'only the creator or GM can edit' });
      }

      const body = req.body || {};
      const sets: string[] = [];
      const vals: any[] = [];
      const editable: Array<[keyof PatchNpcPayload, string]> = [
        ['name', 'name'],
        ['role', 'role'],
        ['location', 'location'],
        ['faction', 'faction'],
        ['disposition', 'disposition'],
        ['status', 'status'],
        ['description', 'description'],
        ['secret', 'secret'],
      ];
      for (const [key, col] of editable) {
        const val = (body as Record<string, unknown>)[key];
        if (val === undefined) continue;
        sets.push(`${col} = ?`);
        vals.push(val);
      }
      if (body.isShared !== undefined) {
        sets.push('is_shared = ?');
        vals.push(body.isShared ? 1 : 0);
      }

      if (sets.length === 0) return reply.code(400).send({ error: 'no fields to update' });
      vals.push(npc.id);
      db.prepare(`UPDATE npcs SET ${sets.join(', ')} WHERE id = ?`).run(...vals);

      const row = db
        .prepare(`
        SELECT n.*, u.display_name AS creator_name
        FROM npcs n JOIN users u ON u.id = n.created_by
        WHERE n.id = ?
      `)
        .get(npc.id);

      bus.emitChange({
        type: 'party:change',
        partyId: npc.party_id,
        action: 'custom-item',
        actorUserId: userId,
      });

      return reply.send({ npc: mapNpc(row, gm || row.created_by === userId) });
    },
  );

  // ---------- Delete NPC (creator or GM) ----------
  app.delete(
    '/npcs/:npcId',
    async (req: FastifyRequest<{ Params: { npcId: string } }>, reply: FastifyReply) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const db = getDb();
      const npc = db
        .prepare('SELECT * FROM npcs WHERE id = ?')
        .get(Number(req.params.npcId)) as any;
      if (!npc) return reply.code(404).send({ error: 'NPC not found' });

      const gm = isPartyGM(npc.party_id, userId);
      if (npc.created_by !== userId && !gm) {
        return reply.code(403).send({ error: 'only the creator or GM can delete' });
      }

      db.prepare('DELETE FROM npcs WHERE id = ?').run(npc.id);
      bus.emitChange({
        type: 'party:change',
        partyId: npc.party_id,
        action: 'custom-item',
        actorUserId: userId,
      });

      return reply.code(204).send();
    },
  );
}
