import type { CharacterSummary, CreateCharacterPayload, PartyDetail } from '@dnd-inventory/shared';
import { DND_CLASSES } from '@dnd-inventory/shared';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../auth';
import { EmptyState, ErrorMsg, LoadingSpinner, Modal } from '../components/ui';
import { useSyncEvent } from '../sync';

export default function PartyPage() {
  const { partyId } = useParams();
  const { user } = useAuth();
  const [party, setParty] = useState<PartyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddChar, setShowAddChar] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);

  // New character form
  const [charName, setCharName] = useState('');
  const [charStr, setCharStr] = useState(10);
  const [charClass, setCharClass] = useState('');
  const [charLevel, setCharLevel] = useState(1);
  const [charRace, setCharRace] = useState('');

  const load = useCallback(
    async (silent = false) => {
      if (!partyId) return;
      if (!silent) setLoading(true);
      try {
        const res = await api.get(`/api/parties/${partyId}`);
        setParty(res.data);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Groupe introuvable');
      } finally {
        setLoading(false);
      }
    },
    [partyId],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Real-time sync: refresh when party membership or characters change
  const currentPartyId = Number(partyId);
  useSyncEvent(
    (event) => {
      if (event.partyId === currentPartyId) {
        load(true); // silent — no spinner flash on sync updates
      }
    },
    [currentPartyId],
  );

  async function createChar(e: React.FormEvent) {
    e.preventDefault();
    const payload: CreateCharacterPayload = {
      name: charName,
      strength: charStr,
      characterClass: charClass.trim() || undefined,
      level: charLevel || undefined,
      race: charRace.trim() || undefined,
    };
    try {
      await api.post(`/api/parties/${partyId}/characters`, payload);
      setShowAddChar(false);
      setCharName('');
      setCharStr(10);
      setCharClass('');
      setCharLevel(1);
      setCharRace('');
      await load();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur');
    }
  }

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMsg message={error} />;
  if (!party) return <ErrorMsg message="Groupe introuvable" />;

  const isGM = party.members.some((m) => m.userId === user?.id && m.role === 'gm');
  const myCharacters = party.characters.filter((c) => c.ownerId === user?.id);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card p-4 sm:p-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold">{party.party.name}</h1>
            <p className="text-sm text-ink-400">
              Mode: {encumbranceLabel(party.party.encumbranceMode)} · {party.characters.length}{' '}
              personnage(s)
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {isGM && (
              <>
                <div className="flex items-center gap-2 bg-parchment-100 px-3 py-2 rounded-lg">
                  <span className="text-xs text-ink-400">Code:</span>
                  <code className="font-mono font-semibold tracking-wider">
                    {party.party.inviteCode}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard
                        .writeText(party.party.inviteCode)
                        .then(() => {
                          setInviteCopied(true);
                          setTimeout(() => setInviteCopied(false), 2000);
                        })
                        .catch(() => {});
                    }}
                    className="text-xs text-blood-600 hover:underline"
                  >
                    {inviteCopied ? 'Copié ✓' : 'Copier'}
                  </button>
                </div>
                <Link to={`/party/${partyId}/gm`} className="btn-secondary text-sm">
                  🛡 Table du MD
                </Link>
              </>
            )}
            <button
              type="button"
              onClick={() => setShowAddChar(true)}
              className="btn-primary text-sm"
            >
              + Personnage
            </button>
            <Link to={`/party/${partyId}/npcs`} className="btn-secondary text-sm">
              🎭 PNJ
            </Link>
            <Link to={`/party/${partyId}/combat`} className="btn-secondary text-sm">
              ⚔ Combat
            </Link>
          </div>
        </div>
      </div>

      {/* My characters */}
      {myCharacters.length > 0 && (
        <div>
          <h2 className="section-title mb-3">Mes personnages</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {myCharacters.map((c) => (
              <CharacterCard key={c.id} c={c} partyId={partyId!} />
            ))}
          </div>
        </div>
      )}

      {/* All characters (GM view or other players) */}
      {isGM && party.characters.length > myCharacters.length && (
        <div>
          <h2 className="section-title mb-3">Tous les personnages</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {party.characters.map((c) => (
              <CharacterCard key={c.id} c={c} partyId={partyId!} />
            ))}
          </div>
        </div>
      )}

      {!isGM && party.characters.length === 0 && (
        <EmptyState icon="🧙" title="Aucun personnage" hint="Crée ton personnage pour commencer." />
      )}

      {/* Members */}
      <div>
        <h2 className="section-title mb-3">Membres ({party.members.length})</h2>
        <div className="card p-4">
          <div className="flex flex-wrap gap-3">
            {party.members.map((m) => (
              <div key={m.userId} className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${m.role === 'gm' ? 'bg-blood-600' : 'bg-green-500'}`}
                />
                <span className="text-sm font-medium">{m.displayName}</span>
                <span className="text-xs text-ink-400">@{m.username}</span>
                <span className="text-xs text-ink-400">({m.role === 'gm' ? 'MD' : 'Joueur'})</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add character modal */}
      <Modal open={showAddChar} onClose={() => setShowAddChar(false)} title="Nouveau personnage">
        <form onSubmit={createChar} className="space-y-3">
          <div>
            <label className="label" htmlFor="new-char-name">
              Nom *
            </label>
            <input
              id="new-char-name"
              className="input"
              value={charName}
              onChange={(e) => setCharName(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="new-char-class">
                Classe
              </label>
              <input
                id="new-char-class"
                className="input"
                list="dnd-classes-create"
                value={charClass}
                onChange={(e) => setCharClass(e.target.value)}
                placeholder="Magicien"
              />
              <datalist id="dnd-classes-create">
                {DND_CLASSES.map((c) => (
                  <option key={c.name} value={c.name} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="label" htmlFor="new-char-level">
                Niveau
              </label>
              <input
                id="new-char-level"
                type="number"
                className="input"
                value={charLevel}
                min={1}
                max={20}
                onChange={(e) => setCharLevel(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="new-char-race">
                Race
              </label>
              <input
                id="new-char-race"
                className="input"
                value={charRace}
                onChange={(e) => setCharRace(e.target.value)}
                placeholder="Haut-elfe"
              />
            </div>
            <div>
              <label className="label" htmlFor="new-char-str">
                Force
              </label>
              <input
                id="new-char-str"
                type="number"
                className="input"
                value={charStr}
                min={1}
                max={30}
                onChange={(e) => setCharStr(Number(e.target.value))}
              />
            </div>
          </div>
          {error && <div className="text-red-600 text-sm">{error}</div>}
          <button type="submit" className="btn-primary w-full">
            Créer
          </button>
        </form>
      </Modal>
    </div>
  );
}

function CharacterCard({ c, partyId }: { c: CharacterSummary; partyId: string }) {
  return (
    <Link
      to={`/party/${partyId}/character/${c.id}`}
      className="card p-4 hover:shadow-md transition-shadow block"
    >
      <div className="flex items-start gap-3">
        {c.portraitUrl && (
          <img
            src={c.portraitUrl}
            alt={c.name}
            className="w-12 h-12 rounded-full object-cover border-2 border-parchment-300 shrink-0"
          />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="section-title truncate">{c.name}</h3>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink-500">
            {c.characterClass && (
              <span>
                {c.characterClass}
                {c.level ? ` ${c.level}` : ''}
              </span>
            )}
            {c.race && <span>{c.race}</span>}
            <span>💪 FOR {c.strength}</span>
          </div>
          <p className="text-xs text-ink-400 mt-2">Joueur: {c.ownerName}</p>
        </div>
      </div>
    </Link>
  );
}

function encumbranceLabel(mode: string): string {
  switch (mode) {
    case 'variant':
      return 'Variante (kg)';
    case 'standard':
      return 'Standard (kg)';
    case 'slots':
      return 'Emplacements';
    default:
      return mode;
  }
}
