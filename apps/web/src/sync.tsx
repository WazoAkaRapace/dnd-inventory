import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import type { User } from '@dnd-inventory/shared';

// ---------- Types ----------

export interface SyncEvent {
  type: 'inventory:change' | 'character:change' | 'party:change' | 'combat:change';
  partyId: number;
  characterId?: number;
  toCharacterId?: number;
  action?: string;
  itemName?: string;
  actorUserId?: number;
}

type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

interface SyncState {
  status: ConnectionStatus;
  /** Register a handler for sync events. Returns an unsubscribe function. */
  subscribe: (handler: (event: SyncEvent) => void) => () => void;
  /** Track local mutations for same-tab dedup. Call right before/after a mutation. */
  markLocalMutation: () => void;
}

const SyncContext = createContext<SyncState>(null!);

// ---------- Helpers ----------

function buildWsUrl(token: string): string {
  const apiBase = import.meta.env.VITE_API_URL || '';
  if (apiBase) {
    // Explicit API URL (e.g. Docker or production)
    const httpUrl = apiBase.replace(/^http/, 'ws');
    return `${httpUrl}/ws?token=${encodeURIComponent(token)}`;
  }
  // Dev: same origin (Vite proxy handles /ws)
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;
}

// ---------- Provider ----------

export function SyncProvider({ user, children }: { user: User | null; children: React.ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(1000);
  const handlersRef = useRef<Set<(event: SyncEvent) => void>>(new Set());

  // Debounce: coalesce rapid sync events into a single handler dispatch.
  // If multiple events arrive within 300ms (e.g. rapid edits by another user),
  // only the last one is dispatched — preventing refetch storms.
  const pendingEvent = useRef<SyncEvent | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dispatchToHandlers = useCallback((event: SyncEvent) => {
    for (const handler of handlersRef.current) {
      try { handler(event); } catch {}
    }
  }, []);

  const connect = useCallback((token: string) => {
    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.onclose = null; // prevent reconnect trigger
      wsRef.current.close();
      wsRef.current = null;
    }

    setStatus('connecting');
    const url = buildWsUrl(token);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      reconnectDelay.current = 1000; // reset backoff
    };

    ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as SyncEvent;
        // Debounce: store the latest event and schedule a dispatch.
        // If another event arrives before the timer fires, the earlier one
        // is replaced — only one refetch happens per 300ms window.
        pendingEvent.current = event;
        if (debounceTimer.current) return; // already scheduled, will pick up latest
        debounceTimer.current = setTimeout(() => {
          debounceTimer.current = null;
          if (pendingEvent.current) {
            dispatchToHandlers(pendingEvent.current);
            pendingEvent.current = null;
          }
        }, 300);
      } catch {}
    };

    ws.onclose = () => {
      setStatus('disconnected');
      wsRef.current = null;
      // Auto-reconnect with exponential backoff (1s → 2s → 4s → ... → 10s max)
      if (reconnectDelay.current < 10000) {
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, 10000);
      }
      reconnectTimeout.current = setTimeout(() => {
        const savedToken = localStorage.getItem('dnd-inv-token');
        if (savedToken) connect(savedToken);
      }, reconnectDelay.current);
    };

    ws.onerror = () => {
      // onclose will handle reconnect
    };
  }, [dispatchToHandlers]);

  // Connect on login, disconnect on logout
  useEffect(() => {
    if (user) {
      const token = localStorage.getItem('dnd-inv-token');
      if (token) connect(token);
    } else {
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      setStatus('disconnected');
    }

    return () => {
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [user, connect]);

  const subscribe = useCallback((handler: (event: SyncEvent) => void) => {
    handlersRef.current.add(handler);
    return () => { handlersRef.current.delete(handler); };
  }, []);

  // markLocalMutation is kept for backward compatibility but is now a no-op.
  // Echo suppression is handled server-side (ws.ts skips the actor).
  const markLocalMutation = useCallback(() => {}, []);

  return (
    <SyncContext.Provider value={{ status, subscribe, markLocalMutation }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  return useContext(SyncContext);
}

/** Convenience hook: subscribe to sync events filtered by partyId/characterId. */
export function useSyncEvent(
  handler: (event: SyncEvent) => void,
  deps: React.DependencyList = [],
) {
  const { subscribe } = useSync();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    return subscribe((event) => handlerRef.current(event));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe, ...deps]);
}
