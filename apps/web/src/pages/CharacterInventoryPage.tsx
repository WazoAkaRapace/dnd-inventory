import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api';
import type {
  CharacterInventory,
  InventoryEntry,
  Item,
  ItemCategory,
  Rarity,
  Character,
  CharacterSummary,
  PartyDetail,
} from '@dnd-inventory/shared';
import { CATEGORY_LABELS_FR, RARITY_LABELS_FR, COIN_LABELS_FR } from '@dnd-inventory/shared';
import {
  LoadingSpinner,
  ErrorMsg,
  EmptyState,
  Modal,
  RarityBadge,
  CategoryBadge,
  WeightBadge,
  CostBadge,
  EncumbranceBar,
} from '../components/ui';

// ---------- Filter option sets ----------

const CATEGORY_OPTIONS: { value: '' | ItemCategory; label: string }[] = [
  { value: '', label: 'Toutes catégories' },
  ...(Object.keys(CATEGORY_LABELS_FR) as ItemCategory[])
    .filter((c) => c !== 'custom')
    .map((c) => ({ value: c as ItemCategory, label: CATEGORY_LABELS_FR[c] })),
];

const RARITY_OPTIONS: { value: '' | Rarity; label: string }[] = [
  { value: '', label: 'Toutes raretés' },
  ...(['common', 'uncommon', 'rare', 'veryRare', 'legendary', 'artifact'] as Rarity[]).map(
    (r) => ({ value: r, label: RARITY_LABELS_FR[r] }),
  ),
];

const COIN_FIELDS: { key: keyof Pick<Character, 'copper' | 'silver' | 'electrum' | 'gold' | 'platinum'>; unit: 'cp' | 'sp' | 'ep' | 'gp' | 'pp'; icon: string }[] = [
  { key: 'copper', unit: 'cp', icon: '🥉' },
  { key: 'silver', unit: 'sp', icon: '⚪' },
  { key: 'electrum', unit: 'ep', icon: '🟡' },
  { key: 'gold', unit: 'gp', icon: '🟠' },
  { key: 'platinum', unit: 'pp', icon: '⚪' },
];

const CATALOG_PAGE_SIZE = 30;

// ---------- Main component ----------

export default function CharacterInventoryPage() {
  const { partyId, charId } = useParams<{ partyId: string; charId: string }>();

  // Inventory / character state
  const [data, setData] = useState<CharacterInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Per-entry optimistic in-flight flags (avoid double clicks)
  const [busyEntryIds, setBusyEntryIds] = useState<Set<number>>(new Set());

  // Expanded entry (show description)
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Coin purse
  const [showCoins, setShowCoins] = useState(false);
  const [coins, setCoins] = useState({ copper: 0, silver: 0, electrum: 0, gold: 0, platinum: 0 });
  const [savingCoins, setSavingCoins] = useState(false);

  // Catalog
  const [catalogSearch, setCatalogSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [catalogCategory, setCatalogCategory] = useState<'' | ItemCategory>('');
  const [catalogRarity, setCatalogRarity] = useState<'' | Rarity>('');
  const [catalogItems, setCatalogItems] = useState<Item[]>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [catalogOffset, setCatalogOffset] = useState(0);
  const [addingItemId, setAddingItemId] = useState<number | null>(null);

  // Transfer modal
  const [transferEntry, setTransferEntry] = useState<InventoryEntry | null>(null);

  // ---------- Load inventory ----------
  const load = useCallback(async () => {
    if (!charId) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.get<CharacterInventory>(`/api/characters/${charId}/inventory`);
      setData(res.data);
      setCoins({
        copper: res.data.character.copper,
        silver: res.data.character.silver,
        electrum: res.data.character.electrum,
        gold: res.data.character.gold,
        platinum: res.data.character.platinum,
      });
    } catch (err: any) {
      setError(err.response?.data?.error || "Impossible de charger l'inventaire");
    } finally {
      setLoading(false);
    }
  }, [charId]);

  useEffect(() => {
    load();
  }, [load]);

  // ---------- Debounced catalog search ----------
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(catalogSearch), 300);
    return () => clearTimeout(t);
  }, [catalogSearch]);

  // ---------- Catalog fetch ----------
  const fetchCatalog = useCallback(
    async (offset: number, append: boolean) => {
      setCatalogLoading(true);
      setCatalogError('');
      try {
        const params: Record<string, string | number> = { limit: CATALOG_PAGE_SIZE, offset };
        if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
        if (catalogCategory) params.category = catalogCategory;
        if (catalogRarity) params.rarity = catalogRarity;
        const res = await api.get<{ items: Item[]; total: number; limit: number; offset: number }>(
          '/api/items',
          { params },
        );
        setCatalogItems((prev) => (append ? [...prev, ...res.data.items] : res.data.items));
        setCatalogTotal(res.data.total);
        setCatalogOffset(offset);
      } catch (err: any) {
        setCatalogError(err.response?.data?.error || 'Erreur lors de la recherche');
      } finally {
        setCatalogLoading(false);
      }
    },
    [debouncedSearch, catalogCategory, catalogRarity],
  );

  // Re-fetch (from offset 0) when filters/search change
  useEffect(() => {
    fetchCatalog(0, false);
  }, [fetchCatalog]);

  // ---------- Mutations ----------

  const withBusy = async (entryId: number, fn: () => Promise<void>) => {
    setBusyEntryIds((prev) => {
      const next = new Set(prev);
      next.add(entryId);
      return next;
    });
    try {
      await fn();
    } finally {
      setBusyEntryIds((prev) => {
        const next = new Set(prev);
        next.delete(entryId);
        return next;
      });
    }
  };

  const refreshInventory = useCallback(async () => {
    if (!charId) return;
    try {
      const res = await api.get<CharacterInventory>(`/api/characters/${charId}/inventory`);
      setData(res.data);
    } catch {
      // keep stale data; main error banner already handled on initial load
    }
  }, [charId]);

  // Stepper: -1 (deletes at 0), +1
  const stepQuantity = async (entry: InventoryEntry, delta: number) => {
    const next = entry.quantity + delta;
    await withBusy(entry.id, async () => {
      try {
        if (next <= 0) {
          await api.delete(`/api/inventory/${entry.id}`);
        } else {
          await api.patch(`/api/inventory/${entry.id}`, { quantity: next });
        }
        await refreshInventory();
      } catch (err: any) {
        setError(err.response?.data?.error || 'Erreur de mise à jour');
      }
    });
  };

  const setQuantity = async (entry: InventoryEntry, raw: number) => {
    const qty = Math.max(0, Math.floor(Number.isFinite(raw) ? raw : 0));
    await withBusy(entry.id, async () => {
      try {
        if (qty <= 0) {
          await api.delete(`/api/inventory/${entry.id}`);
        } else {
          await api.patch(`/api/inventory/${entry.id}`, { quantity: qty });
        }
        await refreshInventory();
      } catch (err: any) {
        setError(err.response?.data?.error || 'Erreur de mise à jour');
      }
    });
  };

  const toggleEquipped = async (entry: InventoryEntry) => {
    await withBusy(entry.id, async () => {
      try {
        await api.patch(`/api/inventory/${entry.id}`, { equipped: !entry.equipped });
        await refreshInventory();
      } catch (err: any) {
        setError(err.response?.data?.error || 'Erreur de mise à jour');
      }
    });
  };

  const deleteEntry = async (entry: InventoryEntry) => {
    await withBusy(entry.id, async () => {
      try {
        await api.delete(`/api/inventory/${entry.id}`);
        if (expandedId === entry.id) setExpandedId(null);
        await refreshInventory();
      } catch (err: any) {
        setError(err.response?.data?.error || 'Erreur de suppression');
      }
    });
  };

  const addFromCatalog = async (item: Item) => {
    setAddingItemId(item.id);
    try {
      await api.post(`/api/characters/${charId}/inventory`, { itemId: item.id, quantity: 1 });
      await refreshInventory();
    } catch (err: any) {
      setError(err.response?.data?.error || "Impossible d'ajouter l'objet");
    } finally {
      setAddingItemId(null);
    }
  };

  const saveCoins = async () => {
    setSavingCoins(true);
    try {
      await api.patch(`/api/characters/${charId}`, coins);
      await refreshInventory();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur lors de la sauvegarde');
    } finally {
      setSavingCoins(false);
    }
  };

  const dismissError = () => setError('');

  // ---------- Render guards ----------
  if (loading) return <LoadingSpinner label="Chargement du sac à dos…" />;
  if (error && !data) return <ErrorMsg message={error} />;
  if (!data) return <ErrorMsg message="Personnage introuvable" />;

  const { character, entries, encumbrance } = data;

  // Sort: equipped first, then alphabetical by name (prefer nameFr)
  const sortedEntries = [...entries].sort((a, b) => {
    if (a.equipped !== b.equipped) return a.equipped ? -1 : 1;
    const na = (a.item.nameFr || a.item.name).toLowerCase();
    const nb = (b.item.nameFr || b.item.name).toLowerCase();
    return na.localeCompare(nb);
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Back link */}
      <Link to={`/party/${partyId}`} className="inline-flex items-center text-sm text-ink-500 hover:text-blood-600">
        ← Retour au groupe
      </Link>

      {/* Top: sticky character header + encumbrance */}
      <div className="sticky top-0 z-30 -mx-4 px-4 pt-2 pb-3 bg-parchment-50/90 backdrop-blur sm:static sm:mx-0 sm:px-0 sm:bg-transparent sm:backdrop-blur-none">
        <div className="card p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h1 className="font-display text-xl sm:text-2xl font-bold truncate">{character.name}</h1>
              <p className="text-sm text-ink-500">
                {[character.race, character.className, `Niv. ${character.level}`].filter(Boolean).join(' · ') || '—'}
              </p>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-1 bg-parchment-100 px-2.5 py-1 rounded-lg">
                <span>💪</span>
                <span className="font-semibold">FOR {character.strength}</span>
              </span>
              <span className="inline-flex items-center gap-1 bg-parchment-100 px-2.5 py-1 rounded-lg">
                <span>❤️</span>
                <span className="font-semibold">{character.currentHp}/{character.maxHp} PV</span>
              </span>
            </div>
          </div>
          <div className="mt-3">
            <EncumbranceBar encumbrance={encumbrance} />
          </div>
        </div>
      </div>

      {/* Global error toast (non-blocking) */}
      {error && (
        <div className="flex items-start justify-between gap-3">
          <ErrorMsg message={error} />
          <button onClick={dismissError} className="btn-ghost text-sm shrink-0">✕</button>
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        {/* ---------- LEFT: current inventory ---------- */}
        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <h2 className="font-display text-lg font-semibold">
              Sac à dos <span className="text-ink-400 text-sm font-normal">({entries.length})</span>
            </h2>
          </div>

          {sortedEntries.length === 0 ? (
            <div className="card p-4">
              <EmptyState
                icon="🎒"
                title="Sac à dos vide"
                hint="Cherchez un objet dans le catalogue à droite pour commencer."
              />
            </div>
          ) : (
            <ul className="space-y-2">
              {sortedEntries.map((entry) => (
                <InventoryRow
                  key={entry.id}
                  entry={entry}
                  busy={busyEntryIds.has(entry.id)}
                  expanded={expandedId === entry.id}
                  onToggleExpand={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                  onStep={(d) => stepQuantity(entry, d)}
                  onSetQuantity={(n) => setQuantity(entry, n)}
                  onToggleEquipped={() => toggleEquipped(entry)}
                  onDelete={() => deleteEntry(entry)}
                  onTransfer={() => setTransferEntry(entry)}
                  charId={Number(charId)}
                  partyId={partyId}
                />
              ))}
            </ul>
          )}
        </section>

        {/* ---------- RIGHT: catalog search ---------- */}
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold">Catalogue</h2>

          <div className="card p-3 sm:p-4 space-y-3">
            <input
              type="search"
              className="input"
              placeholder="🔎 Rechercher un objet…"
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                className="input"
                value={catalogCategory}
                onChange={(e) => setCatalogCategory(e.target.value as '' | ItemCategory)}
              >
                {CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <select
                className="input"
                value={catalogRarity}
                onChange={(e) => setCatalogRarity(e.target.value as '' | Rarity)}
              >
                {RARITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {catalogError && <ErrorMsg message={catalogError} />}

          {catalogItems.length === 0 && !catalogLoading ? (
            <div className="card p-4">
              <EmptyState icon="🔍" title="Aucun objet trouvé" hint="Modifiez votre recherche ou vos filtres." />
            </div>
          ) : (
            <>
              <p className="text-xs text-ink-400 px-1">{catalogTotal} objet(s)</p>
              <ul className="space-y-2">
                {catalogItems.map((item) => (
                  <li key={item.id} className="card p-3 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{item.nameFr || item.name}</span>
                        <CategoryBadge category={item.category} />
                        {item.rarity !== 'none' && <RarityBadge rarity={item.rarity} />}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-ink-500">
                        <WeightBadge weightKg={item.weightKg} />
                        <CostBadge qty={item.costQty} unit={item.costUnit} />
                      </div>
                    </div>
                    <button
                      onClick={() => addFromCatalog(item)}
                      disabled={addingItemId === item.id}
                      className="btn-primary text-sm px-3 py-2 shrink-0"
                      aria-label={`Ajouter ${item.nameFr || item.name}`}
                    >
                      {addingItemId === item.id ? '…' : '+ Ajouter'}
                    </button>
                  </li>
                ))}
              </ul>

              {catalogLoading && <LoadingSpinner label="Recherche…" />}

              {catalogItems.length < catalogTotal && !catalogLoading && (
                <button
                  onClick={() => fetchCatalog(catalogOffset + CATALOG_PAGE_SIZE, true)}
                  className="btn-secondary w-full"
                >
                  Charger plus ({catalogTotal - catalogItems.length} restants)
                </button>
              )}
            </>
          )}
        </section>
      </div>

      {/* ---------- Coin purse (collapsible) ---------- */}
      <section className="card p-4 sm:p-5">
        <button
          onClick={() => setShowCoins((s) => !s)}
          className="w-full flex items-center justify-between"
          aria-expanded={showCoins}
        >
          <h2 className="font-display text-lg font-semibold">
            Bourse <span className="text-ink-400 text-sm font-normal">({totalCopper(coins)} PC totaux)</span>
          </h2>
          <span className="text-ink-400 text-sm">{showCoins ? '▲' : '▼'}</span>
        </button>

        {showCoins && (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {COIN_FIELDS.map(({ key, unit, icon }) => (
                <label key={key} className="block">
                  <span className="label">
                    {icon} {COIN_LABELS_FR[unit]}
                  </span>
                  <input
                    type="number"
                    min={0}
                    className="input"
                    value={coins[key]}
                    onChange={(e) => setCoins((c) => ({ ...c, [key]: Math.max(0, Number(e.target.value) || 0) }))}
                  />
                </label>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={saveCoins} disabled={savingCoins} className="btn-primary">
                {savingCoins ? 'Sauvegarde…' : 'Enregistrer la bourse'}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ---------- Transfer modal ---------- */}
      <TransferModal
        open={transferEntry !== null}
        entry={transferEntry}
        charId={Number(charId)}
        partyId={partyId}
        onClose={() => setTransferEntry(null)}
        onTransferred={async () => {
          setTransferEntry(null);
          await refreshInventory();
        }}
        onError={(msg) => setError(msg)}
      />
    </div>
  );
}

// ---------- Helpers ----------

function totalCopper(c: { copper: number; silver: number; electrum: number; gold: number; platinum: number }): number {
  return c.copper + c.silver * 10 + c.electrum * 50 + c.gold * 100 + c.platinum * 1000;
}

// ---------- Inventory row ----------

interface InventoryRowProps {
  entry: InventoryEntry;
  busy: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onStep: (delta: number) => void;
  onSetQuantity: (n: number) => void;
  onToggleEquipped: () => void;
  onDelete: () => void;
  onTransfer: () => void;
  charId: number;
  partyId?: string;
}

function InventoryRow({
  entry,
  busy,
  expanded,
  onToggleExpand,
  onStep,
  onSetQuantity,
  onToggleEquipped,
  onDelete,
  onTransfer,
}: InventoryRowProps) {
  const { item, quantity } = entry;
  const totalWeight = item.weightKg !== null ? item.weightKg * quantity : null;
  const hasDescription = !!item.description;
  const qtyInputRef = useRef<HTMLInputElement>(null);

  // The input is uncontrolled-ish: we reflect the live quantity but let the
  // user type freely; commit happens on blur/Enter.
  const [draftQty, setDraftQty] = useState<string>(String(quantity));
  useEffect(() => {
    setDraftQty(String(quantity));
  }, [quantity]);

  const commitDraft = () => {
    const parsed = Number(draftQty);
    if (!Number.isFinite(parsed)) {
      setDraftQty(String(quantity));
      return;
    }
    const next = Math.floor(parsed);
    if (next !== quantity) onSetQuantity(next);
    else setDraftQty(String(quantity));
  };

  return (
    <li className={`card overflow-hidden ${entry.equipped ? 'ring-1 ring-blood-500/30' : ''}`}>
      <div className="p-3 sm:p-4">
        <div className="flex items-start gap-3">
          {/* Equipped toggle */}
          <label className="flex flex-col items-center justify-center shrink-0 mt-0.5 cursor-pointer" title={entry.equipped ? 'Équipé' : 'Non équipé'}>
            <input
              type="checkbox"
              className="w-5 h-5 accent-blood-600"
              checked={entry.equipped}
              onChange={onToggleEquipped}
              disabled={busy}
            />
            <span className="text-[10px] text-ink-400 mt-1">équipé</span>
          </label>

          {/* Main content (click to expand) */}
          <button
            type="button"
            onClick={hasDescription ? onToggleExpand : undefined}
            className="min-w-0 flex-1 text-left"
            aria-expanded={expanded}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{item.nameFr || item.name}</span>
              <CategoryBadge category={item.category} />
              {item.rarity !== 'none' && <RarityBadge rarity={item.rarity} />}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-ink-500">
              <WeightBadge weightKg={item.weightKg} />
              {totalWeight !== null && quantity > 1 && (
                <span className="text-ink-400">× {quantity} = {totalWeight.toFixed(2)} kg</span>
              )}
              {hasDescription && (
                <span className="text-ink-400">{expanded ? '▲ détails' : '▼ détails'}</span>
              )}
            </div>
          </button>

          {/* Quantity stepper */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onStep(-1)}
              disabled={busy}
              className="w-8 h-8 rounded-lg bg-parchment-200 hover:bg-parchment-300 disabled:opacity-50 text-lg leading-none flex items-center justify-center"
              aria-label="Diminuer la quantité"
            >
              −
            </button>
            <input
              ref={qtyInputRef}
              type="number"
              min={0}
              className="w-12 text-center input !py-1 !px-1"
              value={draftQty}
              disabled={busy}
              onChange={(e) => setDraftQty(e.target.value)}
              onBlur={commitDraft}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
              aria-label="Quantité"
            />
            <button
              onClick={() => onStep(1)}
              disabled={busy}
              className="w-8 h-8 rounded-lg bg-parchment-200 hover:bg-parchment-300 disabled:opacity-50 text-lg leading-none flex items-center justify-center"
              aria-label="Augmenter la quantité"
            >
              +
            </button>
          </div>
        </div>

        {/* Actions row */}
        <div className="flex items-center justify-end gap-1 mt-2 -mr-1">
          <button onClick={onTransfer} disabled={busy} className="btn-ghost text-sm" title="Transférer">
            ↗ Transférer
          </button>
          <button onClick={onDelete} disabled={busy} className="btn-ghost text-sm text-red-600 hover:bg-red-50" title="Supprimer">
            🗑
          </button>
        </div>
      </div>

      {/* Expanded description */}
      {expanded && hasDescription && (
        <div className="px-4 pb-4 -mt-1">
          <div className="border-t border-parchment-200 pt-3 text-sm text-ink-700 whitespace-pre-line">
            {item.description}
          </div>
          {item.damageDice && (
            <p className="mt-2 text-xs text-ink-500">
              ⚔️ Dégâts : {item.damageDice}{item.damageType ? ` ({item.damageType})` : ''}
            </p>
          )}
          {item.acBase !== null && (
            <p className="mt-1 text-xs text-ink-500">🛡 CA de base : {item.acBase}</p>
          )}
          {item.strMin !== null && (
            <p className="mt-1 text-xs text-ink-500">💪 Force min. : {item.strMin}</p>
          )}
          {item.stealthDisadvantage && (
            <p className="mt-1 text-xs text-ink-500">🤫 Désavantage de Discrétion</p>
          )}
          {item.properties && item.properties.length > 0 && (
            <p className="mt-1 text-xs text-ink-500">Propriétés : {item.properties.join(', ')}</p>
          )}
          {entry.notes && (
            <p className="mt-2 text-xs text-ink-500 italic">Note : {entry.notes}</p>
          )}
        </div>
      )}
    </li>
  );
}

// ---------- Transfer modal ----------

interface TransferModalProps {
  open: boolean;
  entry: InventoryEntry | null;
  charId: number;
  partyId?: string;
  onClose: () => void;
  onTransferred: () => void | Promise<void>;
  onError: (msg: string) => void;
}

function TransferModal({ open, entry, charId, partyId, onClose, onTransferred, onError }: TransferModalProps) {
  const [party, setParty] = useState<PartyDetail | null>(null);
  const [loadingParty, setLoadingParty] = useState(false);
  const [targetId, setTargetId] = useState<number | null>(null);
  const [qty, setQty] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Load party members/characters when modal opens
  useEffect(() => {
    if (!open || !partyId) return;
    let cancelled = false;
    setLoadingParty(true);
    api
      .get<PartyDetail>(`/api/parties/${partyId}`)
      .then((res) => {
        if (!cancelled) setParty(res.data);
      })
      .catch((err: any) => {
        if (!cancelled) onError(err.response?.data?.error || 'Groupe introuvable');
      })
      .finally(() => {
        if (!cancelled) setLoadingParty(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, partyId, onError]);

  // Reset selections each time a different entry opens
  useEffect(() => {
    if (open && entry) {
      setQty(entry.quantity);
      setTargetId(null);
    }
  }, [open, entry]);

  if (!entry) return null;

  const others: CharacterSummary[] = party ? party.characters.filter((c) => c.id !== charId) : [];
  const maxQty = entry.quantity;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetId) return;
    const transferQty = Math.max(1, Math.min(qty, maxQty));
    setSubmitting(true);
    try {
      await api.post(`/api/characters/${charId}/transfer`, {
        toCharacterId: targetId,
        inventoryId: entry.id,
        quantity: transferQty,
      });
      await onTransferred();
    } catch (err: any) {
      onError(err.response?.data?.error || 'Échec du transfert');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Transférer — ${entry.item.nameFr || entry.item.name}`}>
      {loadingParty ? (
        <LoadingSpinner label="Chargement du groupe…" />
      ) : others.length === 0 ? (
        <EmptyState icon="👤" title="Aucun autre personnage" hint="Aucun destinataire dans ce groupe." />
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Destinataire</label>
            <select
              className="input"
              value={targetId ?? ''}
              onChange={(e) => setTargetId(e.target.value === '' ? null : Number(e.target.value))}
              required
            >
              <option value="">— Choisir —</option>
              {others.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {[c.race, c.className, `Niv. ${c.level}`].filter(Boolean).join(' · ')}
                  ({c.ownerName})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Quantité (max {maxQty})</label>
            <input
              type="number"
              min={1}
              max={maxQty}
              className="input"
              value={qty}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <button type="submit" disabled={!targetId || submitting} className="btn-primary w-full">
            {submitting ? 'Transfert…' : 'Transférer'}
          </button>
        </form>
      )}
    </Modal>
  );
}
