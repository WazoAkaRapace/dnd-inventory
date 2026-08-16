/**
 * Floating combat widget for players.
 *
 * Appears bottom-left (minimized by default) when a combat is active or
 * in setup in one of the user's parties. Shows whose turn it is, and if
 * the player hasn't rolled initiative yet, provides an input.
 *
 * Only renders on the player's own character sheet page.
 * The GM uses the full CombatPage route.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, Link } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../auth';
import { useSyncEvent } from '../sync';
import TurnSlash, { useTurnSlash } from './TurnSlash';
import type { EncounterDetail, Combatant } from '@dnd-inventory/shared';

interface ActiveCombat {
  encounter: EncounterDetail;
  partyId: number;
  partyName: string;
  myCombatant: Combatant | null;
  currentCombatant: Combatant | null;
}

function rollD20(bonus: number): number {
  return Math.floor(Math.random() * 20) + 1 + bonus;
}

export default function CombatWidget() {
  const { user } = useAuth();
  const location = useLocation();
  const [combats, setCombats] = useState<ActiveCombat[]>([]);
  const [collapsed, setCollapsed] = useState(true); // minimized by default
  const [initInput, setInitInput] = useState('');
  const loadSeq = useRef(0);

  // Only show on a character sheet route
  const charMatch = location.pathname.match(/^\/party\/(\d+)\/character\/(\d+)/);
  const isCharacterSheet = !!charMatch;
  const charId = charMatch ? Number(charMatch[2]) : null;

  const loadCombats = useCallback(async () => {
    if (!user) return;
    // Race guard: rapid sync events + the 30s poll can overlap; only the
    // latest run may commit its result, otherwise a stale (pre-add) response
    // could overwrite a fresh one and hide the widget.
    const seq = ++loadSeq.current;
    try {
      // Fetch all parties the user belongs to
      const partiesRes = await api.get('/api/parties');
      const parties = partiesRes.data.parties || [];
      const activeCombats: ActiveCombat[] = [];

      await Promise.all(
        parties.map(async (p: any) => {
          try {
            const encRes = await api.get(`/api/parties/${p.id}/encounters`);
            const encounters = encRes.data.encounters || [];
            // Find active encounters AND setup encounters (where initiative may be pending)
            const relevant = encounters.filter((e: any) => e.status === 'active' || e.status === 'setup');
            for (const encSummary of relevant) {
              const detailRes = await api.get(`/api/encounters/${encSummary.id}`);
              const encounter: EncounterDetail = detailRes.data.encounter;
              const currentCombatant = encounter.combatants[encounter.turnIndex] ?? null;
              activeCombats.push({
                encounter,
                partyId: p.id,
                partyName: p.name,
                myCombatant: null, // resolved below
                currentCombatant,
              });
            }
          } catch {
            // skip (e.g., 403 if not in the encounter)
          }
        }),
      );

      // For each combat, find the player's combatant (matching by party characters).
      // Filter out combats where the player has no combatant (not in the fight).
      for (const combat of activeCombats) {
        try {
          const partyRes = await api.get(`/api/parties/${combat.partyId}`);
          const myCharIds = (partyRes.data.characters || [])
            .filter((c: any) => c.ownerId === user.id)
            .map((c: any) => c.id);
          combat.myCombatant = combat.encounter.combatants.find(
            (c) => c.characterId !== null && myCharIds.includes(c.characterId),
          ) ?? null;
        } catch {
          // skip
        }
      }
      // Only keep combats where the player is actually a combatant
      const myCombats = activeCombats.filter((c) => c.myCombatant !== null);

      if (seq === loadSeq.current) setCombats(myCombats);
    } catch {
      if (seq === loadSeq.current) setCombats([]);
    }
  }, [user]);

  useEffect(() => {
    loadCombats();
    // Refresh every 30s as a fallback (sync events handle real-time)
    const interval = setInterval(loadCombats, 30000);
    return () => clearInterval(interval);
  }, [loadCombats]);

  useSyncEvent((event) => {
    if (event.type === 'combat:change') {
      loadCombats();
    }
  }, []);

  const setInitiative = async (encounterId: number, combatantId: number, value: number) => {
    try {
      await api.patch(`/api/encounters/${encounterId}/combatants/${combatantId}/initiative`, {
        initiative: value,
      });
      loadCombats();
    } catch {
      // ignore
    }
  };

  // Only show on the player's OWN character sheet
  const [isMyCharacter, setIsMyCharacter] = useState(false);
  useEffect(() => {
    if (!user || !charId) { setIsMyCharacter(false); return; }
    api.get(`/api/characters/${charId}`)
      .then((res) => setIsMyCharacter(res.data.character?.ownerId === user.id))
      .catch(() => setIsMyCharacter(false));
  }, [user, charId]);

  // Priority: my turn > needs initiative > active combat
  // Nobody's turn is active while the encounter is still in setup.
  const myTurn = combats.find(
    (c) => c.encounter.status === 'active' &&
      c.myCombatant && c.currentCombatant?.id === c.myCombatant.id,
  );
  const isMyTurn = !!myTurn;

  // Sword-cut on the any-state → "your turn" transition (shared hook)
  const slashActive = useTurnSlash(isMyTurn);

  if (!user || !isCharacterSheet || !isMyCharacter || combats.length === 0) return null;

  const needsInit = combats.find((c) => c.myCombatant?.initiative === null);
  const combat = myTurn ?? needsInit ?? combats[0];
  const needsInitiative = combat.myCombatant?.initiative === null;
  const isSetup = combat.encounter.status === 'setup';

  if (collapsed) {
    // Raised circular button popping out of the bottom edge, like the dock hub.
    // On your turn the static glow gives way to the pulsing combat-turn-glow.
    const glowColor = isMyTurn
      ? 'combat-turn-glow'
      : needsInitiative
        ? 'shadow-[0_0_0_3px_rgba(202,138,4,0.4),0_0_20px_rgba(202,138,4,0.6)]'
        : 'shadow-lg';
    // On mobile the dock hub is the combat indicator — this floating button
    // only appears on desktop (lg+) where there's no dock.
    return (
      <button
        onClick={() => setCollapsed(false)}
        className={`hidden lg:flex fixed bottom-4 left-1/2 -translate-x-1/2 z-40 -my-3 w-12 h-12 rounded-full shadow-lg items-center justify-center text-xl leading-none transition-all active:scale-95 border-4 border-parchment-50 ${
          isMyTurn
            ? 'bg-blood-600 hover:bg-blood-700 text-parchment-50'
            : needsInitiative
              ? 'bg-yellow-500 hover:bg-yellow-600 text-ink-900'
              : 'bg-ink-900 hover:bg-ink-800 text-parchment-50'
        } ${glowColor}`}
        title={
          isMyTurn ? 'À toi de jouer !'
          : needsInitiative ? 'Saisis ton initiative'
          : 'Combat en cours'
        }
      >
        ⚔
        <TurnSlash active={slashActive} />
      </button>
    );
  }

  return (
    <div
      className={`hidden lg:block fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[min(92vw,20rem)] rounded-xl shadow-xl border-2 bg-white ${
        isMyTurn
          ? 'border-blood-500 combat-turn-glow'
          : needsInitiative
            ? 'border-yellow-500'
            : 'border-ink-300'
      }`}
    >
      <TurnSlash active={slashActive} />
      <div className="flex items-center justify-between p-3 border-b border-parchment-200">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚔</span>
          <div>
            <div className="text-xs font-semibold text-ink-700">{combat.partyName}</div>
            <div className="text-xs text-ink-400">
              {isSetup ? 'Préparation' : `Tour ${combat.encounter.round}`}
            </div>
          </div>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="text-ink-400 hover:text-ink-700 text-sm"
          title="Réduire"
        >
          ▾
        </button>
      </div>

      <div className="p-3 space-y-2">
        {/* Initiative request banner */}
        {needsInitiative && (
          <div className="text-center py-2 px-3 rounded-lg bg-yellow-400 text-ink-900 font-bold">
            🎲 Lance ton initiative !
          </div>
        )}

        {/* My turn banner */}
        {isMyTurn && (
          <div className="text-center py-2 px-3 rounded-lg bg-blood-600 text-parchment-50 font-bold">
            ⚔ À toi de jouer !
          </div>
        )}

        {/* Current actor (only during active combat) */}
        {combat.currentCombatant && !isMyTurn && !needsInitiative && (
          <div className="text-sm text-ink-600">
            Au tour de : <strong>{combat.currentCombatant.name}</strong>
            <span className="text-ink-400 ml-1">
              (init {combat.currentCombatant.initiative ?? '—'})
            </span>
          </div>
        )}

        {/* Initiative entry */}
        {needsInitiative && combat.myCombatant && (
          <div className="p-2 rounded-lg bg-yellow-50 border border-yellow-200">
            <p className="text-xs text-ink-600 mb-1">
              {combat.myCombatant.name} — saisis ton initiative :
            </p>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                max={40}
                value={initInput}
                onChange={(e) => setInitInput(e.target.value)}
                placeholder="—"
                className="input input-compact text-sm py-1"
                autoFocus
              />
              <button
                onClick={() => {
                  const v = parseInt(initInput, 10);
                  if (!isNaN(v)) setInitiative(combat.encounter.id, combat.myCombatant!.id, v);
                  setInitInput('');
                }}
                className="btn-primary text-xs px-2 py-1"
              >
                OK
              </button>
              <button
                onClick={() =>
                  setInitiative(
                    combat.encounter.id,
                    combat.myCombatant!.id,
                    rollD20(combat.myCombatant!.initiativeBonus),
                  )
                }
                className="btn-secondary text-xs px-2 py-1"
                title="Lancer d20 + DEX"
              >
                🎲
              </button>
            </div>
          </div>
        )}

        {/* My combatant status */}
        {combat.myCombatant && !needsInitiative && (
          <div className="flex items-center justify-between text-xs text-ink-500">
            <span>
              {combat.myCombatant.name} · init {combat.myCombatant.initiative}
            </span>
            <span>
              ❤ {combat.myCombatant.hitPoints}/{combat.myCombatant.maxHitPoints}
            </span>
          </div>
        )}

        {/* Link to combat page */}
        <Link
          to={`/party/${combat.partyId}/combat`}
          className="block text-center text-xs text-blood-600 hover:text-blood-700 pt-1"
        >
          Voir le combat →
        </Link>
      </div>
    </div>
  );
}
