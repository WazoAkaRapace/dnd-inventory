/**
 * Character routes: create, list, get, update, delete.
 */

import type {
  ConcentrationCheck,
  CreateCharacterPayload,
  PatchCharacterPayload,
} from '@dnd-inventory/shared';
import {
  abilityModifier,
  CONCENTRATION_BREAKING_CONDITIONS_FR,
  computeAC,
} from '@dnd-inventory/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getDb } from '../db/index.ts';
import { bus } from '../sync/bus.ts';
import {
  characterVisibleTo,
  isPartyGM,
  isPartyMember,
  mapCharacter,
  mapCharacterSummary,
  mirrorConditionsToCombatants,
  requireUser,
} from './helpers.ts';

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
      if (!body.name?.trim()) return reply.code(400).send({ error: 'name is required' });
      const strength = body.strength ?? 10;
      if (strength < 1) return reply.code(400).send({ error: 'strength must be ≥ 1' });
      const capMult = body.capacityMultiplier ?? 1;

      const db = getDb();
      const info = db
        .prepare(`
        INSERT INTO characters
          (party_id, owner_id, name, strength, capacity_multiplier,
           character_class, level, race, background, hidden)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
        .run(
          partyId,
          userId,
          body.name.trim(),
          strength,
          capMult,
          body.characterClass ?? null,
          body.level ?? 1,
          body.race ?? null,
          body.background ?? null,
          body.hidden ? 1 : 0,
        );
      const row = db
        .prepare(`
        SELECT c.*, u.display_name AS owner_name
        FROM characters c JOIN users u ON u.id = c.owner_id
        WHERE c.id = ?
      `)
        .get(info.lastInsertRowid);
      bus.emitChange({
        type: 'party:change',
        partyId,
        characterId: info.lastInsertRowid as number,
        action: 'stats',
        actorUserId: userId,
      });
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
      const rows = db
        .prepare(`
        SELECT c.*, u.display_name AS owner_name
        FROM characters c JOIN users u ON u.id = c.owner_id
        WHERE c.party_id = ?
        ORDER BY c.name COLLATE NOCASE ASC
      `)
        .all(partyId) as any[];
      // Hidden characters leave the party listing for everyone but their
      // owner and the GM.
      const callerIsGM = isPartyGM(partyId, userId);
      const visible = rows.filter((row) => !row.hidden || row.owner_id === userId || callerIsGM);
      return reply.send({ characters: visible.map(mapCharacterSummary) });
    },
  );

  // ---------- Get single character ----------
  app.get(
    '/characters/:id',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const db = getDb();
      const row = db
        .prepare(`
      SELECT c.*, u.display_name AS owner_name
      FROM characters c JOIN users u ON u.id = c.owner_id
      WHERE c.id = ?
    `)
        .get(Number(req.params.id)) as any;
      if (!row) return reply.code(404).send({ error: 'character not found' });
      if (!isPartyMember(row.party_id, userId))
        return reply.code(403).send({ error: 'not a member' });
      // 404 (not 403): a hidden character must not betray its existence
      if (!characterVisibleTo(row, userId))
        return reply.code(404).send({ error: 'character not found' });
      return reply.send({ character: mapCharacter(row) });
    },
  );

  // ---------- Update character ----------
  app.patch(
    '/characters/:id',
    async (
      req: FastifyRequest<{ Params: { id: string }; Body: PatchCharacterPayload }>,
      reply: FastifyReply,
    ) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const db = getDb();
      const char = db
        .prepare('SELECT * FROM characters WHERE id = ?')
        .get(Number(req.params.id)) as any;
      if (!char) return reply.code(404).send({ error: 'character not found' });
      // Owner or GM can edit
      const isGM = isPartyGM(char.party_id, userId);
      if (char.owner_id !== userId && !isGM) {
        return reply.code(403).send({ error: 'only the owner or GM can edit' });
      }
      // Visibility is the owner's call alone — not even the GM flips it
      const body = req.body || {};
      if (body.hidden !== undefined && char.owner_id !== userId) {
        return reply.code(403).send({ error: 'seul le propriétaire peut changer la visibilité' });
      }
      const hiding = body.hidden === true && !char.hidden;
      // Speed is metric meters — halves are valid (small races: 7.5 m)
      if (
        body.speed !== undefined &&
        (typeof body.speed !== 'number' || !Number.isFinite(body.speed) || body.speed < 0)
      ) {
        return reply.code(400).send({ error: 'vitesse invalide (nombre positif en mètres)' });
      }
      const allowed: (keyof PatchCharacterPayload)[] = [
        'name',
        'strength',
        'capacityMultiplier',
        'exhaustion',
        'conditions',
        'foodDays',
        'waterDays',
        'maxHp',
        'currentHp',
        'tempHp',
        'notes',
        'copper',
        'silver',
        'electrum',
        'gold',
        'platinum',
        // Character sheet
        'level',
        'dexterity',
        'constitution',
        'intelligence',
        'wisdom',
        'charisma',
        'characterClass',
        'race',
        'background',
        'speed',
        'skillProficiencies',
        'skillExpertise',
        'toolProficiencies',
        'toolExpertise',
        'languages',
        'savingThrowProficiencies',
        'weaponProficiencies',
        'fightingStyle',
        'spellSlotsUsed',
        // Description / personality
        'alignment',
        'sex',
        'height',
        'weight',
        'age',
        'skin',
        'eyes',
        'hair',
        'portraitUrl',
        'personalityTraits',
        'ideals',
        'bonds',
        'flaws',
        'appearance',
        'armorClassOverride',
        'deathSaveSuccesses',
        'deathSaveFailures',
        'inspiration',
        'concentrating',
        'hidden',
        'wildShapeHp',
        'wildShapeUses',
        'hitDiceUsed',
        'wildShapeSeen',
        'druidCircle',
        'divineDomain',
        'landCircle',
        'sacredOath',
        'subclass',
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
        skillExpertise: 'skill_expertise',
        toolProficiencies: 'tool_proficiencies',
        toolExpertise: 'tool_expertise',
        savingThrowProficiencies: 'saving_throw_proficiencies',
        weaponProficiencies: 'weapon_proficiencies',
        fightingStyle: 'fighting_style',
        spellSlotsUsed: 'spell_slots_used',
        portraitUrl: 'portrait_url',
        personalityTraits: 'personality_traits',
        armorClassOverride: 'armor_class_override',
        deathSaveSuccesses: 'death_save_successes',
        deathSaveFailures: 'death_save_failures',
        wildShapeHp: 'wild_shape_hp',
        wildShapeUses: 'wild_shape_uses',
        hitDiceUsed: 'hit_dice_used',
        wildShapeSeen: 'wild_shape_seen_json',
        druidCircle: 'druid_circle',
        divineDomain: 'divine_domain',
        landCircle: 'land_circle',
        sacredOath: 'sacred_oath',
      };
      // Fields stored as JSON arrays — serialize on write
      const jsonFields = new Set([
        'conditions',
        'skillProficiencies',
        'skillExpertise',
        'toolProficiencies',
        'toolExpertise',
        'languages',
        'savingThrowProficiencies',
        'weaponProficiencies',
        'spellSlotsUsed',
        'wildShapeSeen',
      ]);
      for (const key of allowed) {
        if (body[key] !== undefined) {
          const col = fieldMap[key as string] || key;
          if (key === 'weaponProficiencies' && body[key] === null) {
            // null = back to class default
            sets.push('weapon_proficiencies = NULL'); // literal — no ? placeholder
            continue;
          }
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

      // --- Wild Shape: while shaped, HP edits target the beast's bar.
      // Hitting 0 reverts with excess damage carried over (SRD), and the
      // tracker combatant follows the shape's bar (or the normal form back).
      if (body.currentHp !== undefined && char.wild_shape_slug) {
        const shapeHp = Math.max(0, body.currentHp);
        const combatants = db
          .prepare(`
          SELECT c.* FROM combatants c
          JOIN encounters e ON e.id = c.encounter_id
          WHERE c.character_id = ? AND c.type = 'player' AND e.status != 'ended'
          ORDER BY e.created_at DESC, c.id DESC
        `)
          .all(char.id) as any[];

        if (shapeHp <= 0) {
          // Auto-revert with carry-over
          const excess = -body.currentHp;
          const newHp = Math.max(0, (char.current_hp ?? 1) - excess);
          db.prepare(`
            UPDATE characters
            SET wild_shape_slug = NULL, wild_shape_hp = NULL, wild_shape_max_hp = NULL, current_hp = ?
            WHERE id = ?
          `).run(newHp, char.id);
          for (const combatant of combatants) {
            const acRows = db
              .prepare(`
              SELECT i.category AS category, i.ac_base AS ac_base, i.str_min AS str_min,
                     i.name_fr AS name_fr, i.name AS name
              FROM inventory inv JOIN items i ON i.id = inv.item_id
              WHERE inv.character_id = ? AND inv.equipped = 1
            `)
              .all(char.id) as any[];
            const acResult = computeAC(
              acRows.map((r) => ({
                item: {
                  category: r.category,
                  acBase: r.ac_base,
                  strMin: r.str_min,
                  nameFr: r.name_fr,
                  name: r.name,
                },
                equipped: true,
              })),
              abilityModifier(char.dexterity ?? 10),
              char.fighting_style === 'defense',
              char,
            );
            db.prepare(
              'UPDATE combatants SET name = ?, hit_points = ?, max_hit_points = ?, armor_class = ?, defeated = ? WHERE id = ?',
            ).run(
              char.name,
              newHp,
              char.max_hp ?? 1,
              char.armor_class_override ?? acResult.ac,
              newHp <= 0 ? 1 : 0,
              combatant.id,
            );
          }
        } else {
          db.prepare('UPDATE characters SET wild_shape_hp = ? WHERE id = ?').run(shapeHp, char.id);
          for (const combatant of combatants) {
            db.prepare(
              'UPDATE combatants SET hit_points = ?, max_hit_points = ?, defeated = 0 WHERE id = ?',
            ).run(shapeHp, char.wild_shape_max_hp ?? shapeHp, combatant.id);
          }
        }
        if (combatants.length > 0) {
          bus.emitChange({
            type: 'combat:change',
            partyId: char.party_id,
            action: 'hp',
            actorUserId: userId,
          });
        }
        // The shape bar was written — currentHp must not be applied again below
        (body as any).currentHp = undefined;
        const remaining = Object.entries(body).filter(([, v]) => v !== undefined);
        if (remaining.length === 0) {
          const rowAfter = db
            .prepare(`
            SELECT c.*, u.display_name AS owner_name
            FROM characters c JOIN users u ON u.id = c.owner_id
            WHERE c.id = ?
          `)
            .get(char.id);
          return reply.send({ character: mapCharacter(rowAfter) });
        }
      }

      // --- Concentration: a CON save (DC 10 or half damage, highest) is
      // required whenever the character TAKES damage while concentrating —
      // PHB p.203. Damage absorbed by temporary HP still counts: when the
      // Survie hero sends currentHp + tempHp in one payload, the damage taken
      // is the real loss PLUS the temp absorbed.
      let concentrationCheck: ConcentrationCheck | null = null;
      if (body.currentHp !== undefined) {
        const concentratingAfter =
          body.concentrating !== undefined ? !!body.concentrating : !!char.concentrating;
        const realDamage = Math.max(0, (char.current_hp ?? 0) - body.currentHp);
        const tempAbsorbed =
          body.tempHp !== undefined ? Math.max(0, (char.temp_hp ?? 0) - body.tempHp) : 0;
        const damage = realDamage + tempAbsorbed;
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
        if (
          concentratingAfter &&
          body.currentHp <= 0 &&
          !sets.some((s) => s.startsWith('concentrating'))
        ) {
          sets.push('concentrating = 0'); // literal — no ? placeholder, no val needed
        }
      }

      // --- Concentration: applying an incapacitating condition
      // (Inconscient, Paralysé, Pétrifié, Étourdi, Neutralisé) breaks it.
      let concentrationBroken: string | null = null;
      if (body.conditions && char.concentrating && body.concentrating !== false) {
        const breaking = body.conditions.find((c) =>
          CONCENTRATION_BREAKING_CONDITIONS_FR.includes(c),
        );
        if (breaking) {
          concentrationBroken = breaking;
          if (
            body.concentrating === undefined &&
            !sets.some((s) => s.startsWith('concentrating'))
          ) {
            sets.push('concentrating = 0'); // literal — no ? placeholder
          }
        }
      }

      vals.push(char.id);
      db.prepare(`UPDATE characters SET ${sets.join(', ')} WHERE id = ?`).run(...vals);

      // --- HP sync: mirror PV/PV max changes to this character's combatants
      // in non-ended encounters, so the combat tracker shows the same HP
      // (and defeated state) as the sheet.
      if (body.currentHp !== undefined || body.maxHp !== undefined) {
        const combatantRows = db
          .prepare(`
          SELECT c.id FROM combatants c
          JOIN encounters e ON e.id = c.encounter_id
          WHERE c.character_id = ? AND c.type = 'player' AND e.status != 'ended'
        `)
          .all(char.id) as any[];
        for (const cr of combatantRows) {
          const setsC: string[] = [];
          const valsC: any[] = [];
          if (body.currentHp !== undefined) {
            setsC.push('hit_points = ?');
            valsC.push(Math.max(0, body.currentHp));
            // Mirror the defeated state the tracker derives from HP
            setsC.push('defeated = ?');
            valsC.push(body.currentHp <= 0 ? 1 : 0);
          }
          if (body.maxHp !== undefined) {
            setsC.push('max_hit_points = ?');
            valsC.push(Math.max(1, body.maxHp));
          }
          valsC.push(cr.id);
          db.prepare(`UPDATE combatants SET ${setsC.join(', ')} WHERE id = ?`).run(...valsC);
        }
        if (combatantRows.length > 0) {
          bus.emitChange({
            type: 'combat:change',
            partyId: char.party_id,
            action: 'hp',
            actorUserId: userId,
          });
        }
      }

      // --- Condition sync: sheet condition changes mirror to the combat
      // tracker (diff vs the previous list, durations left untouched).
      if (body.conditions !== undefined) {
        try {
          const prev: string[] = char.conditions
            ? typeof char.conditions === 'string'
              ? JSON.parse(char.conditions)
              : char.conditions
            : [];
          const nextList: string[] = body.conditions;
          mirrorConditionsToCombatants(
            char.party_id,
            char.id,
            nextList.filter((c) => !prev.includes(c)),
            prev.filter((c) => !nextList.includes(c)),
            userId,
          );
        } catch {
          /* mirror is best-effort */
        }
      }

      // --- Visibility: a hidden character is inactive everywhere — pull its
      // player combatants out of non-ended encounters (ended fights keep
      // their history) so rosters never leak its presence.
      if (hiding) {
        const removed = db
          .prepare(`
          DELETE FROM combatants
          WHERE character_id = ? AND type = 'player'
            AND encounter_id IN (
              SELECT id FROM encounters WHERE party_id = ? AND status != 'ended'
            )
        `)
          .run(char.id, char.party_id);
        if (removed.changes > 0) {
          bus.emitChange({
            type: 'combat:change',
            partyId: char.party_id,
            action: 'remove',
            actorUserId: userId,
          });
        }
      }

      const row = db
        .prepare(`
        SELECT c.*, u.display_name AS owner_name
        FROM characters c JOIN users u ON u.id = c.owner_id
        WHERE c.id = ?
      `)
        .get(char.id);
      // Detect if this was a coin change vs stat change for the event action
      const coinKeys = ['copper', 'silver', 'electrum', 'gold', 'platinum'];
      const isCoinChange = Object.keys(body).some((k) => coinKeys.includes(k));
      // Visibility changes alter every member's party list — broadcast a
      // party:change (character:change for a hidden char wouldn't fan out).
      const visibilityChanged = body.hidden !== undefined;
      bus.emitChange({
        type: visibilityChanged ? 'party:change' : 'character:change',
        partyId: char.party_id,
        characterId: char.id,
        action: visibilityChanged ? 'stats' : isCoinChange ? 'coins' : 'stats',
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
  app.delete(
    '/characters/:id',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const db = getDb();
      const char = db
        .prepare('SELECT * FROM characters WHERE id = ?')
        .get(Number(req.params.id)) as any;
      if (!char) return reply.code(404).send({ error: 'character not found' });
      const isGM = isPartyGM(char.party_id, userId);
      if (char.owner_id !== userId && !isGM) {
        return reply.code(403).send({ error: 'only the owner or GM can delete' });
      }
      db.prepare('DELETE FROM characters WHERE id = ?').run(char.id);
      bus.emitChange({
        type: 'party:change',
        partyId: char.party_id,
        characterId: char.id,
        action: 'stats',
        actorUserId: userId,
      });
      return reply.code(204).send();
    },
  );
}
