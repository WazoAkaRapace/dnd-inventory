/**
 * Combat tracker page (GM view): full combat grid for managing encounters,
 * initiative order, monster groups, and player combatants.
 *
 * Players see a floating widget (CombatWidget) on other pages for their
 * initiative entry + turn notifications.
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../auth';
import { useSyncEvent } from '../sync';
import { useHeaderOverride } from '../headerContext';
import type {
  EncounterDetail,
  EncounterSummary,
  Combatant,
  CharacterSummary,
  PartyDetail,
  EncounterStatus,
} from '@dnd-inventory/shared';
import { LoadingSpinner, ErrorMsg, EmptyState, Modal } from '../components/ui';
import CombatantRow from '../components/CombatantRow';
import AddMonsterModal from '../components/AddMonsterModal';
import MonsterStatBlock from '../components/MonsterStatBlock';

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

  const currentPartyId = Number(partyId);
  const isGM = party?.members.some((m) => m.userId === user?.id && m.role === 'gm') ?? false;

  // Override app Nav header: when inside an encounter, show its name + back to list
  const backToList = useCallback(() => setActiveEncounter(null), []);
  useHeaderOverride(
    activeEncounter ? activeEncounter.name : '⚔ Combat',
    activeEncounter ? backToList : null,
  );

  const load = useCallback(async (silent = false) => {
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
  }, [partyId]);

  useEffect(() => { load(); }, [load]);

  // Real-time sync
  useSyncEvent((event) => {
    if (event.partyId === currentPartyId && event.type === 'combat:change') {
      load(true);
      // Also refresh the active encounter detail
      if (activeEncounter) loadEncounter(activeEncounter.id, true);
    }
  }, [currentPartyId, activeEncounter?.id]);

  const loadEncounter = useCallback(async (id: number, silent = false) => {
    try {
      const res = await api.get(`/api/encounters/${id}`);
      setActiveEncounter(res.data.encounter);
    } catch {
      // handled silently
    }
  }, []);

  const selectEncounter = async (id: number) => {
    await loadEncounter(id);
  };

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
      await loadEncounter(activeEncounter.id);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur');
    }
  };

  const nextTurn = async () => {
    if (!activeEncounter) return;
    try {
      await api.post(`/api/encounters/${activeEncounter.id}/next-turn`);
      await loadEncounter(activeEncounter.id);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur');
    }
  };

  const addMonster = async (slug: string, count: number, name: string) => {
    if (!activeEncounter) return;
    try {
      await api.post(`/api/encounters/${activeEncounter.id}/combatants/monster`, {
        monsterSlug: slug, count, name,
      });
      await loadEncounter(activeEncounter.id);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur');
    }
  };

  const addPlayer = async (characterId: number) => {
    if (!activeEncounter) return;
    try {
      await api.post(`/api/encounters/${activeEncounter.id}/combatants/player`, { characterId });
      await loadEncounter(activeEncounter.id);
      setShowAddPlayer(false);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur');
    }
  };

  const patchCombatant = async (id: number, patch: Partial<Combatant>) => {
    if (!activeEncounter) return;
    try {
      await api.patch(`/api/combatants/${id}`, patch);
      await loadEncounter(activeEncounter.id);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur');
    }
  };

  const setInitiative = async (id: number, initiative: number) => {
    if (!activeEncounter) return;
    try {
      await api.patch(`/api/encounters/${activeEncounter.id}/combatants/${id}/initiative`, { initiative });
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
      setError(err.response?.data?.error || 'Erreur');
    }
  };

  if (loading) return <LoadingSpinner />;
  if (error && !party) return <ErrorMsg message={error} />;
  if (!party) return <ErrorMsg message="Groupe introuvable" />;

  const currentCombatant = activeEncounter?.combatants[activeEncounter.turnIndex];
  const availableChars = party.characters.filter(
    (c) => !activeEncounter?.combatants.some((com) => com.characterId === c.id),
  );
  // In setup phase, check if all combatants have rolled initiative
  const needsInitiative = activeEncounter?.status === 'setup' &&
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
              hint={isGM ? 'Créez une rencontre pour commencer le combat.' : 'Le MD n\'a pas encore créé de rencontre.'}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {encounters.map((enc) => (
                <button
                  key={enc.id}
                  onClick={() => selectEncounter(enc.id)}
                  className="card p-4 text-left hover:shadow-md transition-shadow"
                >
                  <h3 className="font-display text-lg font-semibold">{enc.name}</h3>
                  <div className="mt-2 flex gap-3 text-sm text-ink-500">
                    <span>👥 {enc.combatantCount}</span>
                    <span>
                      {enc.status === 'setup' && '⚪ Préparation'}
                      {enc.status === 'active' && `🔴 Tour ${enc.round}`}
                      {enc.status === 'ended' && '⚫ Terminé'}
                    </span>
                  </div>
                  {isGM && (
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteEncounter(enc.id); }}
                      className="text-ink-400 hover:text-red-600 text-xs mt-2"
                    >
                      Supprimer
                    </button>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Active encounter combat grid */}
      {activeEncounter && (
        <>
          {/* Turn controls */}
          <div className="card p-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              {activeEncounter.status === 'setup' && (
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  needsInitiative
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-green-100 text-green-700'
                }`}>
                  {needsInitiative
                    ? '⚪ En attente d\'initiative'
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
                    onClick={nextTurn}
                    disabled={needsInitiative}
                    className="btn-primary text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    title={needsInitiative ? 'Tous les combattants doivent lancer leur initiative' : 'Passer au tour suivant'}
                  >
                    {activeEncounter.status === 'setup' ? '▶ Démarrer le combat' : '▶ Tour suivant'}
                  </button>
                  {activeEncounter.status === 'active' && (
                    <button
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
                  <button onClick={() => setShowAddMonster(true)} className="btn-secondary text-sm">
                    + Monstre
                  </button>
                  {availableChars.length > 0 && (
                    <button onClick={() => setShowAddPlayer(true)} className="btn-secondary text-sm">
                      + PJ
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

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
              party={party}
              userId={user?.id ?? 0}
              onPatch={patchCombatant}
              onDelete={deleteCombatant}
              onSetInitiative={setInitiative}
            />
          )}
        </>
      )}

      {/* New encounter modal */}
      <Modal open={showNewEncounter} onClose={() => setShowNewEncounter(false)} title="Nouvelle rencontre">
        <label className="label">Nom de la rencontre</label>
        <input
          autoFocus
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Ex: Embuscade gobeline"
          className="input w-full"
          onKeyDown={(e) => e.key === 'Enter' && createEncounter()}
        />
        <div className="flex gap-2 mt-4">
          <button onClick={() => setShowNewEncounter(false)} className="btn-secondary flex-1">
            Annuler
          </button>
          <button onClick={createEncounter} className="btn-primary flex-1" disabled={!newName.trim()}>
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
      <Modal open={showAddPlayer} onClose={() => setShowAddPlayer(false)} title="Ajouter un personnage">
        <div className="space-y-1 max-h-[60vh] overflow-y-auto">
          {availableChars.map((c: CharacterSummary) => (
            <button
              key={c.id}
              onClick={() => addPlayer(c.id)}
              className="w-full text-left p-3 rounded-lg border border-parchment-200 hover:border-blood-300 hover:bg-blood-50 transition-colors"
            >
              <span className="font-medium">{c.name}</span>
              {c.characterClass && (
                <span className="text-sm text-ink-400 ml-2">{c.characterClass} N{c.level}</span>
              )}
            </button>
          ))}
        </div>
      </Modal>

      {/* FAB: create new encounter (GM only, encounter list only) */}
      {!activeEncounter && isGM && (
        <button
          onClick={() => setShowNewEncounter(true)}
          className="fab-enter fixed bottom-5 right-5 z-30 w-14 h-14 rounded-full bg-blood-600 text-white shadow-lg flex items-center justify-center text-2xl font-light hover:bg-blood-700 active:scale-95 transition-all"
          aria-label="Nouvelle rencontre"
        >
          +
        </button>
      )}
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
  party,
  userId,
  onPatch,
  onDelete,
  onSetInitiative,
}: {
  combatants: Combatant[];
  turnIndex: number;
  status: EncounterStatus;
  isGM: boolean;
  party: PartyDetail;
  userId: number;
  onPatch: (id: number, patch: Partial<Combatant>) => void;
  onDelete: (id: number) => void;
  onSetInitiative: (id: number, initiative: number) => void;
}) {
  const [statBlockSlug, setStatBlockSlug] = useState<string | null>(null);

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
        const g: Group = { key: `g${c.groupId}`, groupId: c.groupId, members: [{ combatant: c, index: idx }] };
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
        const firstIdx = group.members[0].index;
        const first = group.members[0].combatant;
        const isCurrentGroup = group.members.some((m) => m.index === turnIndex && status === 'active');
        const aliveCount = group.members.filter((m) => !m.combatant.defeated).length;
        const totalCount = group.members.length;

        return (
          <div key={group.key}>
            {/* Group header (only for multi-member groups) */}
            {isGroup && (
              <div className={`flex items-center gap-2 px-2 py-1 mb-1 rounded-lg text-sm font-medium ${
                isCurrentGroup ? 'bg-blood-100 text-blood-700' : 'bg-parchment-100 text-ink-600'
              }`}>
                <span className="font-bold">
                  {first.type === 'player' ? '🧙' : '👹'} {first.name}
                </span>
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
                          className="input w-14 h-7 text-center p-0 text-xs"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const v = parseInt((e.target as HTMLInputElement).value, 10);
                              if (!isNaN(v)) onSetInitiative(first.id, v);
                            }
                          }}
                          title="Saisir l'initiative du groupe"
                        />
                        <button
                          onClick={() => onSetInitiative(first.id, Math.floor(Math.random() * 20) + 1 + first.initiativeBonus)}
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
                      onClick={() => setStatBlockSlug(first.monsterSlug)}
                      className="text-ink-500 hover:text-blood-600 text-xs"
                      title="Stat block"
                    >
                      📜
                    </button>
                  )}
                  {isGM && (
                    <button
                      onClick={() => onDelete(first.id)}
                      className="text-ink-400 hover:text-red-600 text-xs"
                      title="Supprimer le groupe"
                    >
                      🗑
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Members */}
            <div className={`space-y-2 ${isGroup ? 'ml-3 border-l-2 border-parchment-200 pl-3' : ''}`}>
              {group.members.map((m, memberIdx) => (
                <CombatantRow
                  key={m.combatant.id}
                  combatant={m.combatant}
                  label={isGroup ? `${m.combatant.name} ${memberIdx + 1}` : undefined}
                  isCurrent={m.index === turnIndex && status === 'active'}
                  isGM={isGM}
                  canSetInitiative={!!m.combatant.characterId && party.characters.some(
                    (ch) => ch.id === m.combatant.characterId && ch.ownerId === userId,
                  )}
                  hideInitiative={isGroup} // initiative shown in group header
                  onPatch={onPatch}
                  onDelete={isGroup ? undefined : onDelete} // delete handled by group header
                  onSetInitiative={onSetInitiative}
                />
              ))}
            </div>
          </div>
        );
      })}

      <MonsterStatBlock
        open={statBlockSlug !== null}
        slug={statBlockSlug}
        onClose={() => setStatBlockSlug(null)}
      />
    </div>
  );
}
