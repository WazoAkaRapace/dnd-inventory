/**
 * Character ↔ Spell routes: list a character's known/prepared spells,
 * add a spell, toggle prepared / reorder, remove a spell.
 *
 * Ownership rules:
 *  - GET  /characters/:id/spells     → any party member
 *  - POST /characters/:id/spells     → owner or GM (any party member may read;
 *                                       only the owner or GM may modify)
 *  - PATCH /character-spells/:linkId → owner or GM (resolved via JOIN)
 *  - DELETE /character-spells/:linkId→ owner or GM
 *
 * All mutations emit a `character:change` sync event.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getDb } from '../db/index.ts';
import { bus } from '../sync/bus.ts';
import { isPartyGM, isPartyMember, mapCharacterSpell, requireUser } from './helpers.ts';

interface AddCharacterSpellPayload {
  spellId: number;
  prepared?: boolean;
}

interface PatchCharacterSpellPayload {
  prepared?: boolean;
  sortOrder?: number;
}

/**
 * Fetch the (character, link) pair for a character_spells row.
 * Used by PATCH/DELETE to resolve ownership before mutating.
 * Returns null if the link row doesn't exist.
 */
function getLinkWithCharacter(linkId: number): { link: any; char: any } | null {
  const db = getDb();
  const link = db.prepare('SELECT * FROM character_spells WHERE id = ?').get(linkId) as any;
  if (!link) return null;
  const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(link.character_id) as any;
  if (!char) return null;
  return { link, char };
}

/** Returns true if the user is the owner or the GM of the character's party. */
function isOwnerOrGM(char: any, userId: number): boolean {
  return char.owner_id === userId || isPartyGM(char.party_id, userId);
}

export async function characterSpellRoutes(app: FastifyInstance) {
  // ---------- List a character's spells ----------
  app.get(
    '/characters/:id/spells',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const db = getDb();
      const char = db
        .prepare('SELECT * FROM characters WHERE id = ?')
        .get(Number(req.params.id)) as any;
      if (!char) return reply.code(404).send({ error: 'character not found' });
      if (!isPartyMember(char.party_id, userId)) {
        return reply.code(403).send({ error: 'not a member' });
      }

      // JOIN character_spells with spells, aliasing spell columns with s_ to
      // avoid colliding with the link table's own id/prepared/sort_order.
      const rows = db
        .prepare(`
        SELECT
          cs.id AS id, cs.character_id AS character_id,
          cs.prepared AS prepared, cs.sort_order AS sort_order, cs.added_at AS added_at,
          s.id AS s_id, s.srd_index AS s_srd_index, s.name AS s_name, s.name_fr AS s_name_fr,
          s.level AS s_level, s.school AS s_school, s.casting_time AS s_casting_time,
          s.range_text AS s_range_text, s.components AS s_components, s.material AS s_material,
          s.duration AS s_duration, s.concentration AS s_concentration, s.ritual AS s_ritual,
          s.description AS s_description, s.description_fr AS s_description_fr,
          s.higher_level AS s_higher_level, s.higher_level_fr AS s_higher_level_fr,
          s.attack_type AS s_attack_type, s.damage_json AS s_damage_json,
          s.dc_json AS s_dc_json, s.classes_json AS s_classes_json
        FROM character_spells cs
        JOIN spells s ON s.id = cs.spell_id
        WHERE cs.character_id = ?
        ORDER BY cs.prepared DESC, s.level ASC, COALESCE(s.name_fr, s.name) COLLATE NOCASE ASC
      `)
        .all(char.id);

      return reply.send({ spells: rows.map(mapCharacterSpell) });
    },
  );

  // ---------- Add a spell to a character ----------
  app.post(
    '/characters/:id/spells',
    async (
      req: FastifyRequest<{ Params: { id: string }; Body: AddCharacterSpellPayload }>,
      reply: FastifyReply,
    ) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const db = getDb();
      const char = db
        .prepare('SELECT * FROM characters WHERE id = ?')
        .get(Number(req.params.id)) as any;
      if (!char) return reply.code(404).send({ error: 'character not found' });
      if (!isPartyMember(char.party_id, userId)) {
        return reply.code(403).send({ error: 'not a member' });
      }
      if (!isOwnerOrGM(char, userId)) {
        return reply.code(403).send({ error: 'only the owner or GM can modify spells' });
      }

      const body = req.body || ({} as AddCharacterSpellPayload);
      if (!body.spellId) return reply.code(400).send({ error: 'spellId is required' });

      const spell = db.prepare('SELECT id FROM spells WHERE id = ?').get(body.spellId) as any;
      if (!spell) return reply.code(404).send({ error: 'spell not found' });

      const prepared = body.prepared ? 1 : 0;

      // UPSERT: if the character already knows this spell, just toggle prepared.
      const info = db
        .prepare(`
        INSERT INTO character_spells (character_id, spell_id, prepared)
        VALUES (?, ?, ?)
        ON CONFLICT(character_id, spell_id) DO UPDATE SET
          prepared = excluded.prepared
      `)
        .run(char.id, body.spellId, prepared);

      const linkId = info.lastInsertRowid as number;
      const row = db
        .prepare(`
        SELECT
          cs.id AS id, cs.character_id AS character_id,
          cs.prepared AS prepared, cs.sort_order AS sort_order, cs.added_at AS added_at,
          s.id AS s_id, s.srd_index AS s_srd_index, s.name AS s_name, s.name_fr AS s_name_fr,
          s.level AS s_level, s.school AS s_school, s.casting_time AS s_casting_time,
          s.range_text AS s_range_text, s.components AS s_components, s.material AS s_material,
          s.duration AS s_duration, s.concentration AS s_concentration, s.ritual AS s_ritual,
          s.description AS s_description, s.description_fr AS s_description_fr,
          s.higher_level AS s_higher_level, s.higher_level_fr AS s_higher_level_fr,
          s.attack_type AS s_attack_type, s.damage_json AS s_damage_json,
          s.dc_json AS s_dc_json, s.classes_json AS s_classes_json
        FROM character_spells cs
        JOIN spells s ON s.id = cs.spell_id
        WHERE cs.id = ?
      `)
        .get(linkId);

      bus.emitChange({
        type: 'character:change',
        partyId: char.party_id,
        characterId: char.id,
        action: 'stats',
        actorUserId: userId,
      });
      return reply.code(201).send({ spell: mapCharacterSpell(row) });
    },
  );

  // ---------- Update a character_spell link (toggle prepared / reorder) ----------
  app.patch(
    '/character-spells/:linkId',
    async (
      req: FastifyRequest<{ Params: { linkId: string }; Body: PatchCharacterSpellPayload }>,
      reply: FastifyReply,
    ) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const db = getDb();
      const resolved = getLinkWithCharacter(Number(req.params.linkId));
      if (!resolved) return reply.code(404).send({ error: 'character spell not found' });
      const { link, char } = resolved;
      if (!isPartyMember(char.party_id, userId)) {
        return reply.code(403).send({ error: 'not a member' });
      }
      if (!isOwnerOrGM(char, userId)) {
        return reply.code(403).send({ error: 'only the owner or GM can modify spells' });
      }

      const body = req.body || {};
      const sets: string[] = [];
      const vals: any[] = [];
      if (body.prepared !== undefined) {
        sets.push('prepared = ?');
        vals.push(body.prepared ? 1 : 0);
      }
      if (body.sortOrder !== undefined) {
        sets.push('sort_order = ?');
        vals.push(Math.floor(body.sortOrder));
      }
      if (sets.length === 0) return reply.code(400).send({ error: 'no fields to update' });
      vals.push(link.id);
      db.prepare(`UPDATE character_spells SET ${sets.join(', ')} WHERE id = ?`).run(...vals);

      const row = db
        .prepare(`
        SELECT
          cs.id AS id, cs.character_id AS character_id,
          cs.prepared AS prepared, cs.sort_order AS sort_order, cs.added_at AS added_at,
          s.id AS s_id, s.srd_index AS s_srd_index, s.name AS s_name, s.name_fr AS s_name_fr,
          s.level AS s_level, s.school AS s_school, s.casting_time AS s_casting_time,
          s.range_text AS s_range_text, s.components AS s_components, s.material AS s_material,
          s.duration AS s_duration, s.concentration AS s_concentration, s.ritual AS s_ritual,
          s.description AS s_description, s.description_fr AS s_description_fr,
          s.higher_level AS s_higher_level, s.higher_level_fr AS s_higher_level_fr,
          s.attack_type AS s_attack_type, s.damage_json AS s_damage_json,
          s.dc_json AS s_dc_json, s.classes_json AS s_classes_json
        FROM character_spells cs
        JOIN spells s ON s.id = cs.spell_id
        WHERE cs.id = ?
      `)
        .get(link.id);

      bus.emitChange({
        type: 'character:change',
        partyId: char.party_id,
        characterId: char.id,
        action: 'stats',
        actorUserId: userId,
      });
      return reply.send({ spell: mapCharacterSpell(row) });
    },
  );

  // ---------- Remove a spell from a character ----------
  app.delete(
    '/character-spells/:linkId',
    async (req: FastifyRequest<{ Params: { linkId: string } }>, reply: FastifyReply) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const db = getDb();
      const resolved = getLinkWithCharacter(Number(req.params.linkId));
      if (!resolved) return reply.code(404).send({ error: 'character spell not found' });
      const { link, char } = resolved;
      if (!isPartyMember(char.party_id, userId)) {
        return reply.code(403).send({ error: 'not a member' });
      }
      if (!isOwnerOrGM(char, userId)) {
        return reply.code(403).send({ error: 'only the owner or GM can modify spells' });
      }

      db.prepare('DELETE FROM character_spells WHERE id = ?').run(link.id);
      bus.emitChange({
        type: 'character:change',
        partyId: char.party_id,
        characterId: char.id,
        action: 'stats',
        actorUserId: userId,
      });
      return reply.code(204).send();
    },
  );
}
