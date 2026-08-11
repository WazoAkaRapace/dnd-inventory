/**
 * WebSocket route for real-time sync.
 *
 * Clients connect to /ws?token=<JWT> and receive push notifications
 * when inventory/character/party data changes in any party they're a member of.
 *
 * The event bus (bus.ts) emits after mutations; this module fans out
 * to connected clients whose user is a member of the affected party.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import { bus, type SyncEvent } from './bus.ts';
import { getDb } from '../db/index.ts';

interface ClientInfo {
  userId: number;
  ws: WebSocket;
}

// All connected clients
const clients = new Set<ClientInfo>();

/** Get all party IDs a user belongs to. */
function getUserPartyIds(userId: number): Set<number> {
  const db = getDb();
  const rows = db.prepare('SELECT party_id FROM party_members WHERE user_id = ?').all(userId) as any[];
  return new Set(rows.map((r) => r.party_id));
}

export async function registerWsRoutes(app: FastifyInstance) {
  // In @fastify/websocket v11, the handler receives (socket, req) — socket IS the WebSocket
  app.get('/ws', { websocket: true }, (socket: WebSocket, req: FastifyRequest) => {
    const token = (req.query as any)?.token;
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

    const clientInfo: ClientInfo = { userId, ws: socket };
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
    for (const client of clients) {
      if (client.ws.readyState !== 1) { // OPEN
        clients.delete(client);
        continue;
      }
      // Only push to clients who are members of the affected party
      const partyIds = getUserPartyIds(client.userId);
      if (partyIds.has(event.partyId)) {
        try {
          client.ws.send(message);
        } catch {
          clients.delete(client);
        }
      }
    }
  });
}
