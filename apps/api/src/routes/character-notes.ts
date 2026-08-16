/**
 * Character notes routes: free-form notes with simple formatting.
 * Same ownership pattern as character-features.
 */

import type {
  CharacterNote,
  CreateCharacterNotePayload,
  PatchCharacterNotePayload,
} from '@dnd-inventory/shared';
import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/index.ts';
import { bus } from '../sync/bus.ts';
import { isPartyGM, isPartyMember, requireUser } from './helpers.ts';

function mapNote(row: any): CharacterNote {
  return {
    id: row.id,
    characterId: row.character_id,
    title: row.title,
    content: row.content,
    sortOrder: row.sort_order,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

function getNoteWithCharacter(noteId: number): { note: any; char: any } | null {
  const db = getDb();
  const note = db.prepare('SELECT * FROM character_notes WHERE id = ?').get(noteId) as any;
  if (!note) return null;
  const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(note.character_id) as any;
  if (!char) return null;
  return { note, char };
}

function isOwnerOrGM(char: any, userId: number): boolean {
  return char.owner_id === userId || isPartyGM(char.party_id, userId);
}

export async function characterNoteRoutes(app: FastifyInstance) {
  app.get('/characters/:id/notes', async (req, reply) => {
    const userId = await requireUser(req, reply);
    if (!userId) return;
    const charId = Number((req.params as any).id);
    const db = getDb();
    const char = db.prepare('SELECT party_id FROM characters WHERE id = ?').get(charId) as any;
    if (!char) return reply.code(404).send({ error: 'Character not found' });
    if (!isPartyMember(char.party_id, userId))
      return reply.code(403).send({ error: 'Not a party member' });

    const rows = db
      .prepare(
        'SELECT * FROM character_notes WHERE character_id = ? ORDER BY sort_order ASC, created_at ASC',
      )
      .all(charId);
    return { notes: rows.map(mapNote) };
  });

  app.post('/characters/:id/notes', async (req, reply) => {
    const userId = await requireUser(req, reply);
    if (!userId) return;
    const charId = Number((req.params as any).id);
    const db = getDb();
    const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(charId) as any;
    if (!char) return reply.code(404).send({ error: 'Character not found' });
    if (!isPartyMember(char.party_id, userId))
      return reply.code(403).send({ error: 'Not a party member' });
    if (!isOwnerOrGM(char, userId))
      return reply.code(403).send({ error: 'Only the owner or GM can modify' });

    const body = req.body as CreateCharacterNotePayload;
    const title = body?.title?.trim();
    if (!title) return reply.code(400).send({ error: 'Title is required' });

    const sortOrder = (
      db
        .prepare(
          'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM character_notes WHERE character_id = ?',
        )
        .get(charId) as any
    ).next;

    const result = db
      .prepare(
        `INSERT INTO character_notes (character_id, title, content, sort_order) VALUES (?, ?, ?, ?)`,
      )
      .run(charId, title, body.content?.trim() || null, sortOrder);

    const note = mapNote(
      db.prepare('SELECT * FROM character_notes WHERE id = ?').get(result.lastInsertRowid),
    );
    bus.emitChange({
      type: 'character:change',
      partyId: char.party_id,
      characterId: charId,
      action: 'stats',
      actorUserId: userId,
    });
    return reply.code(201).send({ note });
  });

  app.patch('/character-notes/:noteId', async (req, reply) => {
    const userId = await requireUser(req, reply);
    if (!userId) return;
    const noteId = Number((req.params as any).noteId);
    const pair = getNoteWithCharacter(noteId);
    if (!pair) return reply.code(404).send({ error: 'Note not found' });
    const { note, char } = pair;
    if (!isPartyMember(char.party_id, userId))
      return reply.code(403).send({ error: 'Not a party member' });
    if (!isOwnerOrGM(char, userId))
      return reply.code(403).send({ error: 'Only the owner or GM can modify' });

    const body = req.body as PatchCharacterNotePayload;
    const sets: string[] = [];
    const vals: any[] = [];
    if (body.title !== undefined) {
      sets.push('title = ?');
      vals.push(body.title.trim());
    }
    if (body.content !== undefined) {
      sets.push('content = ?');
      vals.push(body.content);
    }
    if (sets.length === 0) return reply.code(400).send({ error: 'No fields to update' });
    sets.push("updated_at = datetime('now')");
    vals.push(noteId);

    const db = getDb();
    db.prepare(`UPDATE character_notes SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    const updated = mapNote(db.prepare('SELECT * FROM character_notes WHERE id = ?').get(noteId));
    bus.emitChange({
      type: 'character:change',
      partyId: char.party_id,
      characterId: note.character_id,
      action: 'stats',
      actorUserId: userId,
    });
    return { note: updated };
  });

  app.delete('/character-notes/:noteId', async (req, reply) => {
    const userId = await requireUser(req, reply);
    if (!userId) return;
    const noteId = Number((req.params as any).noteId);
    const pair = getNoteWithCharacter(noteId);
    if (!pair) return reply.code(404).send({ error: 'Note not found' });
    const { note, char } = pair;
    if (!isPartyMember(char.party_id, userId))
      return reply.code(403).send({ error: 'Not a party member' });
    if (!isOwnerOrGM(char, userId))
      return reply.code(403).send({ error: 'Only the owner or GM can modify' });

    const db = getDb();
    db.prepare('DELETE FROM character_notes WHERE id = ?').run(noteId);
    bus.emitChange({
      type: 'character:change',
      partyId: char.party_id,
      characterId: note.character_id,
      action: 'stats',
      actorUserId: userId,
    });
    return reply.code(204).send();
  });
}
