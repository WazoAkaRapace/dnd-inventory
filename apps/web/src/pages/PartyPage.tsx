import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api';
import { useSyncEvent } from '../sync';
import type { PartyDetail, CharacterSummary, CreateCharacterPayload } from '@dnd-inventory/shared';
import { LoadingSpinner, EmptyState, Modal, ErrorMsg } from '../components/ui';
import { useAuth } from '../auth';

export default function PartyPage() {
  const { partyId } = useParams();
  const { user } = useAuth();
  const [party, setParty] = useState<PartyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddChar, setShowAddChar] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  // New character form
  const [charName, setCharName] = useState('');
  const [charStr, setCharStr] = useState(10);

  const load = useCallback(async () => {
    if (!partyId) return;
    setLoading(true);
    try {
      const res = await api.get(`/api/parties/${partyId}`);
      setParty(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Groupe introuvable');
    } finally {
      setLoading(false);
    }
  }, [partyId]);

  useEffect(() => { load(); }, [load]);

  // Real-time sync: refresh when party membership or characters change
  const currentPartyId = Number(partyId);
  useSyncEvent((event) => {
    if (event.partyId === currentPartyId) {
      load();
    }
  }, [currentPartyId]);

  async function createChar(e: React.FormEvent) {
    e.preventDefault();
    const payload: CreateCharacterPayload = {
      name: charName,
      strength: charStr,
    };
    try {
      await api.post(`/api/parties/${partyId}/characters`, payload);
      setShowAddChar(false);
      setCharName(''); setCharStr(10);
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
              Mode: {encumbranceLabel(party.party.encumbranceMode)} · {party.characters.length} personnage(s)
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {isGM && (
              <>
                <div className="flex items-center gap-2 bg-parchment-100 px-3 py-2 rounded-lg">
                  <span className="text-xs text-ink-400">Code:</span>
                  <code className="font-mono font-semibold tracking-wider">{party.party.inviteCode}</code>
                  <button
                    onClick={() => navigator.clipboard.writeText(party.party.inviteCode)}
                    className="text-xs text-blood-600 hover:underline"
                  >
                    Copier
                  </button>
                </div>
                <Link to={`/party/${partyId}/gm`} className="btn-secondary text-sm">
                  🛡 Table du MD
                </Link>
              </>
            )}
            <button onClick={() => setShowAddChar(true)} className="btn-primary text-sm">
              + Personnage
            </button>
          </div>
        </div>
      </div>

      {/* My characters */}
      {myCharacters.length > 0 && (
        <div>
          <h2 className="font-display text-lg font-semibold mb-3">Mes personnages</h2>
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
          <h2 className="font-display text-lg font-semibold mb-3">Tous les personnages</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {party.characters.map((c) => (
              <CharacterCard key={c.id} c={c} partyId={partyId!} />
            ))}
          </div>
        </div>
      )}

      {!isGM && party.characters.length === 0 && (
        <EmptyState icon="🧙" title="Aucun personnage" hint="Créez votre personnage pour commencer." />
      )}

      {/* Members */}
      <div>
        <h2 className="font-display text-lg font-semibold mb-3">Membres ({party.members.length})</h2>
        <div className="card p-4">
          <div className="flex flex-wrap gap-3">
            {party.members.map((m) => (
              <div key={m.userId} className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${m.role === 'gm' ? 'bg-blood-600' : 'bg-green-500'}`} />
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
            <label className="label">Nom *</label>
            <input className="input" value={charName} onChange={(e) => setCharName(e.target.value)} required />
          </div>
          <div>
            <label className="label">Force</label>
            <input type="number" className="input" value={charStr} min={1} max={30} onChange={(e) => setCharStr(Number(e.target.value))} />
          </div>
          {error && <div className="text-red-600 text-sm">{error}</div>}
          <button type="submit" className="btn-primary w-full">Créer</button>
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
      <h3 className="font-display text-lg font-semibold">{c.name}</h3>
      <div className="mt-1 flex gap-4 text-sm text-ink-500">
        <span>💪 FOR {c.strength}</span>
      </div>
      <p className="text-xs text-ink-400 mt-2">Joueur: {c.ownerName}</p>
    </Link>
  );
}

function encumbranceLabel(mode: string): string {
  switch (mode) {
    case 'variant': return 'Variante (kg)';
    case 'standard': return 'Standard (kg)';
    case 'slots': return 'Emplacements';
    default: return mode;
  }
}
