/**
 * Party routes: create, list, detail, join, update.
 */

import type {
  CreatePartyPayload,
  EncumbranceMode,
  JoinPartyPayload,
  PartyRole,
} from '@dnd-inventory/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getDb } from '../db/index.ts';
import { bus } from '../sync/bus.ts';
import {
  generateInviteCode,
  isPartyGM,
  isPartyMember,
  mapCharacterSummary,
  requireUser,
} from './helpers.ts';

export async function partyRoutes(app: FastifyInstance) {
  // ---------- List my parties ----------
  app.get('/parties', async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = requireUser(req, reply);
    if (userId === null) return;
    const db = getDb();
    const rows = db
      .prepare(`
      SELECT p.*, pm.role, u.display_name AS gm_name,
        (SELECT COUNT(*) FROM party_members x WHERE x.party_id = p.id) AS member_count
      FROM parties p
      JOIN party_members pm ON pm.party_id = p.id AND pm.user_id = ?
      LEFT JOIN users u ON u.id = p.gm_user_id
      ORDER BY p.created_at DESC
    `)
      .all(userId);
    // Roster names for the register's current entry — parties are few, one batched query.
    // Hidden characters of other owners stay out of the names AND the count
    // (the GM still sees them — GM runs the game).
    const partyIds: number[] = rows.map((r: any) => r.id);
    const rosterByParty = new Map<number, string[]>();
    if (partyIds.length > 0) {
      const placeholders = partyIds.map(() => '?').join(',');
      const nameRows = db
        .prepare(
          `SELECT party_id, name, hidden, owner_id FROM characters WHERE party_id IN (${placeholders})
           ORDER BY name COLLATE NOCASE ASC`,
        )
        .all(...partyIds) as any[];
      for (const nr of nameRows) {
        if (nr.hidden && nr.owner_id !== userId && !isPartyGM(nr.party_id, userId)) continue;
        const list = rosterByParty.get(nr.party_id) ?? [];
        list.push(nr.name);
        rosterByParty.set(nr.party_id, list);
      }
    }
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
        memberCount: r.member_count,
        characterCount: rosterByParty.get(r.id)?.length ?? 0,
        characterNames: rosterByParty.get(r.id) ?? [],
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
      if (!name?.trim()) return reply.code(400).send({ error: 'name is required' });
      const mode = (
        ['variant', 'standard', 'slots'].includes(encumbranceMode) ? encumbranceMode : 'variant'
      ) as EncumbranceMode;

      const db = getDb();
      const code = generateInviteCode();
      const tx = db.transaction(() => {
        const info = db
          .prepare(`
          INSERT INTO parties (name, gm_user_id, invite_code, encumbrance_mode)
          VALUES (?, ?, ?, ?)
        `)
          .run(name.trim(), userId, code, mode);
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
  app.get(
    '/parties/:id',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const partyId = Number(req.params.id);
      if (!isPartyMember(partyId, userId)) return reply.code(403).send({ error: 'not a member' });

      const db = getDb();
      const party = db.prepare('SELECT * FROM parties WHERE id = ?').get(partyId) as any;
      if (!party) return reply.code(404).send({ error: 'party not found' });

      const members = db
        .prepare(`
      SELECT pm.*, u.username, u.display_name
      FROM party_members pm JOIN users u ON u.id = pm.user_id
      WHERE pm.party_id = ?
      ORDER BY pm.role DESC, pm.joined_at ASC
    `)
        .all(partyId);
      const banned = db
        .prepare(`
      SELECT b.*, u.username, u.display_name
      FROM party_bans b JOIN users u ON u.id = b.user_id
      WHERE b.party_id = ?
      ORDER BY b.banned_at ASC
    `)
        .all(partyId);
      const characters = db
        .prepare(`
      SELECT c.*, u.display_name AS owner_name
      FROM characters c JOIN users u ON u.id = c.owner_id
      WHERE c.party_id = ?
      ORDER BY c.name COLLATE NOCASE ASC
    `)
        .all(partyId);
      // Hidden (secret prep) characters stay out of other players' views —
      // the owner and the GM (from the members rows above) still see them.
      const callerIsGM = members.some((m: any) => m.user_id === userId && m.role === 'gm');
      const visibleCharacters = characters.filter(
        (c: any) => !c.hidden || c.owner_id === userId || callerIsGM,
      );

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
        banned: banned.map((b: any) => ({
          userId: b.user_id,
          username: b.username,
          displayName: b.display_name,
          bannedAt: b.banned_at,
        })),
        characters: visibleCharacters.map(mapCharacterSummary),
      });
    },
  );

  // ---------- Join party via invite code ----------
  app.post(
    '/parties/join',

    async (req: FastifyRequest<{ Body: JoinPartyPayload }>, reply: FastifyReply) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const { inviteCode } = req.body || {};
      if (!inviteCode) return reply.code(400).send({ error: 'inviteCode is required' });

      const db = getDb();
      const party = db
        .prepare('SELECT * FROM parties WHERE invite_code = ?')
        .get(inviteCode.toUpperCase()) as any;
      if (!party) return reply.code(404).send({ error: 'invalid invite code' });

      const banned = db
        .prepare('SELECT 1 FROM party_bans WHERE party_id = ? AND user_id = ?')
        .get(party.id, userId);
      if (banned) return reply.code(403).send({ error: 'banned from this party' });

      const already = db
        .prepare('SELECT 1 FROM party_members WHERE party_id = ? AND user_id = ?')
        .get(party.id, userId);
      if (already) return reply.code(409).send({ error: 'already a member', partyId: party.id });

      db.prepare(`
        INSERT INTO party_members (party_id, user_id, role) VALUES (?, ?, 'player')
      `).run(party.id, userId);

      bus.emitChange({
        type: 'party:change',
        partyId: party.id,
        action: 'join',
        actorUserId: userId,
      });
      return reply.code(201).send({ partyId: party.id });
    },
  );

  // ---------- Remove a member (GM only) — door stays open, invite code works ----------
  app.delete(
    '/parties/:id/members/:userId',
    async (req: FastifyRequest<{ Params: { id: string; userId: string } }>, reply) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const partyId = Number(req.params.id);
      const targetId = Number(req.params.userId);
      if (!isPartyGM(partyId, userId)) return reply.code(403).send({ error: 'GM only' });

      const db = getDb();
      const target = db
        .prepare('SELECT * FROM party_members WHERE party_id = ? AND user_id = ?')
        .get(partyId, targetId) as any;
      if (!target) return reply.code(404).send({ error: 'member not found' });
      if (target.role === 'gm') return reply.code(403).send({ error: 'cannot remove the GM' });

      db.prepare('DELETE FROM party_members WHERE party_id = ? AND user_id = ?').run(
        partyId,
        targetId,
      );
      // Characters stay in the party — the sheet survives, only the seat is freed.
      bus.emitChange({
        type: 'party:change',
        partyId,
        action: 'remove',
        actorUserId: userId,
        targetUserId: targetId,
      });
      return reply.send({ ok: true });
    },
  );

  // ---------- Ban a member (GM only) — seat freed AND the invite code is locked for them ----------
  app.post(
    '/parties/:id/bans',
    async (req: FastifyRequest<{ Params: { id: string }; Body: { userId?: number } }>, reply) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const partyId = Number(req.params.id);
      const targetId = Number(req.body?.userId);
      if (!targetId) return reply.code(400).send({ error: 'userId is required' });
      if (!isPartyGM(partyId, userId)) return reply.code(403).send({ error: 'GM only' });

      const db = getDb();
      const target = db
        .prepare('SELECT * FROM party_members WHERE party_id = ? AND user_id = ?')
        .get(partyId, targetId) as any;
      if (!target) return reply.code(404).send({ error: 'member not found' });
      if (target.role === 'gm') return reply.code(403).send({ error: 'cannot ban the GM' });

      const tx = db.transaction(() => {
        db.prepare('DELETE FROM party_members WHERE party_id = ? AND user_id = ?').run(
          partyId,
          targetId,
        );
        db.prepare(`
          INSERT OR REPLACE INTO party_bans (party_id, user_id, banned_at)
          VALUES (?, ?, datetime('now'))
        `).run(partyId, targetId);
      });
      tx();
      bus.emitChange({
        type: 'party:change',
        partyId,
        action: 'ban',
        actorUserId: userId,
        targetUserId: targetId,
      });
      return reply.code(201).send({ ok: true });
    },
  );

  // ---------- Unban (GM only) — the invite code works again, no auto re-seat ----------
  app.delete(
    '/parties/:id/bans/:userId',
    async (req: FastifyRequest<{ Params: { id: string; userId: string } }>, reply) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const partyId = Number(req.params.id);
      const targetId = Number(req.params.userId);
      if (!isPartyGM(partyId, userId)) return reply.code(403).send({ error: 'GM only' });

      const db = getDb();
      const info = db
        .prepare('DELETE FROM party_bans WHERE party_id = ? AND user_id = ?')
        .run(partyId, targetId);
      if (info.changes === 0) return reply.code(404).send({ error: 'not banned' });

      bus.emitChange({
        type: 'party:change',
        partyId,
        action: 'unban',
        actorUserId: userId,
        targetUserId: targetId,
      });
      return reply.send({ ok: true });
    },
  );

  // ---------- Update party (GM only) ----------
  app.patch(
    '/parties/:id',
    async (
      req: FastifyRequest<{
        Params: { id: string };
        Body: { name?: string; encumbranceMode?: EncumbranceMode };
      }>,
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
        db.prepare('UPDATE parties SET encumbrance_mode = ? WHERE id = ?').run(
          encumbranceMode,
          partyId,
        );
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
