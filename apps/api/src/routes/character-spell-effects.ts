/**
 * Character spell-effect routes (v1 : effets de sort sur la CA).
 *
 * Poser/lire/lever les états posés au lancement des 6 sorts v1
 * (Bouclier de la foi, Peau d'écorce, Hâte, Costume d'Outremonde,
 * Armure de mage, Bouclier). Une ligne par effet posé ; `active = 0`
 * conserve l'historique.
 *
 * Ownership rules:
 *  - GET    /characters/:id/spell-effects → tout membre du groupe (+ visibilité)
 *  - POST   /characters/:id/spell-effects → owner ou MD ; 409 si effet ACTIF
 *                                       du même sort déjà posé ; pose aussi
 *                                       concentrating = 1 si lié (même tx)
 *  - DELETE /spell-effects/:id            → owner ou MD ; désactive ; si lié
 *                                       et plus aucun effet actif concentré →
 *                                       concentrating = 0 (même tx)
 *
 * Les mutations émettent `character:change action 'stats'` (CA visible du
 * résumé du roster).
 */

import { and, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getDrizzle } from '../db/drizzle.ts';
import { getDb } from '../db/index.ts';
import { cols } from '../db/projections.ts';
import { characterSpellEffects, characters, spells } from '../db/schema.ts';
import { bus } from '../sync/bus.ts';
import { characterVisibleTo, isPartyGM, isPartyMember, requireUser } from './helpers.ts';
import { type AppLang, langFromReq } from './lang.ts';
import { apiMsg } from './messages.ts';
import { SPELL_AC_EFFECTS } from '@table-sync/shared';

interface CreateSpellEffectPayload {
  spellId: number;
}

function getCharacter(drizzle: ReturnType<typeof getDrizzle>, id: number): any {
  return drizzle
    .select(cols(characters))
    .from(characters)
    .where(eq(characters.id, id))
    .get() as any;
}

/** Returns true if the user is the owner or the GM of the character's party. */
function isOwnerOrGM(char: any, userId: number): boolean {
  return char.owner_id === userId || isPartyGM(char.party_id, userId);
}

/** Effets CA actifs du personnage → forme consommée par computeAC (miroir traqueur). */
export function activeAcEffectsOf(
  characterId: number,
): Array<{ effectKind: string; acValue: number }> {
  return getDrizzle()
    .select({
      effectKind: characterSpellEffects.effectKind,
      acValue: characterSpellEffects.acValue,
    })
    .from(characterSpellEffects)
    .where(
      and(eq(characterSpellEffects.characterId, characterId), eq(characterSpellEffects.active, 1)),
    )
    .all() as any[];
}

/**
 * Désactive les lignes d'effet liées à la concentration du personnage —
 * appelé par les voies de rupture CÔTÉ TRACKER (0 PV au PATCH combatant,
 * condition brisante posée par le MD) DANS la même transaction que le
 * `concentrating = 0`. Le miroir fiche (characters.ts) couvre ses propres
 * voies via `values.concentrating === 0`.
 */
export function deactivateConcentrationEffects(characterId: number): void {
  getDrizzle()
    .update(characterSpellEffects)
    .set({ active: 0 })
    .where(
      and(
        eq(characterSpellEffects.characterId, characterId),
        eq(characterSpellEffects.tiedToConcentration, 1),
        eq(characterSpellEffects.active, 1),
      ),
    )
    .run();
}

function mapSpellEffect(row: any, lang: AppLang) {
  return {
    id: row.id,
    characterId: row.character_id,
    spellId: row.spell_id,
    effectKind: row.effect_kind,
    acValue: row.ac_value,
    tiedToConcentration: !!row.tied_to_concentration,
    active: !!row.active,
    createdAt: row.created_at,
    spell: row.spell_name
      ? {
          id: row.spell_id,
          // FR = COALESCE(nameFr, name) — même convention que le reste des
          // routes sorts (character-spells.ts) : `name` est le nom anglais
          // de la table spells, le français vit dans nameFr.
          name:
            lang === 'en'
              ? (row.spell_name_en ?? row.spell_name)
              : (row.spell_name_fr ?? row.spell_name),
          nameFr: row.spell_name_fr,
          srdIndex: row.spell_srd_index,
        }
      : null,
  };
}

export async function characterSpellEffectRoutes(app: FastifyInstance) {
  // ---------- Active spell effects (joined with the spell name) ----------
  app.get(
    '/characters/:id/spell-effects',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const drizzle = getDrizzle();
      const char = getCharacter(drizzle, Number(req.params.id));
      if (!char) return reply.code(404).send({ error: apiMsg(req, 'character not found') });
      if (!isPartyMember(char.party_id, userId)) {
        return reply.code(403).send({ error: apiMsg(req, 'not a member') });
      }
      // Personnage caché : 404 pour tout le monde sauf owner + MD.
      if (!characterVisibleTo(char, userId)) {
        return reply.code(404).send({ error: apiMsg(req, 'character not found') });
      }
      const lang = langFromReq(req);
      const rows = drizzle
        .select({
          id: characterSpellEffects.id,
          character_id: characterSpellEffects.characterId,
          spell_id: characterSpellEffects.spellId,
          effect_kind: characterSpellEffects.effectKind,
          ac_value: characterSpellEffects.acValue,
          tied_to_concentration: characterSpellEffects.tiedToConcentration,
          active: characterSpellEffects.active,
          created_at: characterSpellEffects.createdAt,
          spell_name: spells.name,
          spell_name_fr: spells.nameFr,
          spell_name_en: spells.name,
          spell_srd_index: spells.srdIndex,
        })
        .from(characterSpellEffects)
        .innerJoin(spells, eq(spells.id, characterSpellEffects.spellId))
        .where(
          and(eq(characterSpellEffects.characterId, char.id), eq(characterSpellEffects.active, 1)),
        )
        .orderBy(characterSpellEffects.createdAt, characterSpellEffects.id)
        .all();
      return reply.send({ effects: rows.map((r: any) => mapSpellEffect(r, lang)) });
    },
  );

  // ---------- Cast: lay a spell effect (owner/GM) ----------
  app.post(
    '/characters/:id/spell-effects',
    async (
      req: FastifyRequest<{ Params: { id: string }; Body: CreateSpellEffectPayload }>,
      reply: FastifyReply,
    ) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const drizzle = getDrizzle();
      const char = getCharacter(drizzle, Number(req.params.id));
      if (!char) return reply.code(404).send({ error: apiMsg(req, 'character not found') });
      if (!isPartyMember(char.party_id, userId)) {
        return reply.code(403).send({ error: apiMsg(req, 'not a member') });
      }
      if (!isOwnerOrGM(char, userId)) {
        return reply
          .code(403)
          .send({ error: apiMsg(req, 'only the owner or GM can modify spell effects') });
      }
      const body = req.body || ({} as CreateSpellEffectPayload);
      if (typeof body.spellId !== 'number' || !Number.isInteger(body.spellId)) {
        return reply.code(400).send({ error: apiMsg(req, 'spellId is required') });
      }
      const spell = drizzle
        .select({ id: spells.id, srd_index: spells.srdIndex })
        .from(spells)
        .where(eq(spells.id, body.spellId))
        .get() as any;
      if (!spell) return reply.code(404).send({ error: apiMsg(req, 'spell not found') });
      const def = SPELL_AC_EFFECTS[spell.srd_index];
      if (!def) {
        return reply
          .code(422)
          .send({ error: apiMsg(req, 'ce sort ne pose pas d’effet sur la CA') });
      }

      // Pas de double : un effet ACTIF du même sort → 409.
      const existing = drizzle
        .select({ id: characterSpellEffects.id })
        .from(characterSpellEffects)
        .where(
          and(
            eq(characterSpellEffects.characterId, char.id),
            eq(characterSpellEffects.spellId, spell.id),
            eq(characterSpellEffects.active, 1),
          ),
        )
        .get();
      if (existing) {
        return reply.code(409).send({ error: apiMsg(req, 'cet effet est déjà actif') });
      }

      // NB : getDb().transaction(fn) RETOURNE la fonction transaction — il faut
      // l'invoquer (pattern `})();`).
      const inserted = getDb().transaction(() => {
        const row = drizzle
          .insert(characterSpellEffects)
          .values({
            characterId: char.id,
            spellId: spell.id,
            effectKind: def.kind,
            acValue: def.value,
            tiedToConcentration: def.tiedToConcentration ? 1 : 0,
            active: 1,
          })
          .returning({ id: characterSpellEffects.id })
          .get();
        // Concentration-dépendant : poser l'effet pose aussi la concentration
        // (même transaction — les deux tombent ensemble ou pas du tout).
        if (def.tiedToConcentration && !char.concentrating) {
          drizzle
            .update(characters)
            .set({ concentrating: 1 })
            .where(eq(characters.id, char.id))
            .run();
        }
        return row;
      })();

      const row = drizzle
        .select({
          id: characterSpellEffects.id,
          character_id: characterSpellEffects.characterId,
          spell_id: characterSpellEffects.spellId,
          effect_kind: characterSpellEffects.effectKind,
          ac_value: characterSpellEffects.acValue,
          tied_to_concentration: characterSpellEffects.tiedToConcentration,
          active: characterSpellEffects.active,
          created_at: characterSpellEffects.createdAt,
          spell_name: spells.name,
          spell_name_fr: spells.nameFr,
          spell_srd_index: spells.srdIndex,
        })
        .from(characterSpellEffects)
        .innerJoin(spells, eq(spells.id, characterSpellEffects.spellId))
        .where(eq(characterSpellEffects.id, inserted.id))
        .get();

      bus.emitChange({
        type: 'character:change',
        partyId: char.party_id,
        characterId: char.id,
        action: 'stats',
        actorUserId: userId,
      });
      return reply.code(201).send({ effect: mapSpellEffect(row, langFromReq(req)) });
    },
  );

  // ---------- Lift an effect (owner/GM) — deactivate + concentration follows ----------
  app.delete(
    '/spell-effects/:effectId',
    async (req: FastifyRequest<{ Params: { effectId: string } }>, reply: FastifyReply) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const drizzle = getDrizzle();
      const effect = drizzle
        .select(cols(characterSpellEffects))
        .from(characterSpellEffects)
        .where(eq(characterSpellEffects.id, Number(req.params.effectId)))
        .get() as any;
      if (!effect) return reply.code(404).send({ error: apiMsg(req, 'effect not found') });
      const char = getCharacter(drizzle, effect.character_id);
      if (!char) return reply.code(404).send({ error: apiMsg(req, 'character not found') });
      if (!isPartyMember(char.party_id, userId)) {
        return reply.code(403).send({ error: apiMsg(req, 'not a member') });
      }
      if (!isOwnerOrGM(char, userId)) {
        return reply
          .code(403)
          .send({ error: apiMsg(req, 'only the owner or GM can modify spell effects') });
      }
      if (!effect.active) {
        return reply.code(409).send({ error: apiMsg(req, 'cet effet est déjà levé') });
      }

      const stillConcentrating = getDb().transaction(() => {
        drizzle
          .update(characterSpellEffects)
          .set({ active: 0 })
          .where(eq(characterSpellEffects.id, effect.id))
          .run();
        // La concentration ne tombe que si PLUS AUCUN effet actif ne la
        // justifie (le joueur peut concentrer un sort sans effet CA).
        if (effect.tied_to_concentration) {
          const remaining = drizzle
            .select({ id: characterSpellEffects.id })
            .from(characterSpellEffects)
            .where(
              and(
                eq(characterSpellEffects.characterId, char.id),
                eq(characterSpellEffects.tiedToConcentration, 1),
                eq(characterSpellEffects.active, 1),
              ),
            )
            .get();
          if (!remaining && char.concentrating) {
            drizzle
              .update(characters)
              .set({ concentrating: 0 })
              .where(eq(characters.id, char.id))
              .run();
            return false;
          }
        }
        return !!char.concentrating;
      })();

      bus.emitChange({
        type: 'character:change',
        partyId: char.party_id,
        characterId: char.id,
        action: 'stats',
        actorUserId: userId,
      });
      return reply.send({ ok: true, concentrating: stillConcentrating });
    },
  );
}
