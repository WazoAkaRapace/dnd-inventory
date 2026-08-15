/**
 * Party routes: create, list, detail, join, update.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getDb } from '../db/index.ts';
import { bus } from '../sync/bus.ts';
import {
  requireUser,
  isPartyMember,
  isPartyGM,
  generateInviteCode,
  mapCharacterSummary,
} from './helpers.ts';
import type { CreatePartyPayload, JoinPartyPayload, EncumbranceMode, PartyRole } from '@dnd-inventory/shared';

export async function partyRoutes(app: FastifyInstance) {
  // ---------- List my parties ----------
  app.get('/parties', async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = requireUser(req, reply);
    if (userId === null) return;
    const db = getDb();
    const rows = db.prepare(`
      SELECT p.*, pm.role, u.display_name AS gm_name
      FROM parties p
      JOIN party_members pm ON pm.party_id = p.id AND pm.user_id = ?
      LEFT JOIN users u ON u.id = p.gm_user_id
      ORDER BY p.created_at DESC
    `).all(userId);
    return reply.send({
      parties: rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        gmUserId: r.gm_user_id,
        gmName: r.gm_name,
        inviteCode: r.invite_code,
        encumbranceMode: r.encumbrance_mode,
        role: r.role,
        createdAt: r.created_at,
      })),
    });
  });

  // ---------- Create party (creator becomes GM) ----------
  app.post(
    '/parties',
    async (req: FastifyRequest<{ Body: CreatePartyPayload }>, reply: FastifyReply) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const { name, encumbranceMode } = req.body || { name: '', encumbranceMode: 'variant' };
      if (!name || !name.trim()) return reply.code(400).send({ error: 'name is required' });
      const mode = (['variant', 'standard', 'slots'].includes(encumbranceMode)
        ? encumbranceMode
        : 'variant') as EncumbranceMode;

      const db = getDb();
      const code = generateInviteCode();
      const tx = db.transaction(() => {
        const info = db.prepare(`
          INSERT INTO parties (name, gm_user_id, invite_code, encumbrance_mode)
          VALUES (?, ?, ?, ?)
        `).run(name.trim(), userId, code, mode);
        const partyId = info.lastInsertRowid;
        db.prepare(`
          INSERT INTO party_members (party_id, user_id, role) VALUES (?, ?, 'gm')
        `).run(partyId, userId);
        return partyId;
      });
      const partyId = tx();
      const row = db.prepare('SELECT * FROM parties WHERE id = ?').get(partyId) as any;
      return reply.code(201).send({
        party: {
          id: row.id,
          name: row.name,
          gmUserId: row.gm_user_id,
          inviteCode: row.invite_code,
          encumbranceMode: row.encumbrance_mode,
          createdAt: row.created_at,
        },
      });
    },
  );

  // ---------- Party detail ----------
  app.get('/parties/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const userId = requireUser(req, reply);
    if (userId === null) return;
    const partyId = Number(req.params.id);
    if (!isPartyMember(partyId, userId)) return reply.code(403).send({ error: 'not a member' });

    const db = getDb();
    const party = db.prepare('SELECT * FROM parties WHERE id = ?').get(partyId) as any;
    if (!party) return reply.code(404).send({ error: 'party not found' });

    const members = db.prepare(`
      SELECT pm.*, u.username, u.display_name
      FROM party_members pm JOIN users u ON u.id = pm.user_id
      WHERE pm.party_id = ?
      ORDER BY pm.role DESC, pm.joined_at ASC
    `).all(partyId);
    const characters = db.prepare(`
      SELECT c.*, u.display_name AS owner_name
      FROM characters c JOIN users u ON u.id = c.owner_id
      WHERE c.party_id = ?
      ORDER BY c.name COLLATE NOCASE ASC
    `).all(partyId);

    return reply.send({
      party: {
        id: party.id,
        name: party.name,
        gmUserId: party.gm_user_id,
        inviteCode: party.invite_code,
        encumbranceMode: party.encumbrance_mode,
        createdAt: party.created_at,
      },
      members: members.map((m: any) => ({
        userId: m.user_id,
        username: m.username,
        displayName: m.display_name,
        role: m.role as PartyRole,
        joinedAt: m.joined_at,
      })),
      characters: characters.map(mapCharacterSummary),
    });
  });

  // ---------- Join party via invite code ----------
  app.post(
    '/parties/join',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req: FastifyRequest<{ Body: JoinPartyPayload }>, reply: FastifyReply) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const { inviteCode } = req.body || {};
      if (!inviteCode) return reply.code(400).send({ error: 'inviteCode is required' });

      const db = getDb();
      const party = db.prepare('SELECT * FROM parties WHERE invite_code = ?').get(inviteCode.toUpperCase()) as any;
      if (!party) return reply.code(404).send({ error: 'invalid invite code' });

      const already = db.prepare(
        'SELECT 1 FROM party_members WHERE party_id = ? AND user_id = ?',
      ).get(party.id, userId);
      if (already) return reply.code(409).send({ error: 'already a member', partyId: party.id });

      db.prepare(`
        INSERT INTO party_members (party_id, user_id, role) VALUES (?, ?, 'player')
      `).run(party.id, userId);

      bus.emitChange({ type: 'party:change', partyId: party.id, action: 'join', actorUserId: userId });
      return reply.code(201).send({ partyId: party.id });
    },
  );

  // ---------- Update party (GM only) ----------
  app.patch(
    '/parties/:id',
    async (
      req: FastifyRequest<{ Params: { id: string }; Body: { name?: string; encumbranceMode?: EncumbranceMode } }>,
      reply: FastifyReply,
    ) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const partyId = Number(req.params.id);
      if (!isPartyGM(partyId, userId)) return reply.code(403).send({ error: 'GM only' });

      const { name, encumbranceMode } = req.body || {};
      const db = getDb();
      if (name !== undefined) {
        if (!name.trim()) return reply.code(400).send({ error: 'name cannot be empty' });
        db.prepare('UPDATE parties SET name = ? WHERE id = ?').run(name.trim(), partyId);
      }
      if (encumbranceMode !== undefined) {
        if (!['variant', 'standard', 'slots'].includes(encumbranceMode)) {
          return reply.code(400).send({ error: 'invalid encumbranceMode' });
        }
        db.prepare('UPDATE parties SET encumbrance_mode = ? WHERE id = ?').run(encumbranceMode, partyId);
      }
      const row = db.prepare('SELECT * FROM parties WHERE id = ?').get(partyId) as any;
      bus.emitChange({ type: 'party:change', partyId, action: 'stats', actorUserId: userId });
      return reply.send({
        party: {
          id: row.id,
          name: row.name,
          gmUserId: row.gm_user_id,
          inviteCode: row.invite_code,
          encumbranceMode: row.encumbrance_mode,
          createdAt: row.created_at,
        },
      });
    },
  );
}
