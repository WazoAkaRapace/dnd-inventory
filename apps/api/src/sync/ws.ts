/**
 * WebSocket route for real-time sync.
 *
 * Clients connect to /ws?token=<JWT> and receive push notifications
 * when inventory/character/party data changes in any party they're a member of.
 *
 * The event bus (bus.ts) emits after mutations; this module fans out
 * to connected clients whose user is a member of the affected party.
 *
 * Echo suppression: the actor who triggered the change is NOT sent the
 * event (they already have the optimistic update from their own mutation).
 */

import type { WebSocket } from '@fastify/websocket';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getDb } from '../db/index.ts';
import { bus, type SyncEvent } from './bus.ts';

interface ClientInfo {
  userId: number;
  ws: WebSocket;
  partyIds: Set<number>; // cached at connection time
}

// All connected clients
const clients = new Set<ClientInfo>();

/** Get all party IDs a user belongs to (queried once at connection time). */
function getUserPartyIds(userId: number): Set<number> {
  const db = getDb();
  const rows = db
    .prepare('SELECT party_id FROM party_members WHERE user_id = ?')
    .all(userId) as any[];
  return new Set(rows.map((r) => r.party_id));
}

export async function registerWsRoutes(app: FastifyInstance) {
  // In @fastify/websocket v11, the handler receives (socket, req) — socket IS the WebSocket
  app.get('/ws', { websocket: true }, (socket: WebSocket, req: FastifyRequest) => {
    // Prefer the Sec-WebSocket-Protocol header (keeps tokens out of URLs/proxy logs);
    // the ?token= query param still works for older clients.
    const token = (req.headers['sec-websocket-protocol'] as string) || (req.query as any)?.token;
    let userId: number | null = null;

    if (token) {
      try {
        const payload = app.jwt.verify(token) as any;
        userId = payload.sub;
      } catch {
        socket.close(4001, 'Invalid token');
        return;
      }
    }

    if (!userId) {
      socket.close(4001, 'No token');
      return;
    }

    const clientInfo: ClientInfo = {
      userId,
      ws: socket,
      partyIds: getUserPartyIds(userId), // cache once, no per-event DB queries
    };
    clients.add(clientInfo);

    socket.on('close', () => {
      clients.delete(clientInfo);
    });

    // Send a confirmation message
    socket.send(JSON.stringify({ type: 'connected', userId }));
  });

  // Listen to the event bus and fan out to relevant clients
  bus.on('change', (event: SyncEvent) => {
    const message = JSON.stringify(event);
    // Targeted delivery: a removed/banned user is no longer a member at fan-out
    // time, so the membership gate below would skip their open tabs. They must
    // still hear the event — their PartyPage flips to "no longer at the table".
    if (event.targetUserId !== undefined) {
      for (const client of clients) {
        if (client.userId !== event.targetUserId || client.ws.readyState !== 1) continue;
        try {
          client.ws.send(message);
        } catch {
          clients.delete(client);
        }
      }
    }
    // Membership may have changed (join/leave) — refresh the cached party sets
    if (event.type === 'party:change') {
      const refreshed = new Set<number>();
      for (const client of clients) {
        if (!refreshed.has(client.userId)) {
          client.partyIds = getUserPartyIds(client.userId);
          refreshed.add(client.userId);
        }
      }
    }
    for (const client of clients) {
      if (client.ws.readyState !== 1) {
        // OPEN
        clients.delete(client);
        continue;
      }
      // Echo suppression: don't send the event back to the user who triggered it.
      // They already have the optimistic result from their own API call.
      // Exceptions: combat:change and character:change — a user can be GM in
      // one tab and player in another (own character in the fight), and those
      // views must stay in sync (initiative widget, HP mirroring).
      const isEchoExempt = event.type === 'combat:change' || event.type === 'character:change';
      if (event.actorUserId && client.userId === event.actorUserId && !isEchoExempt) continue;
      // Only push to clients who are members of the affected party
      if (client.partyIds.has(event.partyId)) {
        try {
          client.ws.send(message);
        } catch {
          clients.delete(client);
        }
      }
    }
  });
}
