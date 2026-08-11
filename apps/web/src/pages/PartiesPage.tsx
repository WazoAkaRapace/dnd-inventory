import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import type { Party, EncumbranceMode } from '@dnd-inventory/shared';
import { LoadingSpinner, EmptyState, Modal } from '../components/ui';

interface PartyRow extends Party {
  gmName?: string;
  role: 'gm' | 'player';
}

export default function PartiesPage() {
  const [parties, setParties] = useState<PartyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [error, setError] = useState('');

  // Create form
  const [name, setName] = useState('');
  const [mode, setMode] = useState<EncumbranceMode>('variant');

  // Join form
  const [inviteCode, setInviteCode] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/parties');
      setParties(res.data.parties);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createParty(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const res = await api.post('/api/parties', { name, encumbranceMode: mode });
      setShowCreate(false);
      setName('');
      await load();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur');
    }
  }

  async function joinParty(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/api/parties/join', { inviteCode });
      setShowJoin(false);
      setInviteCode('');
      await load();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Code invalide');
    }
  }

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="bg-red-50 text-red-700 p-4 rounded-lg">{error}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Mes groupes</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowJoin(true)} className="btn-secondary text-sm">
            Rejoindre
          </button>
          <button onClick={() => setShowCreate(true)} className="btn-primary text-sm">
            + Nouveau
          </button>
        </div>
      </div>

      {parties.length === 0 ? (
        <EmptyState
          icon="🎲"
          title="Aucun groupe pour l'instant"
          hint="Créez un groupe (comme MD) ou rejoignez-en un avec un code d'invitation."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {parties.map((p) => (
            <Link
              key={p.id}
              to={`/party/${p.id}`}
              className="card p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-display text-lg font-semibold">{p.name}</h3>
                  <p className="text-sm text-ink-400">
                    MD: {p.gmName || '—'}
                  </p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  p.role === 'gm' ? 'bg-blood-600 text-white' : 'bg-parchment-200 text-ink-700'
                }`}>
                  {p.role === 'gm' ? 'MD' : 'Joueur'}
                </span>
              </div>
              {p.role === 'gm' && (
                <div className="mt-3 flex items-center gap-2 text-sm">
                  <span className="text-ink-400">Code:</span>
                  <code className="bg-parchment-100 px-2 py-0.5 rounded font-mono font-semibold tracking-wider">
                    {p.inviteCode}
                  </code>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nouveau groupe">
        <form onSubmit={createParty} className="space-y-4">
          <div>
            <label className="label">Nom du groupe</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="label">Mode d'encombrement</label>
            <select className="input" value={mode} onChange={(e) => setMode(e.target.value as EncumbranceMode)}>
              <option value="variant">Variante — 3 paliers de poids (recommandé)</option>
              <option value="standard">Standard — un seul seuil max</option>
              <option value="slots">Emplacements — ignorant le poids</option>
            </select>
            <p className="text-xs text-ink-400 mt-1.5">
              {mode === 'variant' && 'Le personnage est ralenti à FOR×2.3 kg, FOR×4.5 kg, et immobilisé à FOR×6.8 kg.'}
              {mode === 'standard' && 'Le personnage est immobilisé au-delà de FOR×6.8 kg. Aucun palier intermédiaire.'}
              {mode === 'slots' && 'Chaque objet compte comme un emplacement, indépendamment de son poids.'}
            </p>
          </div>
          {error && <div className="text-red-600 text-sm">{error}</div>}
          <button type="submit" className="btn-primary w-full">Créer le groupe</button>
        </form>
      </Modal>

      {/* Join modal */}
      <Modal open={showJoin} onClose={() => setShowJoin(false)} title="Rejoindre un groupe">
        <form onSubmit={joinParty} className="space-y-4">
          <div>
            <label className="label">Code d'invitation</label>
            <input
              className="input text-center font-mono text-lg tracking-widest uppercase"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              maxLength={6}
              placeholder="ABCDEF"
              required
            />
          </div>
          {error && <div className="text-red-600 text-sm">{error}</div>}
          <button type="submit" className="btn-primary w-full">Rejoindre</button>
        </form>
      </Modal>
    </div>
  );
}
