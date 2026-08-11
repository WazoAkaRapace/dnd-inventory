import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api';
import { useSyncEvent } from '../sync';
import type { PartyDetail, CharacterSummary, CreateCustomItem } from '@dnd-inventory/shared';
import { LoadingSpinner, EmptyState, Modal, ErrorMsg } from '../components/ui';

interface Transaction {
  id: number;
  partyId: number;
  characterId: number | null;
  itemId: number | null;
  itemName: string;
  deltaQty: number;
  reason: string;
  actorName: string | null;
  at: string;
}

export default function GmDashboardPage() {
  const { partyId } = useParams();
  const [party, setParty] = useState<PartyDetail | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'characters' | 'transactions' | 'custom'>('characters');
  const [showAddItem, setShowAddItem] = useState(false);

  const load = useCallback(async () => {
    if (!partyId) return;
    setLoading(true);
    try {
      const [partyRes, txRes] = await Promise.all([
        api.get(`/api/parties/${partyId}`),
        api.get(`/api/parties/${partyId}/transactions`),
      ]);
      setParty(partyRes.data);
      setTransactions(txRes.data.transactions);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur');
    } finally {
      setLoading(false);
    }
  }, [partyId]);

  useEffect(() => { load(); }, [load]);

  // Real-time sync: refresh when any inventory/character/party change happens in this party
  const currentPartyId = Number(partyId);
  useSyncEvent((event) => {
    if (event.partyId === currentPartyId) {
      load(); // refresh characters + transactions
    }
  }, [currentPartyId]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMsg message={error} />;
  if (!party) return <ErrorMsg message="Groupe introuvable" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Link to={`/party/${partyId}`} className="btn-ghost text-sm">← Retour</Link>
          <h1 className="font-display text-2xl font-bold">🛡 Table du MD</h1>
        </div>
        <span className="text-sm text-ink-400">{party.party.name}</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-parchment-200">
        <TabButton active={tab === 'characters'} onClick={() => setTab('characters')}>
          Personnages ({party.characters.length})
        </TabButton>
        <TabButton active={tab === 'transactions'} onClick={() => setTab('transactions')}>
          Journal ({transactions.length})
        </TabButton>
        <TabButton active={tab === 'custom'} onClick={() => setTab('custom')}>
          Objets custom
        </TabButton>
      </div>

      {tab === 'characters' && (
        <CharactersTab characters={party.characters} partyId={partyId!} onReload={load} />
      )}

      {tab === 'transactions' && (
        <TransactionsTab transactions={transactions} />
      )}

      {tab === 'custom' && (
        <CustomItemsTab partyId={partyId!} onAdd={() => setShowAddItem(true)} showAdd={showAddItem} />
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        active ? 'border-blood-600 text-blood-700' : 'border-transparent text-ink-400 hover:text-ink-700'
      }`}
    >
      {children}
    </button>
  );
}

function CharactersTab({ characters, partyId, onReload }: { characters: CharacterSummary[]; partyId: string; onReload: () => void }) {
  const [deleteTarget, setDeleteTarget] = useState<CharacterSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/api/characters/${deleteTarget.id}`);
      setDeleteTarget(null);
      onReload();
    } catch {
      // error handled by parent
    } finally {
      setDeleting(false);
    }
  }

  if (characters.length === 0) {
    return <EmptyState icon="🧙" title="Aucun personnage" hint="Les joueurs doivent créer leurs personnages." />;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {characters.map((c) => (
        <div key={c.id} className="card p-4 hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between gap-2">
            <Link to={`/party/${partyId}/character/${c.id}`} className="min-w-0 flex-1">
              <h3 className="font-display text-lg font-semibold">{c.name}</h3>
              <div className="mt-1 flex gap-4 text-sm text-ink-500">
                <span>💪 FOR {c.strength}</span>
              </div>
              <p className="text-xs text-ink-400 mt-2">→ Voir l'inventaire</p>
            </Link>
            <button
              onClick={() => setDeleteTarget(c)}
              className="text-ink-400 hover:text-red-600 text-sm shrink-0 p-1"
              aria-label={`Supprimer ${c.name}`}
              title="Supprimer le personnage"
            >
              🗑
            </button>
          </div>
        </div>
      ))}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="card w-full sm:max-w-sm p-5 rounded-b-none sm:rounded-b-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg font-semibold mb-2">Supprimer {deleteTarget.name} ?</h3>
            <p className="text-sm text-ink-500 mb-4">Cette action est irréversible. Tout l'inventaire et la monnaie seront perdus.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting} className="btn-secondary flex-1">
                Annuler
              </button>
              <button onClick={confirmDelete} disabled={deleting} className="btn-primary flex-1 bg-red-600 hover:bg-red-700">
                {deleting ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TransactionsTab({ transactions }: { transactions: Transaction[] }) {
  if (transactions.length === 0) {
    return <EmptyState icon="📋" title="Aucune transaction" hint="Les modifications d'inventaire apparaîtront ici." />;
  }
  const reasonLabels: Record<string, string> = {
    'add': 'Ajout',
    'adjust': 'Ajustement',
    'remove': 'Retrait',
    'transfer-in': 'Transfert reçu',
    'transfer-out': 'Transfert donné',
  };
  return (
    <div className="card divide-y divide-parchment-100">
      {transactions.map((t) => (
        <div key={t.id} className="p-3 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <span className="font-medium">{t.itemName}</span>
            <span className="text-sm text-ink-400 ml-2">× {Math.abs(t.deltaQty)}</span>
            <div className="text-xs text-ink-400">
              {reasonLabels[t.reason] || t.reason}
              {t.actorName ? ` · par ${t.actorName}` : ''}
              {' · '}{new Date(t.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
            </div>
          </div>
          <span className={`text-sm font-mono font-semibold ${t.deltaQty > 0 ? 'text-green-600' : 'text-red-600'}`}>
            {t.deltaQty > 0 ? '+' : ''}{t.deltaQty}
          </span>
        </div>
      ))}
    </div>
  );
}

function CustomItemsTab({ partyId, onAdd, showAdd }: { partyId: string; onAdd: () => void; showAdd: boolean }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('custom');
  const [weight, setWeight] = useState('');
  const [desc, setDesc] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setSuccess('');
    const payload: CreateCustomItem = {
      name,
      category: category as any,
      weightKg: weight ? parseFloat(weight) : null,
      description: desc || undefined,
    };
    try {
      await api.post(`/api/parties/${partyId}/items`, payload);
      setSuccess(`"${name}" ajouté au catalogue`);
      setName(''); setWeight(''); setDesc(''); setCategory('custom');
      onAdd();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur');
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <h3 className="font-display text-lg font-semibold mb-3">Créer un objet personnalisé</h3>
        <p className="text-sm text-ink-400 mb-4">
          Ajoutez des objets non-SRD (trésors spéciaux, objets de quête, etc.). Le poids doit être en kg.
        </p>
        <form onSubmit={create} className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Nom *</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label className="label">Catégorie</label>
              <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="custom">Personnalisé</option>
                <option value="weapon">Arme</option>
                <option value="armor">Armure</option>
                <option value="gear">Équipement</option>
                <option value="magic">Objet magique</option>
              </select>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Poids (kg)</label>
              <input type="number" step="0.01" className="input" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="0.5" />
            </div>
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          {error && <div className="text-red-600 text-sm">{error}</div>}
          {success && <div className="text-green-600 text-sm">{success}</div>}
          <button type="submit" className="btn-primary">+ Ajouter au catalogue</button>
        </form>
      </div>
    </div>
  );
}
