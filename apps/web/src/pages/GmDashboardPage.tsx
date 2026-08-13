import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api';
import { useSyncEvent } from '../sync';
import type { PartyDetail, CharacterSummary, CreateCustomItem, CharacterInventory } from '@dnd-inventory/shared';
import {
  abilityModifier, formatModifier, proficiencyBonus, passivePerception, computeAC,
} from '@dnd-inventory/shared';
import { LoadingSpinner, EmptyState, Modal, ErrorMsg, CategoryBadge } from '../components/ui';

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

  const load = useCallback(async (silent = false) => {
    if (!partyId) return;
    if (!silent) setLoading(true);
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
      load(true); // silent — no spinner flash on sync updates
    }
  }, [currentPartyId]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMsg message={error} />;
  if (!party) return <ErrorMsg message="Groupe introuvable" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
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
        <CustomItemsTab partyId={partyId!} />
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
  const [inventories, setInventories] = useState<Record<number, CharacterInventory>>({});

  // Fetch all character inventories in parallel for AC, weight %, food/water counts
  const loadInventories = useCallback(async (chars: CharacterSummary[]) => {
    const results = await Promise.allSettled(
      chars.map((c) => api.get<CharacterInventory>(`/api/characters/${c.id}/inventory`)),
    );
    const map: Record<number, CharacterInventory> = {};
    chars.forEach((c, i) => {
      const r = results[i];
      if (r.status === 'fulfilled') map[c.id] = r.value.data;
    });
    setInventories(map);
  }, []);

  useEffect(() => {
    if (characters.length > 0) loadInventories(characters);
  }, [characters, loadInventories]);

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
      {characters.map((c) => {
        const inv = inventories[c.id];
        const entries = inv?.entries || [];
        const dexMod = abilityModifier(c.dexterity ?? 10);
        const wisMod = abilityModifier(c.wisdom ?? 10);
        const level = c.level ?? 1;
        const prof = proficiencyBonus(level);
        const hasPerception = c.skillProficiencies?.includes('perception') ?? false;
        const pp = passivePerception(wisMod, prof, hasPerception);
        const acResult = inv ? computeAC(entries, dexMod) : null;
        const effectiveAC = c.armorClassOverride ?? acResult?.ac ?? 10 + dexMod;
        const enc = inv?.encumbrance;
        const weightPct = enc ? Math.min(100, Math.round(enc.pct)) : 0;
        const hpPct = c.maxHp > 0 ? Math.max(0, Math.min(100, Math.round((c.currentHp / c.maxHp) * 100))) : 0;
        const hpColor = c.currentHp <= 0 ? 'bg-red-500' : hpPct < 33 ? 'bg-orange-500' : hpPct < 66 ? 'bg-yellow-500' : 'bg-green-500';

        // Food/water from inventory
        const foodCount = entries.reduce((sum, e) => sum + (e.item.survivalTags?.includes('food') ? e.quantity : 0), 0);
        const fullWaterCount = entries.reduce((sum, e) => {
          if (!e.item.survivalTags?.includes('water')) return sum;
          if (e.notes && e.notes.includes('empty')) return sum;
          return sum + e.quantity;
        }, 0);

        const exhColor = c.exhaustion === 0 ? 'bg-green-500' : c.exhaustion <= 2 ? 'bg-yellow-500' : c.exhaustion <= 4 ? 'bg-orange-500' : 'bg-red-500';

        return (
          <div key={c.id} className="card p-4 hover:shadow-md transition-shadow">
            {/* Header: portrait + name + class */}
            <div className="flex items-start justify-between gap-2">
              <Link to={`/party/${partyId}/character/${c.id}`} className="min-w-0 flex-1 flex items-center gap-2">
                {c.portraitUrl ? (
                  <img src={c.portraitUrl} alt={c.name} className="w-10 h-10 rounded-full object-cover border border-parchment-300 shrink-0" />
                ) : null}
                <div className="min-w-0">
                  <h3 className="font-display font-semibold truncate">{c.name}</h3>
                  <p className="text-xs text-ink-400">
                    {c.characterClass ? `${c.characterClass} ` : ''}
                    {c.level ? `Niv. ${c.level}` : ''}
                    {c.race ? ` · ${c.race}` : ''}
                  </p>
                </div>
              </Link>
              <button
                onClick={() => setDeleteTarget(c)}
                className="text-ink-400 hover:text-red-600 text-sm shrink-0 p-1"
                aria-label={`Supprimer ${c.name}`}
                title="Supprimer le personnage"
              >🗑</button>
            </div>

            {/* HP bar */}
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-ink-500 mb-1">
                <span>❤️ PV</span>
                <span className="font-medium">{c.currentHp}{c.tempHp > 0 ? ` (+${c.tempHp})` : ''} / {c.maxHp}</span>
              </div>
              <div className="h-2 bg-parchment-200 rounded-full overflow-hidden">
                <div className={`h-full ${hpColor} transition-all rounded-full`} style={{ width: `${hpPct}%` }} />
              </div>
            </div>

            {/* Inventory weight bar */}
            {enc && (
              <div className="mt-2">
                <div className="flex items-center justify-between text-xs text-ink-500 mb-1">
                  <span>🎒 Sac</span>
                  <span>{enc.totalWeightKg.toFixed(1)} / {enc.maxCarryKg.toFixed(0)} kg ({weightPct}%)</span>
                </div>
                <div className="h-1.5 bg-parchment-200 rounded-full overflow-hidden">
                  <div className={`h-full transition-all rounded-full ${
                    weightPct > 100 ? 'bg-red-500' : weightPct > 60 ? 'bg-orange-400' : 'bg-blue-400'
                  }`} style={{ width: `${Math.min(100, weightPct)}%` }} />
                </div>
              </div>
            )}

            {/* Stats row: CA, PP, food, water */}
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="font-medium">🛡 CA <span className="text-ink-800 font-bold">{effectiveAC}</span></span>
              <span className="font-medium">👁 PP <span className="text-ink-800 font-bold">{pp}</span></span>
              <span className="text-ink-500">🍖 {foodCount}</span>
              <span className="text-ink-500">💧 {fullWaterCount}</span>
              {c.exhaustion > 0 && (
                <span className="inline-flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${exhColor}`} />
                  <span className="text-ink-500">Épuis. {c.exhaustion}</span>
                </span>
              )}
              {c.currentHp <= 0 && (
                <span className="text-red-600 font-medium">💀 {c.deathSaveSuccesses}/3 ✓ · {c.deathSaveFailures}/3 ✗</span>
              )}
            </div>

            {/* Conditions */}
            {c.conditions && c.conditions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {c.conditions.map((cond) => (
                  <span key={cond} className="text-[10px] px-1.5 py-0.5 rounded-full bg-blood-50 text-blood-700 border border-blood-200">
                    {cond}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <Modal open={!!deleteTarget} onClose={() => !deleting && setDeleteTarget(null)} title={`Supprimer ${deleteTarget.name} ?`}>
          <p className="text-sm text-ink-500 mb-4">Cette action est irréversible. Tout l'inventaire et la monnaie seront perdus.</p>
          <div className="flex gap-2">
            <button onClick={() => setDeleteTarget(null)} disabled={deleting} className="btn-secondary flex-1">
              Annuler
            </button>
            <button onClick={confirmDelete} disabled={deleting} className="btn-primary flex-1 bg-red-600 hover:bg-red-700">
              {deleting ? 'Suppression…' : 'Supprimer'}
            </button>
          </div>
        </Modal>
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
    'consume-food': 'Repas consommé',
    'consume-water': 'Eau bue',
    'item': 'Objet',
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

function CustomItemsTab({ partyId }: { partyId: string }) {
  const [customItems, setCustomItems] = useState<any[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState('custom');
  const [weight, setWeight] = useState('');
  const [desc, setDesc] = useState('');

  const loadCustomItems = useCallback(async () => {
    try {
      const res = await api.get('/api/items', { params: { partyId, limit: 200 } });
      setCustomItems(res.data.items || []);
    } catch {
      setCustomItems([]);
    } finally {
      setLoadingItems(false);
    }
  }, [partyId]);

  useEffect(() => { loadCustomItems(); }, [loadCustomItems]);

  useSyncEvent((event) => {
    if (event.partyId === Number(partyId) && event.action === 'custom-item') {
      loadCustomItems();
    }
  }, [partyId]);

  const openCreate = () => {
    setEditing(null);
    setName(''); setCategory('custom'); setWeight(''); setDesc('');
    setError('');
    setShowModal(true);
  };

  const openEdit = (item: any) => {
    setEditing(item);
    setName(item.nameFr || item.name);
    setCategory(item.category);
    setWeight(item.weightKg !== null ? String(item.weightKg) : '');
    setDesc(item.description || '');
    setError('');
    setShowModal(true);
  };

  const save = async () => {
    if (!name.trim()) { setError('Le nom est requis'); return; }
    setSaving(true);
    setError('');
    const payload = {
      name: name.trim(),
      category,
      weightKg: weight ? parseFloat(weight) : null,
      description: desc.trim() || null,
    };
    try {
      if (editing) {
        await api.patch(`/api/items/${editing.id}`, payload);
      } else {
        await api.post(`/api/parties/${partyId}/items`, payload);
      }
      setShowModal(false);
      await loadCustomItems();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await api.delete(`/api/items/${id}`);
      setConfirmDelete(null);
      await loadCustomItems();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold">
          Objets personnalisés <span className="text-ink-400 text-sm font-normal">({customItems.length})</span>
        </h3>
        <button onClick={openCreate} className="btn-primary text-sm px-3 py-1.5">
          + Ajouter
        </button>
      </div>

      {loadingItems ? (
        <p className="text-sm text-ink-400 animate-pulse">Chargement…</p>
      ) : customItems.length === 0 ? (
        <div className="card p-8">
          <EmptyState
            icon="✨"
            title="Aucun objet personnalisé"
            message="Créez des objets non-SRD : trésors spéciaux, objets de quête, armes uniques…"
          />
        </div>
      ) : (
        <ul className="space-y-2">
          {customItems.map((item) => (
            <li key={item.id} className="card p-3 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-ink-800">{item.nameFr || item.name}</span>
                  <CategoryBadge category={item.category} />
                  {item.weightKg !== null && (
                    <span className="text-xs text-ink-400">{item.weightKg} kg</span>
                  )}
                </div>
                {item.description && (
                  <p className="text-xs text-ink-500 mt-1">{item.description}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => openEdit(item)}
                  className="text-ink-400 hover:text-blood-600 text-sm p-1"
                  aria-label="Modifier"
                >✎</button>
                <button
                  onClick={() => setConfirmDelete(item.id)}
                  className="text-ink-400 hover:text-red-500 text-sm p-1"
                  aria-label="Supprimer"
                >×</button>
              </div>
              {confirmDelete === item.id && (
                <div className="flex items-center gap-2 ml-2">
                  <button
                    onClick={() => remove(item.id)}
                    className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                  >Supprimer ?</button>
                  <button
                    onClick={() => setConfirmDelete(null)}
                    className="text-xs px-2 py-1 rounded bg-parchment-200 hover:bg-parchment-300"
                  >Annuler</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Floating + button */}
      {customItems.length > 0 && (
        <button
          onClick={openCreate}
          className="lg:hidden fab-enter fixed bottom-5 right-5 z-30 w-14 h-14 rounded-full bg-blood-600 text-white shadow-lg flex items-center justify-center text-2xl font-light hover:bg-blood-700 active:scale-95 transition-all"
          aria-label="Ajouter un objet personnalisé"
        >+</button>
      )}

      {/* Create/Edit modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Modifier l\'objet' : 'Nouvel objet personnalisé'}>
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="label">Nom *</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Épée du Héros" autoFocus />
            </label>
            <label className="block">
              <span className="label">Catégorie</span>
              <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="custom">Personnalisé</option>
                <option value="weapon">Arme</option>
                <option value="armor">Armure</option>
                <option value="gear">Équipement</option>
                <option value="magic">Objet magique</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span className="label">Poids (kg)</span>
            <input type="number" step="0.01" className="input" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="0.5" />
          </label>
          <label className="block">
            <span className="label">Description</span>
            <textarea className="input" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Une lame brillant d'une lumière dorée…" />
          </label>
          {error && <div className="text-red-600 text-sm">{error}</div>}
          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={saving || !name.trim()} className="btn-primary flex-1 disabled:opacity-50">
              {saving ? '…' : editing ? 'Enregistrer' : '+ Ajouter au catalogue'}
            </button>
            <button onClick={() => setShowModal(false)} className="btn-ghost text-ink-700">Annuler</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

