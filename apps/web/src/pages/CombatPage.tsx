/**
 * Combat tracker page (GM view): full combat grid for managing encounters,
 * initiative order, monster groups, and player combatants.
 *
 * Players see a floating widget (CombatWidget) on other pages for their
 * initiative entry + turn notifications.
 */

import type {
  Combatant,
  EncounterDetail,
  EncounterStatus,
  EncounterSummary,
  PartyDetail,
} from '@dnd-inventory/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../auth';
import AddMonsterModal from '../components/AddMonsterModal';
import AddPlayerModal from '../components/AddPlayerModal';
import CombatantRow from '../components/CombatantRow';
import MonsterStatBlock from '../components/MonsterStatBlock';
import {
  ConfirmButton,
  EmptyState,
  ErrorMsg,
  Fab,
  LoadingSpinner,
  Modal,
  type Toast,
  ToastStack,
} from '../components/ui';
import { useHeaderOverride } from '../headerContext';
import { useSyncEvent } from '../sync';

export default function CombatPage() {
  const { partyId } = useParams();
  const { user } = useAuth();
  const [party, setParty] = useState<PartyDetail | null>(null);
  const [encounters, setEncounters] = useState<EncounterSummary[]>([]);
  const [activeEncounter, setActiveEncounter] = useState<EncounterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddMonster, setShowAddMonster] = useState(false);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [showNewEncounter, setShowNewEncounter] = useState(false);
  const [newName, setNewName] = useState('');

  // Damage chip: the rolled damage waiting to be applied. Tapping a combatant
  // card while armed applies floor(value × half?0.5:1) and consumes the chip.
  const [damageChip, setDamageChip] = useState<{
    value: number;
    source: string;
    half: boolean;
  } | null>(null);
  const [applyMode, setApplyMode] = useState(false);

  // Stat block: docked side panel on desktop, bottom-sheet modal on mobile.
  const [statPanelSlug, setStatPanelSlug] = useState<string | null>(null);
  const [statModalSlug, setStatModalSlug] = useState<string | null>(null);
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Toasts for combat mutations (optimistic rollback, applied damage…)
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  const pushToast = useCallback((message: string, kind: Toast['kind'] = 'success') => {
    const id = ++toastId.current;
    setToasts((ts) => [...ts, { id, message, kind }]);
    setTimeout(
      () => setToasts((ts) => ts.filter((t) => t.id !== id)),
      kind === 'error' ? 6000 : 2500,
    );
  }, []);

  const currentPartyId = Number(partyId);
  const isGM = party?.members.some((m) => m.userId === user?.id && m.role === 'gm') ?? false;

  // Override app Nav header: when inside an encounter, show its name + back to
  // list. Players also get a shortcut back to their own character sheet.
  const backToList = useCallback(() => setActiveEncounter(null), []);
  const myCharacter = party?.characters.find((c) => c.ownerId === user?.id) ?? null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: dep narrowed to myCharacter?.id so the memoized action object keeps a stable identity across party refreshes.
  const sheetAction = useMemo(
    () =>
      myCharacter && partyId
        ? { label: 'Ma fiche', short: '🧙', to: `/party/${partyId}/character/${myCharacter.id}` }
        : null,
    [myCharacter?.id, partyId],
  );
  useHeaderOverride(
    activeEncounter ? activeEncounter.name : '⚔ Combat',
    activeEncounter ? backToList : null,
    sheetAction,
  );

  const load = useCallback(
    async (silent = false) => {
      if (!partyId) return;
      if (!silent) setLoading(true);
      try {
        const [partyRes, encRes] = await Promise.all([
          api.get(`/api/parties/${partyId}`),
          api.get(`/api/parties/${partyId}/encounters`),
        ]);
        setParty(partyRes.data);
        setEncounters(encRes.data.encounters || []);
        setError('');
      } catch (err: any) {
        setError(err.response?.data?.error || 'Erreur');
      } finally {
        setLoading(false);
      }
    },
    [partyId],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Real-time sync — skip our own echo: we already applied the server's
  // response, so reloading would just flash stale→fresh for nothing.
  useSyncEvent(
    (event) => {
      if (event.partyId === currentPartyId && event.type === 'combat:change') {
        if (event.actorUserId !== undefined && event.actorUserId === user?.id) return;
        load(true);
        // Also refresh the active encounter detail
        if (activeEncounter) loadEncounter(activeEncounter.id, true);
      }
    },
    [currentPartyId, activeEncounter?.id, user?.id],
  );

  const loadEncounter = useCallback(async (id: number, silent = false) => {
    try {
      const res = await api.get(`/api/encounters/${id}`);
      setActiveEncounter(res.data.encounter);
    } catch {
      // Silent refreshes keep the stale view; a failed explicit open must say so.
      if (!silent) setError('Impossible de charger la rencontre');
    }
  }, []);

  const selectEncounter = async (id: number) => {
    await loadEncounter(id);
  };

  // Deep link: /combat?enc=ID opens the encounter directly
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinked = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: selectEncounter is omitted on purpose — it is recreated every render and the deepLinked ref guards against double loads.
  useEffect(() => {
    if (deepLinked.current || loading || encounters.length === 0) return;
    const encParam = searchParams.get('enc');
    if (encParam) {
      const id = Number(encParam);
      if (encounters.some((e) => e.id === id)) {
        deepLinked.current = true;
        selectEncounter(id);
        searchParams.delete('enc');
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [searchParams, setSearchParams, loading, encounters]);

  const createEncounter = async () => {
    if (!newName.trim()) return;
    try {
      const res = await api.post(`/api/parties/${partyId}/encounters`, { name: newName.trim() });
      setShowNewEncounter(false);
      setNewName('');
      await load(true);
      await selectEncounter(res.data.encounter.id);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur');
    }
  };

  const patchEncounter = async (patch: Partial<EncounterDetail>) => {
    if (!activeEncounter) return;
    try {
      await api.patch(`/api/encounters/${activeEncounter.id}`, patch);
      // Response omits combatants — reload the full detail.
      await loadEncounter(activeEncounter.id, true);
    } catch (err: any) {
      pushToast(err.response?.data?.error || 'Erreur', 'error');
    }
  };

  const nextTurn = async () => {
    if (!activeEncounter) return;
    try {
      // The server recomputes turn order, round and condition expiry — the
      // response skips combatants, so reload the full detail once.
      await api.post(`/api/encounters/${activeEncounter.id}/next-turn`);
      await loadEncounter(activeEncounter.id, true);
    } catch (err: any) {
      pushToast(err.response?.data?.error || 'Erreur', 'error');
    }
  };

  const addMonster = async (slug: string, count: number, name: string) => {
    if (!activeEncounter) return;
    try {
      await api.post(`/api/encounters/${activeEncounter.id}/combatants/monster`, {
        monsterSlug: slug,
        count,
        name,
      });
      await loadEncounter(activeEncounter.id);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur');
    }
  };

  const addPlayers = async (characterIds: number[]) => {
    if (!activeEncounter || characterIds.length === 0) return;
    try {
      await api.post(`/api/encounters/${activeEncounter.id}/combatants/player`, { characterIds });
      await loadEncounter(activeEncounter.id);
      setShowAddPlayer(false);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur');
    }
  };

  const patchCombatant = async (id: number, patch: Partial<Combatant>) => {
    if (!activeEncounter) return;
    // Optimistic: apply locally now, reconcile with the server's combatant,
    // roll back visually if the patch fails.
    const snapshot = activeEncounter;
    setActiveEncounter({
      ...snapshot,
      combatants: snapshot.combatants.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
    try {
      const res = await api.patch(`/api/combatants/${id}`, patch);
      const updated: Combatant | undefined = res.data?.combatant;
      if (updated) {
        setActiveEncounter((enc) =>
          enc
            ? { ...enc, combatants: enc.combatants.map((c) => (c.id === id ? updated : c)) }
            : enc,
        );
      }
    } catch (err: any) {
      setActiveEncounter(snapshot);
      pushToast(err.response?.data?.error || 'Échec de la mise à jour', 'error');
    }
  };

  const setInitiative = async (id: number, initiative: number) => {
    if (!activeEncounter) return;
    try {
      await api.patch(`/api/encounters/${activeEncounter.id}/combatants/${id}/initiative`, {
        initiative,
      });
      await loadEncounter(activeEncounter.id);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur');
    }
  };

  const deleteCombatant = async (id: number) => {
    try {
      await api.delete(`/api/combatants/${id}`);
      if (activeEncounter) await loadEncounter(activeEncounter.id);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur');
    }
  };

  const deleteEncounter = async (id: number) => {
    try {
      await api.delete(`/api/encounters/${id}`);
      if (activeEncounter?.id === id) setActiveEncounter(null);
      await load(true);
    } catch (err: any) {
      pushToast(err.response?.data?.error || 'Erreur', 'error');
    }
  };

  // ---------- Damage chip flow ----------

  /** A damage roll in a stat block (panel or modal) creates a fresh chip. */
  const handleDamageRolled = useCallback((total: number, source: string) => {
    setDamageChip({ value: total, source, half: false });
    setApplyMode(false);
  }, []);

  /** Tap the chip → arm; tap again → disarm. */
  const toggleChip = () => setApplyMode((a) => !a);

  const applyDamageTo = (combatantId: number) => {
    if (!damageChip || !activeEncounter) return;
    const target = activeEncounter.combatants.find((c) => c.id === combatantId);
    if (!target) return;
    const dealt = Math.floor(damageChip.value * (damageChip.half ? 0.5 : 1));
    const max = target.maxHitPoints ?? 0;
    const cur = target.hitPoints ?? 0;
    const newHp = Math.max(0, Math.min(max, cur - dealt));
    setDamageChip(null);
    setApplyMode(false);
    patchCombatant(combatantId, { hitPoints: newHp });
  };

  const cancelChip = () => {
    setDamageChip(null);
    setApplyMode(false);
  };

  // Escape cancels apply mode
  useEffect(() => {
    if (!applyMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelChip();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [applyMode]);

  /** Stat blocks dock on desktop, open as modal on mobile. */
  const openStatBlock = useCallback(
    (slug: string) => {
      if (isDesktop) setStatPanelSlug(slug);
      else setStatModalSlug(slug);
    },
    [isDesktop],
  );

  if (loading) return <LoadingSpinner />;
  if (error && !party) return <ErrorMsg message={error} />;
  if (!party) return <ErrorMsg message="Groupe introuvable" />;

  const currentCombatant = activeEncounter?.combatants[activeEncounter.turnIndex];
  const availableChars = party.characters.filter(
    (c) => !activeEncounter?.combatants.some((com) => com.characterId === c.id),
  );
  // In setup phase, check if all combatants have rolled initiative
  const needsInitiative =
    activeEncounter?.status === 'setup' &&
    activeEncounter.combatants.some((c) => !c.defeated && c.initiative === null);

  return (
    <div className="space-y-4">
      {error && <ErrorMsg message={error} />}

      {/* Encounter selector */}
      {!activeEncounter && (
        <div>
          {encounters.length === 0 ? (
            <EmptyState
              icon="⚔"
              title="Aucune rencontre"
              hint={
                isGM
                  ? 'Crée une rencontre pour commencer le combat.'
                  : "Le MD n'a pas encore créé de rencontre."
              }
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {encounters.map((enc) => (
                <div
                  key={enc.id}
                  onClick={() => selectEncounter(enc.id)}
                  className="card p-4 text-left hover:shadow-md transition-shadow cursor-pointer"
                >
                  <h3 className="section-title">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        selectEncounter(enc.id);
                      }}
                      className="text-left w-full section-title"
                    >
                      {enc.name}
                    </button>
                  </h3>
                  <div className="mt-2 flex gap-3 text-sm text-ink-500">
                    <span>👥 {enc.combatantCount}</span>
                    <span>
                      {enc.status === 'setup' && '⚪ Préparation'}
                      {enc.status === 'active' && `🔴 Tour ${enc.round}`}
                      {enc.status === 'ended' && '⚫ Terminé'}
                    </span>
                  </div>
                  {isGM && (
                    <ConfirmButton
                      onConfirm={() => deleteEncounter(enc.id)}
                      className="text-ink-400 hover:text-red-600 text-xs mt-2"
                      armedClassName="text-red-700 font-semibold"
                      title="Supprimer la rencontre"
                      confirmChildren="Confirmer ?"
                    >
                      Supprimer
                    </ConfirmButton>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Active encounter combat grid */}
      {activeEncounter && (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-4 lg:items-start">
          <div className="min-w-0 space-y-4">
            {/* Turn controls — pinned while the list scrolls */}
            <div className="card p-3 flex items-center justify-between gap-3 flex-wrap sticky top-2 z-30 lg:top-3">
              <div className="flex items-center gap-3">
                {activeEncounter.status === 'setup' && (
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      needsInitiative
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-green-100 text-green-700'
                    }`}
                  >
                    {needsInitiative
                      ? "⚪ En attente d'initiative"
                      : '✅ Prêt à démarrer — cliquez Tour suivant'}
                  </span>
                )}
                {activeEncounter.status === 'active' && (
                  <>
                    <span className="px-3 py-1 rounded-full bg-blood-600 text-parchment-50 text-sm font-medium">
                      🔴 Tour {activeEncounter.round}
                    </span>
                    {currentCombatant && (
                      <span className="text-sm text-ink-600">
                        Au tour de : <strong>{currentCombatant.name}</strong>
                      </span>
                    )}
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isGM && activeEncounter.status !== 'ended' && (
                  <>
                    <button
                      type="button"
                      onClick={nextTurn}
                      disabled={needsInitiative}
                      className="btn-primary text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                      title={
                        needsInitiative
                          ? 'Tous les combattants doivent lancer leur initiative'
                          : 'Passer au tour suivant'
                      }
                    >
                      {activeEncounter.status === 'setup'
                        ? '▶ Démarrer le combat'
                        : '▶ Tour suivant'}
                    </button>
                    {activeEncounter.status === 'active' && (
                      <button
                        type="button"
                        onClick={() => patchEncounter({ status: 'ended' })}
                        className="btn-secondary text-sm"
                      >
                        ⏹ Fin
                      </button>
                    )}
                  </>
                )}
                {isGM && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowAddMonster(true)}
                      className="btn-secondary text-sm"
                    >
                      + Monstre
                    </button>
                    {availableChars.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowAddPlayer(true)}
                        className="btn-secondary text-sm"
                      >
                        + PJ
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Damage chip tray — the rolled damage waits here until applied */}
            {isGM && damageChip && (
              <div
                className={`card p-2.5 flex items-center gap-2 flex-wrap ${
                  applyMode ? 'ring-2 ring-blood-400' : ''
                }`}
                role="status"
              >
                <button
                  type="button"
                  onClick={toggleChip}
                  className={`px-3 py-1.5 rounded-lg text-sm font-bold font-mono transition-all active:scale-95 ${
                    applyMode
                      ? 'bg-blood-600 text-parchment-50 shadow-md'
                      : 'bg-orange-100 text-orange-800 hover:bg-orange-200'
                  }`}
                  title={applyMode ? 'Annuler (Échap)' : 'Appliquer à une cible'}
                >
                  ⚔ {Math.floor(damageChip.value * (damageChip.half ? 0.5 : 1))} dégâts
                  <span className="text-xs font-normal ml-1.5 opacity-75 font-sans">
                    {damageChip.source}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setDamageChip((c) => (c ? { ...c, half: !c.half } : c))}
                  className={`px-2.5 py-1.5 rounded-lg text-sm font-bold transition-colors ${
                    damageChip.half
                      ? 'bg-ink-900 text-parchment-50'
                      : 'bg-parchment-100 text-ink-600 hover:bg-parchment-200'
                  }`}
                  aria-pressed={damageChip.half}
                  title="Demi-dégâts (résistance, sauvegarde réussie)"
                >
                  ½
                </button>
                <button
                  type="button"
                  onClick={cancelChip}
                  className="btn-ghost text-ink-400 hover:text-ink-700 p-1 text-sm"
                  aria-label="Annuler la puce de dégâts"
                >
                  ✕
                </button>
                <span className="text-xs text-ink-500 ml-auto">
                  {applyMode ? 'Touchez une cible…' : 'Touchez la puce, puis une cible'}
                </span>
              </div>
            )}

            {/* Combatant list */}
            {activeEncounter.combatants.length === 0 ? (
              <EmptyState
                icon="🎭"
                title="Aucun combattant"
                hint={isGM ? 'Ajoutez des monstres et des personnages pour commencer.' : ''}
              />
            ) : (
              <CombatantList
                combatants={activeEncounter.combatants}
                turnIndex={activeEncounter.turnIndex}
                status={activeEncounter.status}
                isGM={isGM}
                partyId={currentPartyId}
                party={party}
                userId={user?.id ?? 0}
                onPatch={patchCombatant}
                onDelete={deleteCombatant}
                onSetInitiative={setInitiative}
                targetMode={isGM && applyMode && !!damageChip}
                onApplyDamage={applyDamageTo}
                onOpenStatBlock={isGM ? openStatBlock : undefined}
              />
            )}
          </div>

          {/* Docked stat block (desktop) — rolls feed the damage chip above */}
          {isGM && (
            <aside className="hidden lg:block lg:sticky lg:top-3 max-h-[calc(100vh-6rem)]">
              {statPanelSlug ? (
                <MonsterStatBlock
                  open
                  variant="panel"
                  slug={statPanelSlug}
                  onClose={() => setStatPanelSlug(null)}
                  onDamageRolled={handleDamageRolled}
                />
              ) : (
                <div className="card p-6 text-center text-sm text-ink-400">
                  📜 Bloc de stats
                  <p className="mt-1 text-xs">
                    Touchez 📜 sur un monstre pour l'amarrer ici pendant la rencontre.
                  </p>
                </div>
              )}
            </aside>
          )}
        </div>
      )}

      {/* Mobile stat-block modal */}
      <MonsterStatBlock
        open={statModalSlug !== null}
        slug={statModalSlug}
        onClose={() => setStatModalSlug(null)}
        onDamageRolled={handleDamageRolled}
      />

      {/* New encounter modal */}
      <Modal
        open={showNewEncounter}
        onClose={() => setShowNewEncounter(false)}
        title="Nouvelle rencontre"
      >
        <label className="label" htmlFor="new-encounter-name">
          Nom de la rencontre
        </label>
        <input
          id="new-encounter-name"
          autoFocus
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Ex: Embuscade gobeline"
          className="input w-full"
          onKeyDown={(e) => e.key === 'Enter' && createEncounter()}
        />
        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={() => setShowNewEncounter(false)}
            className="btn-secondary flex-1"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={createEncounter}
            className="btn-primary flex-1"
            disabled={!newName.trim()}
          >
            Créer
          </button>
        </div>
      </Modal>

      {/* Add monster modal */}
      <AddMonsterModal
        open={showAddMonster}
        onClose={() => setShowAddMonster(false)}
        onAdd={addMonster}
      />

      {/* Add player modal */}
      <AddPlayerModal
        open={showAddPlayer}
        onClose={() => setShowAddPlayer(false)}
        characters={availableChars}
        onAdd={addPlayers}
      />

      {/* FAB: create new encounter (GM only, encounter list only) */}
      {!activeEncounter && isGM && (
        <Fab onClick={() => setShowNewEncounter(true)} label="Nouvelle rencontre" />
      )}

      <ToastStack
        toasts={toasts}
        onDismiss={(id) => setToasts((ts) => ts.filter((t) => t.id !== id))}
      />
    </div>
  );
}

// ---------- Combatant list with grouping ----------

interface Group {
  key: string;
  groupId: number | null;
  members: { combatant: Combatant; index: number }[];
}

function CombatantList({
  combatants,
  turnIndex,
  status,
  isGM,
  partyId,
  party,
  userId,
  onPatch,
  onDelete,
  onSetInitiative,
  targetMode = false,
  onApplyDamage,
  onOpenStatBlock,
}: {
  combatants: Combatant[];
  turnIndex: number;
  status: EncounterStatus;
  isGM: boolean;
  partyId: number;
  party: PartyDetail;
  userId: number;
  onPatch: (id: number, patch: Partial<Combatant>) => void;
  onDelete: (id: number) => void;
  onSetInitiative: (id: number, initiative: number) => void;
  targetMode?: boolean;
  onApplyDamage?: (id: number) => void;
  onOpenStatBlock?: (slug: string) => void;
}) {
  // Build groups: combatants with the same groupId form a group;
  // those without groupId are each their own singleton.
  const groups: Group[] = [];
  const seenGroups = new Map<number | string, Group>();

  combatants.forEach((c, idx) => {
    if (c.groupId !== null) {
      const existing = seenGroups.get(c.groupId);
      if (existing) {
        existing.members.push({ combatant: c, index: idx });
      } else {
        const g: Group = {
          key: `g${c.groupId}`,
          groupId: c.groupId,
          members: [{ combatant: c, index: idx }],
        };
        seenGroups.set(c.groupId, g);
        groups.push(g);
      }
    } else {
      const g: Group = { key: `s${c.id}`, groupId: null, members: [{ combatant: c, index: idx }] };
      groups.push(g);
    }
  });

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const isGroup = group.members.length > 1;
        const first = group.members[0].combatant;
        const isCurrentGroup = group.members.some(
          (m) => m.index === turnIndex && status === 'active',
        );
        const aliveCount = group.members.filter((m) => !m.combatant.defeated).length;
        const totalCount = group.members.length;

        return (
          <div key={group.key} className="relative">
            {/* Floating "Tour" label for the whole group */}
            {isCurrentGroup && (
              <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-blood-600 text-parchment-50 text-xs font-bold shadow-md z-10 whitespace-nowrap">
                ◀ Tour
              </span>
            )}
            {/* Group header (only for multi-member groups) */}
            {isGroup && (
              <div
                className={`flex items-center gap-2 px-2 py-1 mb-1 rounded-lg text-sm font-medium ${
                  isCurrentGroup
                    ? 'bg-blood-100 text-blood-700'
                    : first.type === 'player'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-red-100 text-red-700'
                }`}
              >
                <span className="font-bold">{first.name}</span>
                <span className="text-xs">
                  {aliveCount}/{totalCount} en vie
                </span>
                <div className="ml-auto flex items-center gap-1">
                  {first.initiative === null ? (
                    isGM ? (
                      <>
                        <input
                          type="number"
                          placeholder="Init"
                          className="input input-compact h-7 text-xs"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const v = parseInt((e.target as HTMLInputElement).value, 10);
                              if (!Number.isNaN(v)) onSetInitiative(first.id, v);
                            }
                          }}
                          title="Saisir l'initiative du groupe"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            onSetInitiative(
                              first.id,
                              Math.floor(Math.random() * 20) + 1 + first.initiativeBonus,
                            )
                          }
                          className="text-blood-600 hover:text-blood-700 text-sm"
                          title="Lancer l'initiative (d20 + DEX)"
                        >
                          🎲
                        </button>
                      </>
                    ) : null
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-ink-900 text-parchment-50 text-xs font-mono">
                      Init {first.initiative}
                    </span>
                  )}
                  {isGM && first.monsterSlug && (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenStatBlock ? onOpenStatBlock(first.monsterSlug!) : undefined
                      }
                      className="text-ink-500 hover:text-blood-600 text-xs"
                      title="Stat block"
                    >
                      📜
                    </button>
                  )}
                  {isGM && (
                    <ConfirmButton
                      onConfirm={() => onDelete(first.id)}
                      className="text-ink-400 hover:text-red-600 text-xs"
                      armedClassName="bg-red-100 text-red-700 rounded px-1.5"
                      title="Supprimer le groupe"
                      ariaLabel={`Supprimer le groupe ${first.name}`}
                      confirmChildren="Sûr ?"
                    >
                      🗑
                    </ConfirmButton>
                  )}
                </div>
              </div>
            )}

            {/* Members */}
            <div
              className={`space-y-2 ${isGroup ? 'ml-3 border-l-2 pl-3' : ''} ${
                isCurrentGroup ? 'border-blood-500' : 'border-parchment-200'
              }`}
            >
              {group.members.map((m, memberIdx) => (
                <CombatantRow
                  key={m.combatant.id}
                  combatant={m.combatant}
                  characterSheetPath={
                    m.combatant.characterId &&
                    party.characters.some((ch) => ch.id === m.combatant.characterId)
                      ? `/party/${partyId}/character/${m.combatant.characterId}`
                      : undefined
                  }
                  label={isGroup ? `${m.combatant.name} ${memberIdx + 1}` : undefined}
                  isCurrent={isCurrentGroup || (m.index === turnIndex && status === 'active')}
                  isGM={isGM}
                  canSetInitiative={
                    !!m.combatant.characterId &&
                    party.characters.some(
                      (ch) => ch.id === m.combatant.characterId && ch.ownerId === userId,
                    )
                  }
                  hideInitiative={isGroup} // initiative shown in group header
                  hideTourLabel={isGroup} // tour label shown on group wrapper
                  onPatch={onPatch}
                  onDelete={isGroup ? undefined : onDelete} // delete handled by group header
                  onSetInitiative={onSetInitiative}
                  targetMode={targetMode}
                  onApplyDamage={onApplyDamage}
                  onOpenStatBlock={onOpenStatBlock}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
