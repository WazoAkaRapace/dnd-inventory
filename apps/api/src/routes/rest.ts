/**
 * Rest routes: POST /characters/:id/rest — repos court / repos long.
 *
 * Applies the SRD recovery rules via the shared applyRest() (pact slots,
 * wild shape uses, hit dice, HP, exhaustion, death saves, concentration,
 * catalog feature counters — max recomputed at the current level), then
 * mirrors HP changes to active combatants like a sheet PATCH would.
 *
 * Body: { type: 'short' | 'long', hitDiceSpent?: number }
 * Permission: character owner or party GM (same as PATCH /characters/:id).
 */

import { applyRest } from '@dnd-inventory/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getDb } from '../db/index.ts';
import { bus } from '../sync/bus.ts';
import { isPartyGM, isPartyMember, mapCharacter, requireUser } from './helpers.ts';

export async function restRoutes(app: FastifyInstance) {
  app.post(
    '/characters/:id/rest',
    async (
      req: FastifyRequest<{
        Params: { id: string };
        Body: { type?: string; hitDiceSpent?: number };
      }>,
      reply: FastifyReply,
    ) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const db = getDb();
      const char = db
        .prepare('SELECT * FROM characters WHERE id = ?')
        .get(Number(req.params.id)) as any;
      if (!char) return reply.code(404).send({ error: 'character not found' });
      const isGM = isPartyGM(char.party_id, userId);
      if (!isPartyMember(char.party_id, userId)) {
        return reply.code(403).send({ error: 'not a member' });
      }
      if (char.owner_id !== userId && !isGM) {
        return reply.code(403).send({ error: 'only the owner or GM can rest' });
      }

      const body = req.body || {};
      if (body.type !== 'short' && body.type !== 'long') {
        return reply.code(400).send({ error: "type doit valoir 'short' ou 'long'" });
      }
      if (body.hitDiceSpent !== undefined && !Number.isInteger(body.hitDiceSpent)) {
        return reply.code(400).send({ error: 'hitDiceSpent doit être un entier' });
      }
      if (
        body.healedHp !== undefined &&
        (typeof body.healedHp !== 'number' || !Number.isFinite(body.healedHp) || body.healedHp < 0)
      ) {
        return reply.code(400).send({ error: 'healedHp doit être un nombre positif' });
      }

      const featureRows = db
        .prepare(
          'SELECT id, catalog_id, reset_type, counter_max, counter_current FROM character_features WHERE character_id = ?',
        )
        .all(char.id) as any[];
      // snake_case rows → the camelCase shape applyRest expects
      const features = featureRows.map((r) => ({
        id: r.id as number,
        catalogId: (r.catalog_id as string | null) ?? null,
        resetType: (r.reset_type as 'short' | 'long' | null) ?? null,
        counterMax: (r.counter_max as number | null) ?? null,
        counterCurrent: (r.counter_current as number | null) ?? null,
      }));

      const result = applyRest(mapCharacter(char), features, {
        type: body.type,
        hitDiceSpent: body.hitDiceSpent,
        healedHp: body.healedHp,
      });

      // --- Persist the character patch (known subset of PatchCharacterPayload)
      const colMap: Record<string, string> = {
        currentHp: 'current_hp',
        tempHp: 'temp_hp',
        spellSlotsUsed: 'spell_slots_used',
        hitDiceUsed: 'hit_dice_used',
        exhaustion: 'exhaustion',
        deathSaveSuccesses: 'death_save_successes',
        deathSaveFailures: 'death_save_failures',
        concentrating: 'concentrating',
        wildShapeUses: 'wild_shape_uses',
      };
      const patch = result.characterPatch as Record<string, any>;
      const sets: string[] = [];
      const vals: any[] = [];
      for (const [key, col] of Object.entries(colMap)) {
        if (patch[key] === undefined) continue;
        sets.push(`${col} = ?`);
        if (key === 'spellSlotsUsed') vals.push(JSON.stringify(patch[key]));
        else if (typeof patch[key] === 'boolean') vals.push(patch[key] ? 1 : 0);
        else vals.push(patch[key]);
      }
      // Long rest: the shape never outlasts 8 hours — revert to normal form.
      if (body.type === 'long' && char.wild_shape_slug) {
        sets.push('wild_shape_slug = NULL', 'wild_shape_hp = NULL', 'wild_shape_max_hp = NULL');
      }
      if (sets.length > 0) {
        vals.push(char.id);
        db.prepare(`UPDATE characters SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
      }

      // --- Persist catalog counter resets (max recomputed by applyRest)
      const resetStmt = db.prepare(
        'UPDATE character_features SET counter_max = ?, counter_current = ? WHERE id = ?',
      );
      for (const reset of result.featureResets) {
        resetStmt.run(reset.counterMax, reset.counterCurrent, reset.featureId);
      }

      // --- HP sync: mirror PV changes to active combatants (like a sheet PATCH)
      if (patch.currentHp !== undefined) {
        const combatants = db
          .prepare(
            `
          SELECT c.id FROM combatants c
          JOIN encounters e ON e.id = c.encounter_id
          WHERE c.character_id = ? AND c.type = 'player' AND e.status != 'ended'
        `,
          )
          .all(char.id) as any[];
        for (const cr of combatants) {
          db.prepare('UPDATE combatants SET hit_points = ?, defeated = ? WHERE id = ?').run(
            Math.max(0, patch.currentHp),
            patch.currentHp <= 0 ? 1 : 0,
            cr.id,
          );
        }
        if (combatants.length > 0) {
          bus.emitChange({
            type: 'combat:change',
            partyId: char.party_id,
            action: 'hp',
            actorUserId: userId,
          });
        }
      }

      bus.emitChange({
        type: 'character:change',
        partyId: char.party_id,
        characterId: char.id,
        action: 'rest',
        actorUserId: userId,
      });

      const row = db.prepare('SELECT * FROM characters WHERE id = ?').get(char.id) as any;
      return reply.send({
        character: mapCharacter(row),
        healed: result.healed,
        diceSpent: result.diceSpent,
        resetFeatures: result.featureResets.length,
      });
    },
  );
}
