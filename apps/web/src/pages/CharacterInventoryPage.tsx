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
import {
  CATEGORY_LABELS_FR,
  RARITY_LABELS_FR,
  COIN_LABELS_FR,
} from '@dnd-inventory/shared';
import {
  LoadingSpinner,
  ErrorMsg,
  EmptyState,
  Modal,
  BottomSheet,
  RarityBadge,
  CategoryBadge,
  WeightBadge,
  CostBadge,
  EncumbranceBar,
  ToastStack,
  type Toast,
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

// Coin fields with distinct CSS-colored glyphs instead of identical emoji
const COIN_FIELDS: { key: keyof Pick<Character, 'copper' | 'silver' | 'electrum' | 'gold' | 'platinum'>; unit: 'cp' | 'sp' | 'ep' | 'gp' | 'pp'; color: string }[] = [
  { key: 'copper', unit: 'cp', color: '#b87333' },    // copper
  { key: 'silver', unit: 'sp', color: '#c0c0c0' },    // silver
  { key: 'electrum', unit: 'ep', color: '#a89968' },  // electrum (pale gold-silver)
  { key: 'gold', unit: 'gp', color: '#d4af37' },      // gold
  { key: 'platinum', unit: 'pp', color: '#e5e4e2' },  // platinum (white-silver)
];

const CATALOG_PAGE_SIZE = 30;

// ---------- Main component ----------

export default function CharacterInventoryPage() {
  const { partyId, charId } = useParams<{ partyId: string; charId: string }>();

  // Inventory / character state
  const [data, setData] = useState<CharacterInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Toast system
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  const pushToast = useCallback((message: string, kind: 'success' | 'error' = 'success') => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev, { id, message, kind }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2500);
  }, []);
  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Row highlight (flash newly added/changed rows)
  const [flashEntryId, setFlashEntryId] = useState<number | null>(null);

  // Per-entry optimistic in-flight flags
  const [busyEntryIds, setBusyEntryIds] = useState<Set<number>>(new Set());

  // Expanded entries (show description + actions)
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Confirm-delete state (per entry)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const confirmDeleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Coin purse (auto-save on blur)
  const [coins, setCoins] = useState({ copper: 0, silver: 0, electrum: 0, gold: 0, platinum: 0 });
  const [coinsDirty, setCoinsDirty] = useState(false);

  // Catalog (in bottom-sheet on mobile, right column on desktop)
  const [catalogOpen, setCatalogOpen] = useState(false); // mobile sheet
  const [catalogSearch, setCatalogSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [catalogCategory, setCatalogCategory] = useState<'' | ItemCategory>('');
  const [catalogRarity, setCatalogRarity] = useState<'' | Rarity>('');
  const [catalogItems, setCatalogItems] = useState<Item[]>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogOffset, setCatalogOffset] = useState(0);
  const [addingItemId, setAddingItemId] = useState<number | null>(null);

  // Transfer modal
  const [transferEntry, setTransferEntry] = useState<InventoryEntry | null>(null);

  // First-run tour
  const [showTour, setShowTour] = useState(false);
  useEffect(() => {
    const seen = localStorage.getItem('dnd-inv-tour-seen');
    if (!seen && !loading) {
      const t = setTimeout(() => setShowTour(true), 800);
      return () => clearTimeout(t);
    }
  }, [loading]);
  const dismissTour = () => {
    setShowTour(false);
    localStorage.setItem('dnd-inv-tour-seen', '1');
  };

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
      } catch {
        // silent — catalog is best-effort
      } finally {
        setCatalogLoading(false);
      }
    },
    [debouncedSearch, catalogCategory, catalogRarity],
  );

  useEffect(() => {
    fetchCatalog(0, false);
  }, [fetchCatalog]);

  // ---------- Mutations ----------

  const withBusy = async (entryId: number, fn: () => Promise<void>) => {
    setBusyEntryIds((prev) => new Set(prev).add(entryId));
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

  const refreshInventory = useCallback(async (flashId?: number) => {
    if (!charId) return;
    try {
      const res = await api.get<CharacterInventory>(`/api/characters/${charId}/inventory`);
      setData(res.data);
      if (flashId !== undefined) {
        setFlashEntryId(flashId);
        setTimeout(() => setFlashEntryId(null), 1200);
      }
    } catch {
      // keep stale data
    }
  }, [charId]);

  // Stepper: -1 / +1. At 0, enter confirm-delete state instead of silent delete.
  const stepQuantity = async (entry: InventoryEntry, delta: number) => {
    const next = entry.quantity + delta;
    if (next <= 0) {
      // Enter confirm-delete state instead of silent deletion
      setConfirmDeleteId(entry.id);
      // Auto-revert after 4 seconds
      if (confirmDeleteTimer.current) clearTimeout(confirmDeleteTimer.current);
      confirmDeleteTimer.current = setTimeout(() => setConfirmDeleteId(null), 4000);
      return;
    }
    await withBusy(entry.id, async () => {
      try {
        await api.patch(`/api/inventory/${entry.id}`, { quantity: next });
        await refreshInventory(entry.id);
      } catch (err: any) {
        pushToast(err.response?.data?.error || 'Erreur de mise à jour', 'error');
      }
    });
  };

  const setQuantity = async (entry: InventoryEntry, raw: number) => {
    const qty = Math.max(0, Math.floor(Number.isFinite(raw) ? raw : 0));
    if (qty <= 0) {
      setConfirmDeleteId(entry.id);
      if (confirmDeleteTimer.current) clearTimeout(confirmDeleteTimer.current);
      confirmDeleteTimer.current = setTimeout(() => setConfirmDeleteId(null), 4000);
      return;
    }
    await withBusy(entry.id, async () => {
      try {
        await api.patch(`/api/inventory/${entry.id}`, { quantity: qty });
        await refreshInventory(entry.id);
      } catch (err: any) {
        pushToast(err.response?.data?.error || 'Erreur', 'error');
      }
    });
  };

  const confirmDelete = async (entry: InventoryEntry) => {
    setConfirmDeleteId(null);
    if (confirmDeleteTimer.current) clearTimeout(confirmDeleteTimer.current);
    await withBusy(entry.id, async () => {
      try {
        await api.delete(`/api/inventory/${entry.id}`);
        if (expandedId === entry.id) setExpandedId(null);
        await refreshInventory();
        pushToast(`${entry.item.nameFr || entry.item.name} retiré du sac à dos`);
      } catch (err: any) {
        pushToast(err.response?.data?.error || 'Erreur de suppression', 'error');
      }
    });
  };

  const cancelDelete = (entryId: number) => {
    setConfirmDeleteId(null);
    if (confirmDeleteTimer.current) clearTimeout(confirmDeleteTimer.current);
  };

  const toggleEquipped = async (entry: InventoryEntry) => {
    await withBusy(entry.id, async () => {
      try {
        await api.patch(`/api/inventory/${entry.id}`, { equipped: !entry.equipped });
        await refreshInventory(entry.id);
      } catch (err: any) {
        pushToast(err.response?.data?.error || 'Erreur', 'error');
      }
    });
  };

  const addFromCatalog = async (item: Item) => {
    setAddingItemId(item.id);
    try {
      await api.post(`/api/characters/${charId}/inventory`, { itemId: item.id, quantity: 1 });
      await refreshInventory();
      pushToast(`+1 ${item.nameFr || item.name} ajouté au sac à dos`);
    } catch (err: any) {
      pushToast(err.response?.data?.error || "Impossible d'ajouter l'objet", 'error');
    } finally {
      setAddingItemId(null);
    }
  };

  // Coin purse: auto-save on blur when dirty
  const saveCoins = useCallback(async () => {
    if (!coinsDirty) return;
    try {
      await api.patch(`/api/characters/${charId}`, coins);
      setCoinsDirty(false);
      pushToast('Bourse mise à jour');
    } catch (err: any) {
      pushToast(err.response?.data?.error || 'Erreur de sauvegarde', 'error');
    }
  }, [charId, coins, coinsDirty, pushToast]);

  const dismissError = () => setError('');

  // ---------- Render guards ----------
  if (loading) return <LoadingSpinner label="Chargement du sac à dos…" />;
  if (error && !data) return <ErrorMsg message={error} />;
  if (!data) return <ErrorMsg message="Personnage introuvable" />;

  const { character, entries, encumbrance } = data;

  // Group entries by category for collapsible sections
  const grouped = groupByCategory(entries);

  // Catalog content (shared between desktop column and mobile bottom-sheet)
  const catalogContent = (
    <CatalogSearch
      search={catalogSearch}
      setSearch={setCatalogSearch}
      category={catalogCategory}
      setCategory={setCatalogCategory}
      rarity={catalogRarity}
      setRarity={setCatalogRarity}
      items={catalogItems}
      total={catalogTotal}
      loading={catalogLoading}
      addingItemId={addingItemId}
      offset={catalogOffset}
      onAdd={addFromCatalog}
      onLoadMore={() => fetchCatalog(catalogOffset + CATALOG_PAGE_SIZE, true)}
    />
  );

  return (
    <div className="space-y-4">
      {/* Back link */}
      <Link
        to={`/party/${partyId}`}
        className="inline-flex items-center text-sm text-ink-500 hover:text-blood-600"
      >
        ← Retour au groupe
      </Link>

      {/* Sticky character header + encumbrance — offset below nav on mobile */}
      <div className="sticky top-14 z-20 -mx-4 px-4 pt-2 pb-3 bg-parchment-50/95 backdrop-blur sm:static sm:top-0 sm:mx-0 sm:px-0 sm:bg-transparent sm:backdrop-blur-none sm:z-auto">
        <div className="card p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h1 className="font-display text-xl sm:text-2xl font-bold truncate">{character.name}</h1>
              <p className="text-sm text-ink-500">
                {[character.race, character.className, `Niv. ${character.level}`].filter(Boolean).join(' · ') || '—'}
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1.5 bg-parchment-100 px-2.5 py-1 rounded-lg">
                <span aria-hidden="true">💪</span>
                <span className="font-semibold">FOR {character.strength}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 bg-parchment-100 px-2.5 py-1 rounded-lg">
                <span aria-hidden="true">❤️</span>
                <span className="font-semibold">{character.currentHp}/{character.maxHp} PV</span>
              </span>
            </div>
          </div>
          <div className="mt-3">
            <EncumbranceBar encumbrance={encumbrance} />
          </div>
        </div>
      </div>

      {/* Error toast (non-blocking) */}
      {error && (
        <div className="flex items-start justify-between gap-3">
          <ErrorMsg message={error} />
          <button onClick={dismissError} className="btn-ghost text-sm shrink-0" aria-label="Fermer l'erreur">✕</button>
        </div>
      )}

      {/* First-run tour hint */}
      {showTour && entries.length === 0 && (
        <div className="card p-4 border-blood-200 bg-blood-50/50">
          <div className="flex items-start gap-3">
            <span className="text-2xl shrink-0" aria-hidden="true">🎲</span>
            <div className="flex-1">
              <p className="font-medium text-ink-900">Bienvenue !</p>
              <p className="text-sm text-ink-700 mt-1">
                Appuyez sur le bouton <strong>+ Ajouter</strong> en bas de l'écran pour chercher un objet dans le catalogue,
                puis suivez la barre de poids pour voir si votre personnage est encombré.
              </p>
              <button onClick={dismissTour} className="btn-primary text-sm mt-2 px-3 py-1.5">
                Compris
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Two-column layout: backpack (3fr) + catalog (2fr) on desktop */}
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        {/* ---------- LEFT: inventory grouped by category ---------- */}
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold">
            Sac à dos <span className="text-ink-400 text-sm font-normal">({entries.length})</span>
          </h2>

          {entries.length === 0 ? (
            <div className="card p-4">
              <EmptyState
                icon="🎒"
                title="Sac à dos vide"
                hint="Appuyez sur + Ajouter pour chercher un objet."
              />
            </div>
          ) : (
            <div className="space-y-3">
              {grouped.map((group) => (
                <CategoryGroup
                  key={group.category}
                  category={group.category}
                  entries={group.entries}
                  busyEntryIds={busyEntryIds}
                  expandedId={expandedId}
                  flashEntryId={flashEntryId}
                  confirmDeleteId={confirmDeleteId}
                  onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
                  onStep={stepQuantity}
                  onSetQuantity={setQuantity}
                  onToggleEquipped={toggleEquipped}
                  onConfirmDelete={confirmDelete}
                  onCancelDelete={cancelDelete}
                  onTransfer={(entry) => setTransferEntry(entry)}
                />
              ))}
            </div>
          )}
        </section>

        {/* ---------- RIGHT: catalog (desktop only — mobile uses FAB + bottom sheet) ---------- */}
        <section className="hidden lg:block space-y-3">
          <h2 className="font-display text-lg font-semibold">Catalogue</h2>
          {catalogContent}
        </section>
      </div>

      {/* ---------- Coin purse (auto-save on blur) ---------- */}
      <section className="card p-4 sm:p-5">
        <CoinPurse
          coins={coins}
          onChange={(key, val) => {
            setCoins((c) => ({ ...c, [key]: Math.max(0, val) }));
            setCoinsDirty(true);
          }}
          onBlur={saveCoins}
        />
      </section>

      {/* ---------- Mobile FAB: open catalog as bottom sheet ---------- */}
      <button
        onClick={() => setCatalogOpen(true)}
        className="lg:hidden fab-enter fixed bottom-5 right-5 z-30 w-14 h-14 rounded-full bg-blood-600 text-white shadow-lg flex items-center justify-center text-2xl font-light hover:bg-blood-700 active:scale-95 transition-all"
        aria-label="Ajouter un objet au catalogue"
      >
        +
      </button>

      {/* ---------- Mobile catalog bottom sheet ---------- */}
      <BottomSheet open={catalogOpen} onClose={() => setCatalogOpen(false)} title="Catalogue">
        {catalogContent}
      </BottomSheet>

      {/* ---------- Transfer modal ---------- */}
      <TransferModal
        open={transferEntry !== null}
        entry={transferEntry}
        charId={Number(charId)}
        partyId={partyId}
        onClose={() => setTransferEntry(null)}
        onTransferred={async (itemName: string) => {
          setTransferEntry(null);
          await refreshInventory();
          pushToast(`${itemName} transféré`);
        }}
        onError={(msg) => pushToast(msg, 'error')}
      />

      {/* ---------- Toast stack ---------- */}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

// ---------- Category grouping ----------

interface CategoryGroupData {
  category: ItemCategory;
  entries: InventoryEntry[];
}

function groupByCategory(entries: InventoryEntry[]): CategoryGroupData[] {
  const map = new Map<ItemCategory, InventoryEntry[]>();
  for (const e of entries) {
    const cat = e.item.category;
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(e);
  }
  // Sort groups: equipped items float within their category
  const result: CategoryGroupData[] = [];
  for (const [category, items] of map) {
    items.sort((a, b) => {
      if (a.equipped !== b.equipped) return a.equipped ? -1 : 1;
      const na = (a.item.nameFr || a.item.name).toLowerCase();
      const nb = (b.item.nameFr || b.item.name).toLowerCase();
      return na.localeCompare(nb);
    });
    result.push({ category, entries: items });
  }
  // Sort categories in display order
  const order: ItemCategory[] = ['weapon', 'armor', 'ammunition', 'gear', 'tool', 'mount', 'magic', 'custom'];
  result.sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
  return result;
}

// ---------- Category group (collapsible) ----------

interface CategoryGroupProps {
  category: ItemCategory;
  entries: InventoryEntry[];
  busyEntryIds: Set<number>;
  expandedId: number | null;
  flashEntryId: number | null;
  confirmDeleteId: number | null;
  onToggleExpand: (id: number) => void;
  onStep: (entry: InventoryEntry, delta: number) => void;
  onSetQuantity: (entry: InventoryEntry, n: number) => void;
  onToggleEquipped: (entry: InventoryEntry) => void;
  onConfirmDelete: (entry: InventoryEntry) => void;
  onCancelDelete: (id: number) => void;
  onTransfer: (entry: InventoryEntry) => void;
}

function CategoryGroup({
  category,
  entries,
  busyEntryIds,
  expandedId,
  flashEntryId,
  confirmDeleteId,
  onToggleExpand,
  onStep,
  onSetQuantity,
  onToggleEquipped,
  onConfirmDelete,
  onCancelDelete,
  onTransfer,
}: CategoryGroupProps) {
  const [collapsed, setCollapsed] = useState(false);
  const totalWeight = entries.reduce((sum, e) => {
    const w = e.item.weightKg;
    return sum + (typeof w === 'number' ? w * e.quantity : 0);
  }, 0);

  return (
    <div>
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between mb-1.5 px-1"
        aria-expanded={!collapsed}
      >
        <span className="flex items-center gap-2">
          <span className="text-xs text-ink-400 w-4">{collapsed ? '▶' : '▼'}</span>
          <span className="font-display text-sm font-semibold text-ink-700">
            {CATEGORY_LABELS_FR[category]}
          </span>
          <span className="text-xs text-ink-400">({entries.length})</span>
        </span>
        <span className="text-xs text-ink-400">{totalWeight.toFixed(1)} kg</span>
      </button>
      {!collapsed && (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <InventoryRow
              key={entry.id}
              entry={entry}
              busy={busyEntryIds.has(entry.id)}
              expanded={expandedId === entry.id}
              flashed={flashEntryId === entry.id}
              confirmingDelete={confirmDeleteId === entry.id}
              onToggleExpand={() => onToggleExpand(entry.id)}
              onStep={(d) => onStep(entry, d)}
              onSetQuantity={(n) => onSetQuantity(entry, n)}
              onToggleEquipped={() => onToggleEquipped(entry)}
              onConfirmDelete={() => onConfirmDelete(entry)}
              onCancelDelete={() => onCancelDelete(entry.id)}
              onTransfer={() => onTransfer(entry)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- Inventory row ----------

interface InventoryRowProps {
  entry: InventoryEntry;
  busy: boolean;
  expanded: boolean;
  flashed: boolean;
  confirmingDelete: boolean;
  onToggleExpand: () => void;
  onStep: (delta: number) => void;
  onSetQuantity: (n: number) => void;
  onToggleEquipped: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onTransfer: () => void;
}

function InventoryRow({
  entry,
  busy,
  expanded,
  flashed,
  confirmingDelete,
  onToggleExpand,
  onStep,
  onSetQuantity,
  onToggleEquipped,
  onConfirmDelete,
  onCancelDelete,
  onTransfer,
}: InventoryRowProps) {
  const { item, quantity } = entry;
  const totalWeight = item.weightKg !== null ? item.weightKg * quantity : null;
  const hasDetails = !!item.description || item.damageDice || item.acBase !== null ||
    item.strMin !== null || item.stealthDisadvantage ||
    (item.properties && item.properties.length > 0) || !!entry.notes;
  const itemName = item.nameFr || item.name;

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
    <li
      className={`card overflow-hidden ${flashed ? 'row-flash' : ''} ${
        entry.equipped ? 'ring-1 ring-blood-500/30' : ''
      } ${confirmingDelete ? 'ring-2 ring-red-500 pulse-warn' : ''}`}
    >
      <div className="p-3 sm:p-4">
        {/* Confirm-delete state */}
        {confirmingDelete ? (
          <div className="flex items-center justify-between gap-3 py-1">
            <span className="text-sm font-medium text-red-700">Retirer {itemName} ?</span>
            <div className="flex gap-2">
              <button onClick={onCancelDelete} className="btn-ghost text-sm">
                Annuler
              </button>
              <button onClick={onConfirmDelete} className="btn-primary text-sm bg-red-600 hover:bg-red-700">
                Retirer
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3">
              {/* Equipped accent stripe + checkbox (accessible label includes item name) */}
              <label
                className="flex flex-col items-center justify-center shrink-0 mt-0.5 cursor-pointer"
                title={entry.equipped ? 'Équipé' : 'Non équipé'}
              >
                <input
                  type="checkbox"
                  className="w-5 h-5 accent-blood-600"
                  checked={entry.equipped}
                  onChange={onToggleEquipped}
                  disabled={busy}
                  aria-label={`${entry.equipped ? 'Déséquiper' : 'Équiper'} ${itemName}`}
                />
              </label>

              {/* Main content — click to expand details */}
              <button
                type="button"
                onClick={hasDetails ? onToggleExpand : undefined}
                className="min-w-0 flex-1 text-left"
                aria-expanded={expanded}
                aria-label={`${itemName}, ${quantity} exemplaire${quantity > 1 ? 's' : ''}`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium truncate">{itemName}</span>
                  {item.rarity !== 'none' && <RarityBadge rarity={item.rarity} />}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-ink-500">
                  <WeightBadge weightKg={item.weightKg} />
                  {totalWeight !== null && quantity > 1 && (
                    <span className="text-ink-400">× {quantity} = {totalWeight.toFixed(1)} kg</span>
                  )}
                  {hasDetails && (
                    <span className="text-ink-400">{expanded ? '▲' : '▼'}</span>
                  )}
                </div>
              </button>

              {/* Quantity stepper */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => onStep(-1)}
                  disabled={busy}
                  className="w-9 h-9 rounded-xl bg-parchment-200 hover:bg-parchment-300 disabled:opacity-50 text-lg leading-none flex items-center justify-center transition-colors"
                  aria-label={`Diminuer ${itemName}`}
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  className="w-12 text-center input !py-1 !px-1"
                  value={draftQty}
                  disabled={busy}
                  onChange={(e) => setDraftQty(e.target.value)}
                  onBlur={commitDraft}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                  aria-label={`Quantité de ${itemName}`}
                />
                <button
                  onClick={() => onStep(1)}
                  disabled={busy}
                  className="w-9 h-9 rounded-xl bg-parchment-200 hover:bg-parchment-300 disabled:opacity-50 text-lg leading-none flex items-center justify-center transition-colors"
                  aria-label={`Augmenter ${itemName}`}
                >
                  +
                </button>
              </div>
            </div>

            {/* Expanded: details + secondary actions (progressive disclosure) */}
            {expanded && hasDetails && (
              <div className="mt-3 border-t border-parchment-200 pt-3 space-y-2">
                {item.description && (
                  <p className="text-sm text-ink-700 whitespace-pre-line">{item.description}</p>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
                  {item.damageDice && (
                    <span>⚔ Dégâts : {item.damageDice}{item.damageType ? ` (${item.damageType})` : ''}</span>
                  )}
                  {item.acBase !== null && <span>🛡 CA : {item.acBase}</span>}
                  {item.strMin !== null && <span>💪 FOR min. : {item.strMin}</span>}
                  {item.stealthDisadvantage && <span>🤫 Désavantage Discrétion</span>}
                  {item.properties && item.properties.length > 0 && (
                    <span>Propriétés : {item.properties.join(', ')}</span>
                  )}
                </div>
                {entry.notes && (
                  <p className="text-xs text-ink-500 italic">Note : {entry.notes}</p>
                )}
                {/* Secondary actions live here, not on the main row */}
                <div className="flex items-center gap-2 pt-1">
                  <button onClick={onTransfer} disabled={busy} className="btn-ghost text-sm">
                    ↗ Transférer
                  </button>
                  <button
                    onClick={() => onStep(-1)}
                    disabled={busy}
                    className="btn-ghost text-sm text-red-600 hover:bg-red-50"
                    aria-label={`Retirer ${itemName}`}
                  >
                    Retirer du sac
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </li>
  );
}

// ---------- Catalog search component ----------

interface CatalogSearchProps {
  search: string;
  setSearch: (s: string) => void;
  category: '' | ItemCategory;
  setCategory: (c: '' | ItemCategory) => void;
  rarity: '' | Rarity;
  setRarity: (r: '' | Rarity) => void;
  items: Item[];
  total: number;
  loading: boolean;
  addingItemId: number | null;
  offset: number;
  onAdd: (item: Item) => void;
  onLoadMore: () => void;
}

function CatalogSearch({
  search,
  setSearch,
  category,
  setCategory,
  rarity,
  setRarity,
  items,
  total,
  loading,
  addingItemId,
  offset,
  onAdd,
  onLoadMore,
}: CatalogSearchProps) {
  return (
    <div className="space-y-3">
      <div className="card p-3 space-y-3">
        <input
          type="search"
          className="input"
          placeholder="Rechercher un objet…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Rechercher dans le catalogue"
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            className="input"
            value={category}
            onChange={(e) => setCategory(e.target.value as '' | ItemCategory)}
            aria-label="Filtrer par catégorie"
          >
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            className="input"
            value={rarity}
            onChange={(e) => setRarity(e.target.value as '' | Rarity)}
            aria-label="Filtrer par rareté"
          >
            {RARITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {items.length === 0 && !loading ? (
        <div className="card p-4">
          <EmptyState icon="🔍" title="Aucun objet trouvé" hint="Modifiez votre recherche ou vos filtres." />
        </div>
      ) : (
        <>
          <p className="text-xs text-ink-400 px-1">{total} objet(s)</p>
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id} className="card p-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{item.nameFr || item.name}</span>
                    {item.rarity !== 'none' && <RarityBadge rarity={item.rarity} />}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-ink-500">
                    <WeightBadge weightKg={item.weightKg} />
                    <CostBadge qty={item.costQty} unit={item.costUnit} />
                    <CategoryBadge category={item.category} />
                  </div>
                </div>
                <button
                  onClick={() => onAdd(item)}
                  disabled={addingItemId === item.id}
                  className="btn-primary text-sm px-3 py-2 shrink-0"
                  aria-label={`Ajouter ${item.nameFr || item.name}`}
                >
                  {addingItemId === item.id ? '…' : '+ Ajouter'}
                </button>
              </li>
            ))}
          </ul>

          {loading && <LoadingSpinner label="Recherche…" />}

          {offset + items.length < total && !loading && (
            <button onClick={onLoadMore} className="btn-secondary w-full">
              Charger plus ({total - offset - items.length} restants)
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ---------- Coin purse (auto-save, distinct colored glyphs) ----------

function CoinPurse({
  coins,
  onChange,
  onBlur,
}: {
  coins: { copper: number; silver: number; electrum: number; gold: number; platinum: number };
  onChange: (key: keyof typeof coins, val: number) => void;
  onBlur: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const totalCp = coins.copper + coins.silver * 10 + coins.electrum * 50 + coins.gold * 100 + coins.platinum * 1000;
  const totalGp = Math.floor(totalCp / 100);
  const remCp = totalCp % 100;

  return (
    <div>
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between"
        aria-expanded={expanded}
      >
        <h2 className="font-display text-lg font-semibold">
          Bourse{' '}
          <span className="text-ink-400 text-sm font-normal">
            ({totalGp} PO{remCp > 0 ? ` ${remCp} PC` : ''})
          </span>
        </h2>
        <span className="text-ink-400 text-sm">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="mt-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {COIN_FIELDS.map(({ key, unit, color }) => (
              <label key={key} className="block">
                <span className="label flex items-center gap-1.5">
                  <span
                    className="inline-block w-3 h-3 rounded-full border border-parchment-300 shrink-0"
                    style={{ backgroundColor: color }}
                    aria-hidden="true"
                  />
                  {COIN_LABELS_FR[unit]}
                </span>
                <input
                  type="number"
                  min={0}
                  className="input"
                  value={coins[key]}
                  onChange={(e) => onChange(key, Number(e.target.value) || 0)}
                  onBlur={onBlur}
                  aria-label={`Quantité de ${COIN_LABELS_FR[unit]}`}
                />
              </label>
            ))}
          </div>
          <p className="text-xs text-ink-400 mt-3">Sauvegarde automatique.</p>
        </div>
      )}
    </div>
  );
}

// ---------- Transfer modal ----------

interface TransferModalProps {
  open: boolean;
  entry: InventoryEntry | null;
  charId: number;
  partyId?: string;
  onClose: () => void;
  onTransferred: (itemName: string) => void | Promise<void>;
  onError: (msg: string) => void;
}

function TransferModal({ open, entry, charId, partyId, onClose, onTransferred, onError }: TransferModalProps) {
  const [party, setParty] = useState<PartyDetail | null>(null);
  const [loadingParty, setLoadingParty] = useState(false);
  const [targetId, setTargetId] = useState<number | null>(null);
  const [qty, setQty] = useState(1);
  const [submitting, setSubmitting] = useState(false);

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

  useEffect(() => {
    if (open && entry) {
      setQty(entry.quantity);
      setTargetId(null);
    }
  }, [open, entry]);

  if (!entry) return null;

  const others: CharacterSummary[] = party ? party.characters.filter((c) => c.id !== charId) : [];
  const maxQty = entry.quantity;
  const itemName = entry.item.nameFr || entry.item.name;

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
      await onTransferred(itemName);
    } catch (err: any) {
      onError(err.response?.data?.error || 'Échec du transfert');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Transférer — ${itemName}`}>
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
