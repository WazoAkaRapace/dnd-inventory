/**
 * Divine domain spells (Clerc, SRD): always prepared, don't count against
 * the prepared-spells limit. Derived from domain + level — no stored rows.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getDb } from '../db/index.ts';
import { requireUser, isPartyGM, mapSpell } from './helpers.ts';
import { domainSpellsFor } from '@dnd-inventory/shared';
import type { Spell } from '@dnd-inventory/shared';

export async function domainSpellRoutes(app: FastifyInstance) {
  app.get(
    '/characters/:id/domain-spells',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const db = getDb();
      const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(Number(req.params.id)) as any;
      if (!char) return reply.code(404).send({ error: 'Personnage introuvable' });
      const gm = isPartyGM(char.party_id, userId);
      if (char.owner_id !== userId && !gm) {
        return reply.code(403).send({ error: 'Réservé au propriétaire ou au MD' });
      }

      const groups = domainSpellsFor(char.divine_domain, char.level ?? 1);
      const spells: Array<Spell & { domainLevel: number }> = [];
      for (const g of groups) {
        for (const name of g.names) {
          const row = db.prepare('SELECT * FROM spells WHERE name = ? COLLATE NOCASE').get(name);
          if (row) spells.push({ ...mapSpell(row), domainLevel: g.level });
        }
      }
      return reply.send({ domain: char.divine_domain ?? null, spells });
    },
  );
}
