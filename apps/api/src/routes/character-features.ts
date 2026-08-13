/**
 * Character ↔ Feature routes: free-form traits (class / racial / background /
 * feat / custom) with {{template}} variables in the description.
 *
 * Ownership rules:
 *  - GET    /characters/:id/features     → any party member
 *  - POST   /characters/:id/features     → owner or GM (any party member may read;
 *                                           only the owner or GM may modify)
 *  - PATCH  /character-features/:featureId → owner or GM (resolved via the feature row)
 *  - DELETE /character-features/:featureId → owner or GM
 *
 * All mutations emit a `character:change` sync event.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getDb } from '../db/index.ts';
import { bus } from '../sync/bus.ts';
import {
  requireUser,
  isPartyMember,
  isPartyGM,
  mapFeature,
} from './helpers.ts';
import type {
  CreateCharacterFeaturePayload,
  PatchCharacterFeaturePayload,
} from '@dnd-inventory/shared';

/**
 * Fetch the (feature, character) pair for a character_features row.
 * Used by PATCH/DELETE to resolve ownership before mutating.
 * Returns null if the feature row doesn't exist.
 */
function getFeatureWithCharacter(featureId: number): { feature: any; char: any } | null {
  const db = getDb();
  const feature = db.prepare('SELECT * FROM character_features WHERE id = ?').get(featureId) as any;
  if (!feature) return null;
  const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(feature.character_id) as any;
  if (!char) return null;
  return { feature, char };
}

/** Returns true if the user is the owner or the GM of the character's party. */
function isOwnerOrGM(char: any, userId: number): boolean {
  return char.owner_id === userId || isPartyGM(char.party_id, userId);
}

export async function characterFeatureRoutes(app: FastifyInstance) {
  // ---------- List a character's features ----------
  app.get(
    '/characters/:id/features',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const db = getDb();
      const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(Number(req.params.id)) as any;
      if (!char) return reply.code(404).send({ error: 'character not found' });
      if (!isPartyMember(char.party_id, userId)) {
        return reply.code(403).send({ error: 'not a member' });
      }

      const rows = db.prepare(`
        SELECT * FROM character_features
        WHERE character_id = ?
        ORDER BY sort_order ASC, created_at ASC
      `).all(char.id);

      return reply.send({ features: rows.map(mapFeature) });
    },
  );

  // ---------- Create a feature for a character ----------
  app.post(
    '/characters/:id/features',
    async (
      req: FastifyRequest<{ Params: { id: string }; Body: CreateCharacterFeaturePayload }>,
      reply: FastifyReply,
    ) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const db = getDb();
      const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(Number(req.params.id)) as any;
      if (!char) return reply.code(404).send({ error: 'character not found' });
      if (!isPartyMember(char.party_id, userId)) {
        return reply.code(403).send({ error: 'not a member' });
      }
      if (!isOwnerOrGM(char, userId)) {
        return reply.code(403).send({ error: 'only the owner or GM can modify features' });
      }

      const body = req.body || ({} as CreateCharacterFeaturePayload);
      if (!body.title || !body.title.trim()) {
        return reply.code(400).send({ error: 'title is required' });
      }

      const category = body.category ?? 'custom';
      const description = body.description ?? null;
      const counterMax = body.counterMax ?? null;
      const counterCurrent = counterMax ?? null; // initialize to max

      // Compute sort_order as MAX(sort_order)+1 for this character (0 if none yet).
      const maxRow = db
        .prepare('SELECT COALESCE(MAX(sort_order), -1) AS max_sort FROM character_features WHERE character_id = ?')
        .get(char.id) as any;
      const sortOrder = (maxRow?.max_sort ?? -1) + 1;

      const info = db.prepare(`
        INSERT INTO character_features (character_id, title, category, description, counter_max, counter_current, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(char.id, body.title.trim(), category, description, counterMax, counterCurrent, sortOrder);

      const featureId = info.lastInsertRowid as number;
      const row = db.prepare('SELECT * FROM character_features WHERE id = ?').get(featureId);

      bus.emitChange({
        type: 'character:change',
        partyId: char.party_id,
        characterId: char.id,
        action: 'stats',
        actorUserId: userId,
      });
      return reply.code(201).send({ feature: mapFeature(row) });
    },
  );

  // ---------- Update a feature ----------
  app.patch(
    '/character-features/:featureId',
    async (
      req: FastifyRequest<{ Params: { featureId: string }; Body: PatchCharacterFeaturePayload }>,
      reply: FastifyReply,
    ) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const db = getDb();
      const resolved = getFeatureWithCharacter(Number(req.params.featureId));
      if (!resolved) return reply.code(404).send({ error: 'feature not found' });
      const { feature, char } = resolved;
      if (!isPartyMember(char.party_id, userId)) {
        return reply.code(403).send({ error: 'not a member' });
      }
      if (!isOwnerOrGM(char, userId)) {
        return reply.code(403).send({ error: 'only the owner or GM can modify features' });
      }

      const body = req.body || {};
      const sets: string[] = [];
      const vals: any[] = [];
      if (body.title !== undefined) {
        sets.push('title = ?');
        vals.push(body.title);
      }
      if (body.category !== undefined) {
        sets.push('category = ?');
        vals.push(body.category);
      }
      if (body.description !== undefined) {
        sets.push('description = ?');
        vals.push(body.description);
      }
      if (body.counterMax !== undefined) {
        sets.push('counter_max = ?');
        vals.push(body.counterMax);
        // If setting a new max and current is null or exceeds new max, reset to max
        if (body.counterMax !== null && (feature.counter_current === null || feature.counter_current > body.counterMax)) {
          sets.push('counter_current = ?');
          vals.push(body.counterMax);
        }
        // If removing the counter (null), also clear current
        if (body.counterMax === null) {
          sets.push('counter_current = ?');
          vals.push(null);
        }
      }
      if (body.counterCurrent !== undefined) {
        sets.push('counter_current = ?');
        vals.push(body.counterCurrent);
      }
      if (sets.length === 0) return reply.code(400).send({ error: 'no fields to update' });
      vals.push(feature.id);
      db.prepare(`UPDATE character_features SET ${sets.join(', ')} WHERE id = ?`).run(...vals);

      const row = db.prepare('SELECT * FROM character_features WHERE id = ?').get(feature.id);

      bus.emitChange({
        type: 'character:change',
        partyId: char.party_id,
        characterId: char.id,
        action: 'stats',
        actorUserId: userId,
      });
      return reply.send({ feature: mapFeature(row) });
    },
  );

  // ---------- Delete a feature ----------
  app.delete(
    '/character-features/:featureId',
    async (req: FastifyRequest<{ Params: { featureId: string } }>, reply: FastifyReply) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const db = getDb();
      const resolved = getFeatureWithCharacter(Number(req.params.featureId));
      if (!resolved) return reply.code(404).send({ error: 'feature not found' });
      const { feature, char } = resolved;
      if (!isPartyMember(char.party_id, userId)) {
        return reply.code(403).send({ error: 'not a member' });
      }
      if (!isOwnerOrGM(char, userId)) {
        return reply.code(403).send({ error: 'only the owner or GM can modify features' });
      }

      db.prepare('DELETE FROM character_features WHERE id = ?').run(feature.id);
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
