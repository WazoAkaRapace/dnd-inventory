/**
 * Divine domain spells (Clerc, SRD): always prepared, don't count against
 * the prepared-spells limit. Derived from domain + level — no stored rows.
 */

import type { Spell } from '@dnd-inventory/shared';
import { bonusPreparedSpells, domainSpellsFor, findClass } from '@dnd-inventory/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getDb } from '../db/index.ts';
import { isPartyGM, mapSpell, requireUser } from './helpers.ts';

export async function domainSpellRoutes(app: FastifyInstance) {
  app.get(
    '/characters/:id/domain-spells',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const db = getDb();
      const char = db
        .prepare('SELECT * FROM characters WHERE id = ?')
        .get(Number(req.params.id)) as any;
      if (!char) return reply.code(404).send({ error: 'Personnage introuvable' });
      const gm = isPartyGM(char.party_id, userId);
      if (char.owner_id !== userId && !gm) {
        return reply.code(403).send({ error: 'Réservé au propriétaire ou au MD' });
      }

      // Cleric domains, druid Circle of the Land terrains, paladin oaths —
      // all the same SRD mechanic: always prepared, excluded from the limit.
      // Multiclassage : chaque source divine est évaluée au NIVEAU DE SA
      // CLASSE (les lignes character_classes font foi).
      const classRows = db
        .prepare('SELECT * FROM character_classes WHERE character_id = ? ORDER BY position, id')
        .all(char.id) as any[];
      const lines: Array<{ classKey: string; level: number; subclassKey: string | null }> =
        classRows.length > 0
          ? classRows.map((r) => ({
              classKey: r.class_key,
              level: r.level ?? 1,
              subclassKey: r.subclass_key ?? null,
            }))
          : char.character_class
            ? [
                {
                  classKey: findClass(char.character_class)?.name ?? char.character_class,
                  level: char.level ?? 1,
                  subclassKey:
                    findClass(char.character_class)?.name === 'Clerc'
                      ? (char.divine_domain ?? null)
                      : findClass(char.character_class)?.name === 'Druide'
                        ? (char.druid_circle ?? null)
                        : findClass(char.character_class)?.name === 'Paladin'
                          ? (char.sacred_oath ?? null)
                          : null,
                },
              ]
            : [];
      const groups: Array<{ level: number; names: string[] }> = [];
      for (const line of lines) {
        const name = findClass(line.classKey)?.name ?? null;
        if (!name) continue;
        if (name === 'Clerc' && line.subclassKey) {
          groups.push(...domainSpellsFor(line.subclassKey, line.level));
        } else if (name === 'Druide' && line.subclassKey === 'terre' && char.land_circle) {
          groups.push(...bonusPreparedSpells('Druide', char.land_circle, line.level));
        } else if (name === 'Paladin' && line.subclassKey) {
          groups.push(...bonusPreparedSpells('Paladin', line.subclassKey, line.level));
        }
      }
      const spells: Array<Spell & { domainLevel: number }> = [];
      for (const g of groups) {
        for (const name of g.names) {
          const row = db.prepare('SELECT * FROM spells WHERE name = ? COLLATE NOCASE').get(name);
          if (row) spells.push({ ...mapSpell(row), domainLevel: g.level });
        }
      }
      return reply.send({ domain: char.divine_domain ?? null, spells }); // 'domain' kept for client compat
    },
  );
}
