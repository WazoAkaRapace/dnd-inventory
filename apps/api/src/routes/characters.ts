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
import { CONCENTRATION_BREAKING_CONDITIONS_FR } from '@dnd-inventory/shared';
import type {
  CreateCharacterPayload,
  PatchCharacterPayload,
  ConcentrationCheck,
} from '@dnd-inventory/shared';

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
      const capMult = body.capacityMultiplier ?? 1;

      const db = getDb();
      const info = db.prepare(`
        INSERT INTO characters
          (party_id, owner_id, name, strength, capacity_multiplier,
           character_class, level, race, background)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        partyId,
        userId,
        body.name.trim(),
        strength,
        capMult,
        body.characterClass ?? null,
        body.level ?? 1,
        body.race ?? null,
        body.background ?? null,
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
        'name', 'strength', 'capacityMultiplier',
        'exhaustion', 'conditions', 'foodDays', 'waterDays',
        'maxHp', 'currentHp', 'tempHp',
        'notes', 'copper', 'silver', 'electrum', 'gold', 'platinum',
        // Character sheet
        'level', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma',
        'characterClass', 'race', 'background', 'speed',
        'skillProficiencies', 'savingThrowProficiencies', 'spellSlotsUsed',
        // Description / personality
        'alignment', 'sex', 'height', 'weight', 'age', 'skin', 'eyes', 'hair',
        'portraitUrl', 'personalityTraits', 'ideals', 'bonds', 'flaws', 'appearance',
        'armorClassOverride',
        'deathSaveSuccesses', 'deathSaveFailures', 'inspiration', 'concentrating',
      ];
      const sets: string[] = [];
      const vals: any[] = [];
      const fieldMap: Record<string, string> = {
        capacityMultiplier: 'capacity_multiplier',
        foodDays: 'food_days',
        waterDays: 'water_days',
        maxHp: 'max_hp',
        currentHp: 'current_hp',
        tempHp: 'temp_hp',
        characterClass: 'character_class',
        skillProficiencies: 'skill_proficiencies',
        savingThrowProficiencies: 'saving_throw_proficiencies',
        spellSlotsUsed: 'spell_slots_used',
        portraitUrl: 'portrait_url',
        personalityTraits: 'personality_traits',
        armorClassOverride: 'armor_class_override',
        deathSaveSuccesses: 'death_save_successes',
        deathSaveFailures: 'death_save_failures',
      };
      // Fields stored as JSON arrays — serialize on write
      const jsonFields = new Set([
        'conditions',
        'skillProficiencies',
        'savingThrowProficiencies',
        'spellSlotsUsed',
      ]);
      for (const key of allowed) {
        if (body[key] !== undefined) {
          const col = fieldMap[key as string] || key;
          sets.push(`${col} = ?`);
          if (jsonFields.has(key as string)) {
            vals.push(JSON.stringify(body[key]));
          } else if (typeof body[key] === 'boolean') {
            vals.push(body[key] ? 1 : 0);
          } else {
            vals.push(body[key]);
          }
        }
      }
      if (sets.length === 0) return reply.code(400).send({ error: 'no fields to update' });

      // --- Concentration: a CON save (DC 10 or half damage, highest) is
      // required when HP drops while concentrating on a spell.
      let concentrationCheck: ConcentrationCheck | null = null;
      if (body.currentHp !== undefined) {
        const concentratingAfter = body.concentrating !== undefined ? !!body.concentrating : !!char.concentrating;
        const damage = (char.current_hp ?? 0) - body.currentHp;
        if (concentratingAfter && damage > 0 && body.currentHp > 0) {
          concentrationCheck = {
            characterId: char.id,
            characterName: char.name,
            damage,
            dc: Math.max(10, Math.floor(damage / 2)),
            ownerId: char.owner_id,
          };
        }
        // At 0 HP the character is unconscious → concentration ends automatically.
        if (concentratingAfter && body.currentHp <= 0 && !sets.some((s) => s.startsWith('concentrating'))) {
          sets.push('concentrating = 0'); // literal — no ? placeholder, no val needed
        }
      }

      // --- Concentration: applying an incapacitating condition
      // (Inconscient, Paralysé, Pétrifié, Étourdi, Neutralisé) breaks it.
      let concentrationBroken: string | null = null;
      if (body.conditions && char.concentrating && body.concentrating !== false) {
        const breaking = body.conditions.find((c) => CONCENTRATION_BREAKING_CONDITIONS_FR.includes(c));
        if (breaking) {
          concentrationBroken = breaking;
          if (body.concentrating === undefined && !sets.some((s) => s.startsWith('concentrating'))) {
            sets.push('concentrating = 0'); // literal — no ? placeholder
          }
        }
      }

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
      bus.emitChange({
        type: 'character:change',
        partyId: char.party_id,
        characterId: char.id,
        action: isCoinChange ? 'coins' : 'stats',
        actorUserId: userId,
        ...(concentrationCheck ? { concentration: concentrationCheck } : {}),
      });
      return reply.send({
        character: mapCharacter(row),
        ...(concentrationCheck ? { concentrationCheck } : {}),
        ...(concentrationBroken ? { concentrationBroken } : {}),
      });
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
