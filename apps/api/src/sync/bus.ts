/**
 * In-process event bus for real-time sync.
 *
 * Mutation routes call emitChange() after a successful DB write.
 * The WebSocket server (ws.ts) listens to these events and pushes them
 * to all connected clients in the affected party.
 *
 * Since the app is single-process (one better-sqlite3 instance), an
 * in-process EventEmitter is sufficient — no Redis needed.
 */
import { EventEmitter } from 'node:events';

export interface SyncEvent {
  type: 'inventory:change' | 'character:change' | 'party:change';
  partyId: number;
  characterId?: number;
  toCharacterId?: number; // for transfers
  action?: 'add' | 'remove' | 'transfer' | 'adjust' | 'coins' | 'stats' | 'custom-item' | 'join';
  itemName?: string;
  actorUserId?: number;
}

class SyncBus extends EventEmitter {
  emitChange(event: SyncEvent): void {
    this.emit('change', event);
  }
}

// Singleton — one bus per process
export const bus = new SyncBus();
bus.setMaxListeners(100); // one per connected WS client
