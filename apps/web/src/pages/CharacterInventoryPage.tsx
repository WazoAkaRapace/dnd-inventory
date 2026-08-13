import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api';
import { useSyncEvent, useSync } from '../sync';
import type {
  CharacterInventory,
  InventoryEntry,
  Item,
  ItemCategory,
  Rarity,
  Character,
  CharacterSummary,
  PartyDetail,
  StorageLocation,
  StorageType,
  LocationWeight,
} from '@dnd-inventory/shared';
import {
  CATEGORY_LABELS_FR,
  RARITY_LABELS_FR,
  COIN_LABELS_FR,
  DND_CONDITIONS_FR,
} from '@dnd-inventory/shared';
import CharacterStatsTab from './CharacterStatsTab';
import CharacterSkillsTab from './CharacterSkillsTab';
import CharacterSpellsTab from './CharacterSpellsTab';
import CharacterFeaturesTab from './CharacterFeaturesTab';
import CharacterDescriptionTab from './CharacterDescriptionTab';
import NpcPage from './NpcPage';
import CharacterNotesTab from './CharacterNotesTab';

type CharacterTab = 'inventory' | 'stats' | 'spells' | 'skills' | 'features' | 'description' | 'npcs' | 'notes';
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

// ---------- Icons ----------

function SettingsIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M11.49 3.17a.75.75 0 0 0-1.48 0l-.13 1.02a6.5 6.5 0 0 0-1.4.57l-.82-.62a.75.75 0 0 0-.98.06l-.7.7a.75.75 0 0 0-.06.98l.62.82a6.5 6.5 0 0 0-.57 1.4l-1.02.13a.75.75 0 0 0 0 1.48l1.02.13c.14.49.33.96.57 1.4l-.62.82a.75.75 0 0 0 .06.98l.7.7c.28.28.72.31 1.04.06l.76-.57c.44.24.91.43 1.4.57l.13 1.02a.75.75 0 0 0 1.48 0l.13-1.02c.49-.14.96-.33 1.4-.57l.76.57c.32.25.76.22 1.04-.06l.7-.7a.75.75 0 0 0 .06-.98l-.62-.82c.24-.44.43-.91.57-1.4l1.02-.13a.75.75 0 0 0 0-1.48l-1.02-.13a6.5 6.5 0 0 0-.57-1.4l.62-.82a.75.75 0 0 0-.06-.98l-.7-.7a.75.75 0 0 0-.98-.06l-.82.62a6.5 6.5 0 0 0-1.4-.57l-.13-1.02ZM10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
    </svg>
  );
}

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

// ---------- Storage location helpers ----------

const LOCATION_TYPE_ICON: Record<StorageType, string> = {
  carried: '🧍',
  mount: '🐴',
  container: '📦',
};

/** Find the carried location (there should always be exactly one). */
function findCarriedLocation(locations: StorageLocation[]): StorageLocation | undefined {
  return locations.find((l) => l.type === 'carried');
}

// ---------- Main component ----------

export default function CharacterInventoryPage() {
  const { partyId, charId } = useParams<{ partyId: string; charId: string }>();

  // Inventory / character state
  const [data, setData] = useState<CharacterInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Editable strength
  const [strengthDraft, setStrengthDraft] = useState('10');
  // Editable capacity multiplier
  const [multDraft, setMultDraft] = useState('1');
  const [showMultHelp, setShowMultHelp] = useState(false);
  const [showCarryModal, setShowCarryModal] = useState(false);

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

  // Storage locations: active tab + new-transport modal
  const [activeLocationId, setActiveLocationId] = useState<number | null>(null);
  const [showNewLocationModal, setShowNewLocationModal] = useState(false);
  // Confirm-delete location (per location id)
  const [confirmDeleteLocationId, setConfirmDeleteLocationId] = useState<number | null>(null);

  // First-run tour
  const [showTour, setShowTour] = useState(false);

  // Active tab (inventory / stats / spells / skills)
  const [activeTab, setActiveTab] = useState<CharacterTab>('inventory');
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
      setStrengthDraft(String(res.data.character.strength));
      setMultDraft(String(res.data.character.capacityMultiplier ?? 1));
      // Default the active tab to the carried location
      setActiveLocationId((prev) => {
        const stillExists = prev !== null && res.data.locations.some((l) => l.id === prev);
        if (stillExists) return prev;
        const carried = findCarriedLocation(res.data.locations);
        return carried ? carried.id : (res.data.locations[0]?.id ?? null);
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

  // ---------- Real-time sync: auto-refetch when another client changes this character's data ----------
  const { markLocalMutation } = useSync();
  const currentCharId = Number(charId);
  const currentPartyId = Number(partyId);

  useSyncEvent((event) => {
    // Only react to events for this character or this party
    if (event.partyId !== currentPartyId) return;
    if (event.type === 'inventory:change') {
      // If it involves this character (either as source or transfer target)
      if (event.characterId === currentCharId || event.toCharacterId === currentCharId) {
        refreshInventory();
        // Notify on incoming transfer
        if (event.action === 'transfer' && event.toCharacterId === currentCharId && event.itemName) {
          pushToast(`Objet reçu : ${event.itemName}`);
        }
      }
    } else if (event.type === 'character:change') {
      if (event.characterId === currentCharId) {
        refreshInventory();
      }
    }
  }, [currentCharId, currentPartyId]);

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

  // Only fetch when there's a search query or active filters — don't show all 599 items
  const hasQuery = !!(debouncedSearch.trim() || catalogCategory || catalogRarity);

  useEffect(() => {
    if (hasQuery) {
      fetchCatalog(0, false);
    } else {
      setCatalogItems([]);
      setCatalogTotal(0);
    }
  }, [fetchCatalog, hasQuery]);

  // ---------- Mutations ----------

  const withBusy = async (entryId: number, fn: () => Promise<void>) => {
    markLocalMutation(); // Mark as local mutation so sync echo is skipped
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
      // Sync coin state from server (covers both local and remote mutations)
      setCoins({
        copper: res.data.character.copper,
        silver: res.data.character.silver,
        electrum: res.data.character.electrum,
        gold: res.data.character.gold,
        platinum: res.data.character.platinum,
      });
      // Update active tab if the active location was deleted (fall back to carried)
      setActiveLocationId((prev) => {
        const stillExists = prev !== null && res.data.locations.some((l) => l.id === prev);
        if (stillExists) return prev;
        const carried = findCarriedLocation(res.data.locations);
        return carried ? carried.id : (res.data.locations[0]?.id ?? null);
      });
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
    markLocalMutation();
    setAddingItemId(item.id);
    try {
      await api.post(`/api/characters/${charId}/inventory`, {
        itemId: item.id,
        quantity: 1,
        // Send the carried location id as null (carried), non-carried as its id
        storageLocationId: activeLocationId,
      });
      await refreshInventory();
      pushToast(`+1 ${item.nameFr || item.name} ajouté au sac à dos`);
    } catch (err: any) {
      pushToast(err.response?.data?.error || "Impossible d'ajouter l'objet", 'error');
    } finally {
      setAddingItemId(null);
    }
  };

  // ---------- Storage location mutations ----------

  const createLocation = async (payload: {
    name: string;
    type: StorageType;
    strength?: number;
    multiplier?: number;
    capacityKg?: number;
    ownWeightKg?: number;
  }) => {
    markLocalMutation();
    try {
      const res = await api.post<{ location: StorageLocation }>(
        `/api/characters/${charId}/locations`,
        payload,
      );
      await refreshInventory();
      // Auto-select the newly created tab
      setActiveLocationId(res.data.location.id);
      pushToast(`Transport ajouté : ${payload.name}`);
      setShowNewLocationModal(false);
    } catch (err: any) {
      pushToast(err.response?.data?.error || "Impossible d'ajouter le transport", 'error');
    }
  };

  const deleteLocation = async (location: StorageLocation) => {
    markLocalMutation();
    setConfirmDeleteLocationId(null);
    try {
      await api.delete(`/api/locations/${location.id}`);
      // Fall back to carried tab before the refresh recomputes active id
      const carried = findCarriedLocation(data?.locations ?? []);
      if (carried) setActiveLocationId(carried.id);
      await refreshInventory();
      pushToast(`${location.name} supprimé — objets replacés sur le personnage`);
    } catch (err: any) {
      pushToast(err.response?.data?.error || 'Erreur de suppression', 'error');
    }
  };

  const moveEntryToLocation = async (entry: InventoryEntry, locationId: number) => {
    await withBusy(entry.id, async () => {
      try {
        await api.patch(`/api/inventory/${entry.id}`, { storageLocationId: locationId });
        await refreshInventory(entry.id);
        const target = data?.locations.find((l) => l.id === locationId);
        pushToast(`${entry.item.nameFr || entry.item.name} déplacé vers ${target?.name ?? 'l\'emplacement'}`);
      } catch (err: any) {
        pushToast(err.response?.data?.error || 'Erreur lors du déplacement', 'error');
      }
    });
  };

  // Coin purse: auto-save on blur when dirty
  const saveCoins = useCallback(async () => {
    if (!coinsDirty) return;
    markLocalMutation();
    try {
      await api.patch(`/api/characters/${charId}`, coins);
      setCoinsDirty(false);
      await refreshInventory();
      pushToast('Bourse mise à jour');
    } catch (err: any) {
      pushToast(err.response?.data?.error || 'Erreur de sauvegarde', 'error');
    }
  }, [charId, coins, coinsDirty, pushToast, refreshInventory]);

  // Commit strength change on blur
  const commitStrength = async () => {
    const parsed = Number(strengthDraft);
    if (!Number.isFinite(parsed) || parsed < 1) {
      setStrengthDraft(String(data?.character.strength || 10));
      return;
    }
    const newStr = Math.floor(parsed);
    if (newStr === data?.character.strength) return; // no change
    markLocalMutation();
    try {
      await api.patch(`/api/characters/${charId}`, { strength: newStr });
      await refreshInventory();
      pushToast(`Force mise à jour : ${newStr}`);
    } catch (err: any) {
      pushToast(err.response?.data?.error || 'Erreur', 'error');
      setStrengthDraft(String(data?.character.strength || 10));
    }
  };

  // Commit capacity multiplier change on blur
  const commitMult = async () => {
    const parsed = Number(multDraft);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setMultDraft(String(data?.character.capacityMultiplier ?? 1));
      return;
    }
    const newMult = Math.round(parsed * 100) / 100;
    if (newMult === data?.character.capacityMultiplier) return;
    markLocalMutation();
    try {
      await api.patch(`/api/characters/${charId}`, { capacityMultiplier: newMult });
      await refreshInventory();
      pushToast(`Capacité de portage mise à jour : ×${newMult}`);
    } catch (err: any) {
      pushToast(err.response?.data?.error || 'Erreur', 'error');
      setMultDraft(String(data?.character.capacityMultiplier ?? 1));
    }
  };

  const dismissError = () => setError('');

  // ---------- Render guards ----------
  if (loading) return <LoadingSpinner label="Chargement du sac à dos…" />;
  if (error && !data) return <ErrorMsg message={error} />;
  if (!data) return <ErrorMsg message="Personnage introuvable" />;

  const { character, encumbrance, locations, locationWeights } = data;

  // Resolve the active location (fall back to carried, then first)
  const activeLocation: StorageLocation | undefined =
    locations.find((l) => l.id === activeLocationId) ??
    findCarriedLocation(locations) ??
    locations[0];
  const activeLocationResolvedId = activeLocation?.id ?? null;
  const isActiveCarried = activeLocation?.type === 'carried';

  // Filter entries to the active location (each entry has a storageLocationId)
  const entries = data.entries.filter(
    (e) => e.storageLocationId === activeLocationResolvedId,
  );

  // Active location's weight info (for the per-location bar)
  const activeLocationWeight: LocationWeight | undefined = locationWeights.find(
    (lw) => lw.locationId === activeLocationResolvedId,
  );

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
      {/* Sticky character header + encumbrance — offset below nav on mobile */}
      <div className="sticky top-14 z-20 -mx-4 px-4 pt-2 pb-3 bg-parchment-50/95 backdrop-blur sm:static sm:top-0 sm:mx-0 sm:px-0 sm:bg-transparent sm:backdrop-blur-none sm:z-auto">
        <div className="card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-display text-xl sm:text-2xl font-bold truncate flex items-center gap-2">
              {character.name}
              <button
                onClick={() => setShowCarryModal(true)}
                className="text-ink-400 hover:text-blood-600 transition-colors"
                aria-label="Force et portage"
                title="Force et portage"
              >
                <SettingsIcon className="w-5 h-5" />
              </button>
            </h1>
          </div>
          <div className="mt-3">
            <EncumbranceBar encumbrance={encumbrance} />
          </div>
        </div>
      </div>

      {/* ---------- Force & portage modal ---------- */}
      <Modal open={showCarryModal} onClose={() => setShowCarryModal(false)} title="Force & portage">
        <div className="space-y-4">
          {/* Editable Strength */}
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-ink-700">Force (FOR)</span>
            <input
              type="number"
              min={1}
              max={30}
              className="w-20 text-center text-sm font-semibold bg-white border border-parchment-300 rounded-md py-1.5 focus:outline-none focus:border-blood-500"
              value={strengthDraft}
              onChange={(e) => setStrengthDraft(e.target.value)}
              onBlur={commitStrength}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              aria-label="Force"
            />
          </label>

          {/* Editable capacity multiplier */}
          <div>
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-ink-700">Multiplicateur de portage</span>
              <span className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  step={0.5}
                  className="w-20 text-center text-sm font-semibold bg-white border border-parchment-300 rounded-md py-1.5 focus:outline-none focus:border-blood-500"
                  value={multDraft}
                  onChange={(e) => setMultDraft(e.target.value)}
                  onBlur={commitMult}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  aria-label="Multiplicateur de capacité de portage"
                />
                <button
                  onClick={() => setShowMultHelp(s => !s)}
                  className="text-ink-400 hover:text-blood-600 text-sm w-6 h-6 flex items-center justify-center rounded-full hover:bg-parchment-100"
                  aria-label="Aide sur le multiplicateur de portage"
                  title="Aide"
                >?</button>
              </span>
            </label>
            {showMultHelp && (
              <div className="mt-2 text-xs text-ink-600 bg-parchment-100 rounded-lg p-3 space-y-1.5">
                <p><strong>×1 (défaut)</strong> : créature de taille M sans capacité spéciale.</p>
                <p><strong>×2</strong> : Construction massive (Goliath, Firbolg, Demi-Orc, Bugbear, Orc, Loxodon) ou créature de taille G. Le personnage compte comme une catégorie de taille supérieure pour le calcul du poids transportable.</p>
                <p><strong>×3</strong> : Créature de taille TG.</p>
                <p><strong>×4</strong> : Créature de taille Gig.</p>
                <p className="text-ink-400">Ce multiplicateur s'applique aux trois paliers (encombré, lourdement encombré, max). Modifiez-le si votre personnage a un trait qui augmente sa capacité de portage.</p>
              </div>
            )}
          </div>

          {/* Encumbrance recap inside the modal */}
          <div className="pt-2 border-t border-parchment-200">
            <EncumbranceBar encumbrance={encumbrance} />
          </div>
        </div>
      </Modal>

      {/* ---------- Tab navigation ---------- */}
      <div className="sticky top-14 z-20 -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex items-center gap-1 bg-parchment-100 rounded-xl p-1 overflow-x-auto no-scrollbar">
          {([
            { key: 'inventory', label: 'Inventaire', icon: '🎒' },
            { key: 'stats', label: 'Caractéristiques', icon: '⚔️' },
            { key: 'skills', label: 'Compétences', icon: '🎯' },
            { key: 'spells', label: 'Sorts', icon: '✨' },
            { key: 'features', label: 'Traits', icon: '📋' },
            { key: 'description', label: 'Description', icon: '👤' },
            { key: 'npcs', label: 'PNJ', icon: '🎭' },
            { key: 'notes', label: 'Notes', icon: '📝' },
          ] as { key: CharacterTab; label: string; icon: string }[]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? 'bg-blood-600 text-white shadow-sm'
                  : 'text-ink-900 hover:bg-parchment-200'
              }`}
              aria-pressed={activeTab === tab.key}
            >
              <span aria-hidden="true">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ---------- Non-inventory tabs (rendered when selected) ---------- */}
      {activeTab === 'stats' && (
        <CharacterStatsTab
          character={character}
          charId={Number(charId)}
          onSaved={refreshInventory}
          onError={(msg) => pushToast(msg, 'error')}
        />
      )}
      {activeTab === 'skills' && (
        <CharacterSkillsTab
          character={character}
          charId={Number(charId)}
          onSaved={refreshInventory}
          onError={(msg) => pushToast(msg, 'error')}
        />
      )}
      {activeTab === 'spells' && (
        <CharacterSpellsTab
          character={character}
          charId={Number(charId)}
          onSaved={refreshInventory}
          onError={(msg) => pushToast(msg, 'error')}
        />
      )}
      {activeTab === 'features' && (
        <CharacterFeaturesTab
          character={character}
          charId={Number(charId)}
          partyId={partyId}
          onSaved={refreshInventory}
          onError={(msg) => pushToast(msg, 'error')}
        />
      )}
      {activeTab === 'description' && (
        <CharacterDescriptionTab
          character={character}
          charId={Number(charId)}
          onSaved={refreshInventory}
          onError={(msg) => pushToast(msg, 'error')}
        />
      )}
      {activeTab === 'npcs' && (
        <NpcPage embedded />
      )}
      {activeTab === 'notes' && (
        <CharacterNotesTab
          character={character}
          charId={Number(charId)}
          partyId={partyId}
          onSaved={refreshInventory}
          onError={(msg) => pushToast(msg, 'error')}
        />
      )}

      {/* ---------- Inventory tab content ---------- */}
      {activeTab === 'inventory' && (
        <>
      {/* ---------- Survival panel: exhaustion, conditions, deprivation ---------- */}
      <SurvivalPanel
        character={character}
        charId={Number(charId)}
        entries={entries}
        markLocalMutation={markLocalMutation}
        onSaved={refreshInventory}
        onError={(msg) => pushToast(msg, 'error')}
      />

      {/* ---------- Storage location tabs ---------- */}
      <div className="-mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {locations.map((loc) => {
            const isActive = loc.id === activeLocationResolvedId;
            const lw = locationWeights.find((w) => w.locationId === loc.id);
            const pct = lw ? Math.round(lw.pct) : 0;
            const isConfirming = confirmDeleteLocationId === loc.id;
            return (
              <div key={loc.id} className="flex items-center shrink-0">
                <button
                  onClick={() => setActiveLocationId(loc.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-blood-600 text-white'
                      : 'bg-parchment-200 text-ink-700 hover:bg-parchment-300'
                  }`}
                  aria-pressed={isActive}
                >
                  <span aria-hidden="true">{LOCATION_TYPE_ICON[loc.type]}</span>
                  <span>{loc.name}</span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded-full ${
                      isActive ? 'bg-white/25' : 'bg-parchment-100 text-ink-500'
                    }`}
                  >
                    {pct}%
                  </span>
                </button>
                {/* Delete button for non-carried locations */}
                {loc.type !== 'carried' && isActive && (
                  <button
                    onClick={() => {
                      if (isConfirming) {
                        deleteLocation(loc);
                      } else {
                        setConfirmDeleteLocationId(loc.id);
                        setTimeout(() => setConfirmDeleteLocationId(null), 4000);
                      }
                    }}
                    onBlur={() => setConfirmDeleteLocationId(null)}
                    className={`ml-1 w-7 h-7 rounded-full flex items-center justify-center text-sm transition-colors ${
                      isConfirming
                        ? 'bg-red-600 text-white hover:bg-red-700'
                        : 'bg-parchment-200 text-ink-500 hover:bg-red-100 hover:text-red-600'
                    }`}
                    aria-label={isConfirming ? `Confirmer la suppression de ${loc.name}` : `Supprimer ${loc.name}`}
                    title={isConfirming ? 'Confirmer ?' : 'Supprimer ce transport'}
                  >
                    {isConfirming ? '✓' : '🗑'}
                  </button>
                )}
              </div>
            );
          })}
          {/* Add new transport */}
          <button
            onClick={() => setShowNewLocationModal(true)}
            className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium border border-dashed border-parchment-300 text-ink-500 hover:border-blood-400 hover:text-blood-600 transition-colors"
            aria-label="Ajouter un transport"
            title="Ajouter un transport"
          >
            <span aria-hidden="true">+</span> Transport
          </button>
        </div>

        {/* Per-location weight bar (non-carried only — carried uses the header bar) */}
        {!isActiveCarried && activeLocationWeight && activeLocationWeight.maxCapacityKg !== null && (
          <LocationWeightBar weight={activeLocationWeight} />
        )}
      </div>

      {/* Error toast (non-blocking) */}
      {error && (
        <div className="flex items-start justify-between gap-3">
          <ErrorMsg message={error} />
          <button onClick={dismissError} className="btn-ghost text-ink-500 text-sm shrink-0" aria-label="Fermer l'erreur">✕</button>
        </div>
      )}

      {/* First-run tour hint */}
      {showTour && data.entries.length === 0 && (
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
            {activeLocation ? activeLocation.name : 'Sac à dos'}{' '}
            <span className="text-ink-400 text-sm font-normal">({entries.length})</span>
          </h2>

          {entries.length === 0 ? (
            <div className="card p-4">
              <EmptyState
                icon={isActiveCarried ? '🎒' : LOCATION_TYPE_ICON[activeLocation?.type ?? 'carried']}
                title={isActiveCarried ? 'Sac à dos vide' : 'Aucun objet ici'}
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
                  locations={locations}
                  activeLocationId={activeLocationResolvedId}
                  onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
                  onStep={stepQuantity}
                  onSetQuantity={setQuantity}
                  onToggleEquipped={toggleEquipped}
                  onConfirmDelete={confirmDelete}
                  onCancelDelete={cancelDelete}
                  onTransfer={(entry) => setTransferEntry(entry)}
                  onMoveLocation={moveEntryToLocation}
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
        </>
      )}

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

      {/* ---------- New transport modal ---------- */}
      <NewLocationModal
        open={showNewLocationModal}
        onClose={() => setShowNewLocationModal(false)}
        onCreate={createLocation}
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
  locations: StorageLocation[];
  activeLocationId: number | null;
  onToggleExpand: (id: number) => void;
  onStep: (entry: InventoryEntry, delta: number) => void;
  onSetQuantity: (entry: InventoryEntry, n: number) => void;
  onToggleEquipped: (entry: InventoryEntry) => void;
  onConfirmDelete: (entry: InventoryEntry) => void;
  onCancelDelete: (id: number) => void;
  onTransfer: (entry: InventoryEntry) => void;
  onMoveLocation: (entry: InventoryEntry, locationId: number) => void;
}

function CategoryGroup({
  category,
  entries,
  busyEntryIds,
  expandedId,
  flashEntryId,
  confirmDeleteId,
  locations,
  activeLocationId,
  onToggleExpand,
  onStep,
  onSetQuantity,
  onToggleEquipped,
  onConfirmDelete,
  onCancelDelete,
  onTransfer,
  onMoveLocation,
}: CategoryGroupProps) {
  const [collapsed, setCollapsed] = useState(false);
  const EMPTY_WATERSKIN_KG = 0.268;
  const totalWeight = entries.reduce((sum, e) => {
    const isEmptyWater = !!(e.notes?.includes('empty') && e.item.survivalTags?.includes('water'));
    const base = isEmptyWater ? EMPTY_WATERSKIN_KG : e.item.weightKg;
    return sum + (typeof base === 'number' ? base * e.quantity : 0);
  }, 0);

  return (
    <div>
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between mb-1.5 px-1"
        aria-expanded={!collapsed}
      >
        <span className="flex items-center gap-2">
          <span className={`text-xs text-ink-400 w-4 chevron ${collapsed ? 'is-closed' : 'is-open'}`}>▼</span>
          <span className="font-display text-sm font-semibold text-ink-700">
            {CATEGORY_LABELS_FR[category]}
          </span>
          <span className="text-xs text-ink-400">({entries.length})</span>
        </span>
        <span className="text-xs text-ink-400">{totalWeight.toFixed(1)} kg</span>
      </button>
      <div className={`expand-grid ${collapsed ? 'is-collapsed' : ''}`}>
        <div className="expand-inner">
          <ul className="space-y-2">
            {entries.map((entry) => (
              <InventoryRow
                key={entry.id}
                entry={entry}
                busy={busyEntryIds.has(entry.id)}
                expanded={expandedId === entry.id}
                flashed={flashEntryId === entry.id}
                confirmingDelete={confirmDeleteId === entry.id}
                locations={locations}
                activeLocationId={activeLocationId}
                onToggleExpand={() => onToggleExpand(entry.id)}
                onStep={(d) => onStep(entry, d)}
                onSetQuantity={(n) => onSetQuantity(entry, n)}
                onToggleEquipped={() => onToggleEquipped(entry)}
                onConfirmDelete={() => onConfirmDelete(entry)}
                onCancelDelete={() => onCancelDelete(entry.id)}
                onTransfer={() => onTransfer(entry)}
                onMoveLocation={(locId) => onMoveLocation(entry, locId)}
              />
            ))}
          </ul>
        </div>
      </div>
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
  locations: StorageLocation[];
  activeLocationId: number | null;
  onToggleExpand: () => void;
  onStep: (delta: number) => void;
  onSetQuantity: (n: number) => void;
  onToggleEquipped: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onTransfer: () => void;
  onMoveLocation: (locationId: number) => void;
}

function InventoryRow({
  entry,
  busy,
  expanded,
  flashed,
  confirmingDelete,
  locations,
  activeLocationId,
  onToggleExpand,
  onStep,
  onSetQuantity,
  onToggleEquipped,
  onConfirmDelete,
  onCancelDelete,
  onTransfer,
  onMoveLocation,
}: InventoryRowProps) {
  const { item, quantity } = entry;
  // Empty waterskins weigh only the leather (~0.268 kg), not the full 2.268 kg.
  // The backend applies this override to the encumbrance total; mirror it here so
  // the per-row display stays consistent with the aggregate.
  const EMPTY_WATERSKIN_KG = 0.268;
  const isEmptyWater = !!(entry.notes?.includes('empty') && item.survivalTags?.includes('water'));
  const effectiveWeightKg = isEmptyWater ? EMPTY_WATERSKIN_KG : item.weightKg;
  const totalWeight = effectiveWeightKg !== null ? effectiveWeightKg * quantity : null;
  const hasDetails = !!item.description || item.damageDice || item.acBase !== null ||
    item.strMin !== null || item.stealthDisadvantage ||
    (item.properties && item.properties.length > 0) || !!entry.notes;
  const itemName = item.nameFr || item.name;

  // Locations available to move this item to (everything except the active one)
  const otherLocations = locations.filter((l) => l.id !== activeLocationId);
  const canMove = otherLocations.length > 0;
  // Row is expandable if it has details OR if there's a move action to reveal
  const canExpand = hasDetails || canMove;

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
        entry.equipped ? 'ring-1 ring-gold-400/40' : ''
      } ${confirmingDelete ? 'ring-2 ring-red-500 pulse-warn' : ''}`}
    >
      <div className="p-3 sm:p-4">
        {/* Confirm-delete state */}
        {confirmingDelete ? (
          <div className="flex items-center justify-between gap-3 py-1">
            <span className="text-sm font-medium text-red-700">Retirer {itemName} ?</span>
            <div className="flex gap-2">
              <button onClick={onCancelDelete} className="btn-ghost text-ink-700 text-sm">
                Annuler
              </button>
              <button onClick={onConfirmDelete} className="btn-primary text-sm bg-red-600 hover:bg-red-700">
                Retirer
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Row 1: star toggle + item name (full width on mobile) */}
            <div className="flex items-start gap-2 sm:gap-3">
              {/* Equipped toggle — star icon */}
              <button
                onClick={onToggleEquipped}
                disabled={busy}
                className={`shrink-0 mt-0.5 text-lg leading-none transition-colors ${
                  entry.equipped
                    ? 'text-gold-400'
                    : 'text-ink-400/40 hover:text-ink-400'
                }`}
                aria-label={`${entry.equipped ? 'Déséquiper' : 'Équiper'} ${itemName}`}
                aria-pressed={entry.equipped}
                title={entry.equipped ? 'Équipé' : 'Non équipé'}
              >
                {entry.equipped ? '★' : '☆'}
              </button>

              {/* Main content — click to expand details */}
              <button
                type="button"
                onClick={canExpand ? onToggleExpand : undefined}
                className="min-w-0 flex-1 text-left"
                aria-expanded={expanded}
                aria-label={`${itemName}, ${quantity} exemplaire${quantity > 1 ? 's' : ''}`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium truncate">{itemName}</span>
                  {item.rarity !== 'none' && <RarityBadge rarity={item.rarity} />}
                  {canExpand && (
                    <span className={`text-ink-400 text-xs chevron ${expanded ? 'is-open' : 'is-closed'}`}>▼</span>
                  )}
                </div>
              </button>

              {/* On desktop, stepper stays inline on the right */}
              <div className="hidden sm:flex items-center gap-1 shrink-0">
                <button
                  onClick={() => onStep(-1)}
                  disabled={busy}
                  className="w-8 h-8 rounded-lg bg-parchment-200 hover:bg-parchment-300 disabled:opacity-50 text-sm font-medium flex items-center justify-center transition-colors"
                  aria-label={`Diminuer ${itemName}`}
                >−</button>
                <input
                  type="number" min={1}
                  className="w-10 h-8 text-center text-sm bg-white border border-parchment-300 rounded-md focus:outline-none focus:border-blood-500"
                  value={draftQty}
                  disabled={busy}
                  onChange={(e) => setDraftQty(e.target.value)}
                  onBlur={commitDraft}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  aria-label={`Quantité de ${itemName}`}
                />
                <button
                  onClick={() => onStep(1)}
                  disabled={busy}
                  className="w-8 h-8 rounded-lg bg-parchment-200 hover:bg-parchment-300 disabled:opacity-50 text-sm font-medium flex items-center justify-center transition-colors"
                  aria-label={`Augmenter ${itemName}`}
                >+</button>
              </div>
            </div>

            {/* Row 2 (mobile only): weight info + transfer + stepper side by side */}
            <div className="flex items-center justify-between gap-2 mt-1.5 sm:hidden pl-7">
              <div className="flex items-center gap-2 text-xs text-ink-500 min-w-0">
                <WeightBadge weightKg={effectiveWeightKg} />
                {totalWeight !== null && quantity > 1 && (
                  <span className="text-ink-400">× {quantity} = {totalWeight.toFixed(1)} kg</span>
                )}
                <button onClick={onTransfer} disabled={busy} className="text-ink-400 hover:text-blood-600 text-xs underline" aria-label={`Transférer ${itemName}`}>
                  ↗
                </button>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  onClick={() => onStep(-1)}
                  disabled={busy}
                  className="w-7 h-7 rounded-lg bg-parchment-200 hover:bg-parchment-300 disabled:opacity-50 text-sm font-medium flex items-center justify-center transition-colors"
                  aria-label={`Diminuer ${itemName}`}
                >−</button>
                <input
                  type="number" min={1}
                  className="w-8 h-7 text-center text-sm bg-white border border-parchment-300 rounded-md focus:outline-none focus:border-blood-500"
                  value={draftQty}
                  disabled={busy}
                  onChange={(e) => setDraftQty(e.target.value)}
                  onBlur={commitDraft}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  aria-label={`Quantité de ${itemName}`}
                />
                <button
                  onClick={() => onStep(1)}
                  disabled={busy}
                  className="w-7 h-7 rounded-lg bg-parchment-200 hover:bg-parchment-300 disabled:opacity-50 text-sm font-medium flex items-center justify-center transition-colors"
                  aria-label={`Augmenter ${itemName}`}
                >+</button>
              </div>
            </div>

            {/* Desktop: weight info + transfer stays under the name */}
            <div className="hidden sm:flex items-center gap-3 mt-1 ml-7 text-xs text-ink-500">
              <WeightBadge weightKg={effectiveWeightKg} />
              {totalWeight !== null && quantity > 1 && (
                <span className="text-ink-400">× {quantity} = {totalWeight.toFixed(1)} kg</span>
              )}
              <button onClick={onTransfer} disabled={busy} className="text-ink-400 hover:text-blood-600 underline" aria-label={`Transférer ${itemName}`}>
                ↗ Transférer
              </button>
            </div>

            {/* Expanded: details + secondary actions (progressive disclosure) */}
            {canExpand && (
              <div className={`expand-grid mt-3 ${expanded ? '' : 'is-collapsed'}`}>
                <div className="expand-inner">
                  <div className="border-t border-parchment-200 pt-3 space-y-2">
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
                    {/* Move to another storage location */}
                    {canMove && (
                      <label className="flex items-center gap-2 pt-1 text-sm text-ink-600">
                        <span className="shrink-0">Déplacer vers :</span>
                        <select
                          className="input py-1 text-sm flex-1 min-w-0"
                          value=""
                          disabled={busy}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val !== '') onMoveLocation(Number(val));
                            // Reset so the same target can be re-selected later
                            e.target.value = '';
                          }}
                          aria-label={`Déplacer ${itemName} vers un autre emplacement`}
                        >
                          <option value="" disabled>— Choisir —</option>
                          {otherLocations.map((l) => (
                            <option key={l.id} value={l.id}>
                              {LOCATION_TYPE_ICON[l.type]} {l.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {/* Secondary action: remove (destructive, stays in expanded panel) */}
                    <div className="flex items-center gap-2 pt-1">
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
          {search.trim() || category || rarity ? (
            <EmptyState icon="🔍" title="Aucun objet trouvé" hint="Modifiez votre recherche ou vos filtres." />
          ) : (
            <EmptyState icon="📝" title="Recherchez un objet" hint="Tapez le nom d'un objet pour l'ajouter à votre sac à dos." />
          )}
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
        <span className={`text-ink-400 text-sm chevron ${expanded ? 'is-open' : 'is-closed'}`}>▼</span>
      </button>

      <div className={`expand-grid ${expanded ? '' : 'is-collapsed'}`}>
        <div className="expand-inner">
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
                    value={coins[key] === 0 ? '' : coins[key]}
                    onChange={(e) => onChange(key, e.target.value === '' ? 0 : (Number(e.target.value) || 0))}
                    onBlur={(e) => {
                      if (e.target.value === '' || e.target.value === '0') onChange(key, 0);
                      onBlur();
                    }}
                    aria-label={`Quantité de ${COIN_LABELS_FR[unit]}`}
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>
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
                  {c.name} ({c.ownerName})
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

// ---------- Per-location weight bar (compact) ----------

function LocationWeightBar({ weight }: { weight: LocationWeight }) {
  const { itemsWeightKg, ownWeightKg, maxCapacityKg, pct } = weight;
  if (maxCapacityKg === null) return null;
  const totalWeight = itemsWeightKg + (ownWeightKg || 0);
  const fillClass =
    pct >= 100 ? 'bg-red-500' : pct >= 75 ? 'bg-orange-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-green-500';

  return (
    <div className="mt-2 space-y-1" role="progressbar" aria-valuenow={Math.round(totalWeight * 100) / 100} aria-valuemin={0} aria-valuemax={maxCapacityKg}>
      <div className="flex items-baseline justify-between text-xs text-ink-500">
        <span>
          {totalWeight.toFixed(1)} / {maxCapacityKg.toFixed(1)} kg
        </span>
        <span className="font-medium">{Math.round(pct)}%</span>
      </div>
      <div className="relative h-2 bg-parchment-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${fillClass} transition-all duration-300 rounded-full`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

// ---------- New transport (storage location) modal ----------

interface NewLocationModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: {
    name: string;
    type: StorageType;
    strength?: number;
    multiplier?: number;
    capacityKg?: number;
    ownWeightKg?: number;
  }) => Promise<void>;
}

function NewLocationModal({ open, onClose, onCreate }: NewLocationModalProps) {
  const [type, setType] = useState<StorageType>('mount');
  const [name, setName] = useState('');
  const [strength, setStrength] = useState('10');
  const [multiplier, setMultiplier] = useState('1');
  const [capacityKg, setCapacityKg] = useState('');
  const [ownWeightKg, setOwnWeightKg] = useState('0');
  const [submitting, setSubmitting] = useState(false);

  // Reset fields whenever the modal is (re)opened
  useEffect(() => {
    if (open) {
      setType('mount');
      setName('');
      setStrength('10');
      setMultiplier('1');
      setCapacityKg('');
      setOwnWeightKg('0');
      setSubmitting(false);
    }
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      if (type === 'mount') {
        await onCreate({
          name: trimmed,
          type: 'mount',
          strength: Math.max(1, Math.floor(Number(strength) || 10)),
          multiplier: Math.max(1, Number(multiplier) || 1),
        });
      } else {
        await onCreate({
          name: trimmed,
          type: 'container',
          capacityKg: Math.max(0, Number(capacityKg) || 0),
          ownWeightKg: Math.max(0, Number(ownWeightKg) || 0),
        });
      }
      // onCreate closes the modal on success
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Nouveau transport">
      <form onSubmit={submit} className="space-y-4">
        {/* Type selector — two pills */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setType('mount')}
            className={`px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
              type === 'mount'
                ? 'bg-blood-600 text-white border-blood-600'
                : 'bg-parchment-100 text-ink-700 border-parchment-300 hover:bg-parchment-200'
            }`}
            aria-pressed={type === 'mount'}
          >
            🐴 Monture
          </button>
          <button
            type="button"
            onClick={() => setType('container')}
            className={`px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
              type === 'container'
                ? 'bg-blood-600 text-white border-blood-600'
                : 'bg-parchment-100 text-ink-700 border-parchment-300 hover:bg-parchment-200'
            }`}
            aria-pressed={type === 'container'}
          >
            📦 Conteneur
          </button>
        </div>

        <label className="block">
          <span className="label">Nom</span>
          <input
            type="text"
            className="input"
            placeholder={type === 'mount' ? 'Ex. Mulet, Cheval…' : 'Ex. Sac de voyage, Coffre…'}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            aria-label="Nom du transport"
          />
        </label>

        {type === 'mount' ? (
          <>
            <label className="block">
              <span className="label">Force</span>
              <input
                type="number"
                min={1}
                max={30}
                className="input"
                value={strength}
                onChange={(e) => setStrength(e.target.value)}
                aria-label="Force de la monture"
              />
            </label>
            <label className="block">
              <span className="label">Multiplicateur</span>
              <input
                type="number"
                min={1}
                step={0.5}
                className="input"
                value={multiplier}
                onChange={(e) => setMultiplier(e.target.value)}
                aria-label="Multiplicateur de capacité"
              />
              <span className="text-xs text-ink-400 mt-1 block">
                Bête de somme = 2 (capacité doublée).
              </span>
            </label>
          </>
        ) : (
          <>
            <label className="block">
              <span className="label">Capacité (kg)</span>
              <input
                type="number"
                min={0}
                step={0.1}
                className="input"
                value={capacityKg}
                onChange={(e) => setCapacityKg(e.target.value)}
                placeholder="Ex. 30"
                aria-label="Capacité du conteneur en kg"
              />
            </label>
            <label className="block">
              <span className="label">Poids à vide (kg)</span>
              <input
                type="number"
                min={0}
                step={0.1}
                className="input"
                value={ownWeightKg}
                onChange={(e) => setOwnWeightKg(e.target.value)}
                aria-label="Poids à vide du conteneur en kg"
              />
              <span className="text-xs text-ink-400 mt-1 block">
                Ce poids s'ajoute à ce que porte le personnage.
              </span>
            </label>
          </>
        )}

        <button type="submit" disabled={!name.trim() || submitting} className="btn-primary w-full">
          {submitting ? 'Création…' : 'Créer'}
        </button>
      </form>
    </Modal>
  );
}

// ---------- Survival panel (exhaustion, conditions, deprivation) ----------

/** D&D 5e exhaustion effects, in French. Index 0 = no effect. */
const EXHAUSTION_EFFECTS_FR: string[] = [
  'Aucun effet',
  'Désavantage aux jets de caractéristique',
  'Vitesse réduite de moitié',
  'Désavantage aux attaques et sauvegardes',
  'PV max réduits de moitié',
  'Vitesse réduite à 0',
  'Mort',
];

function exhaustionColor(level: number): string {
  if (level <= 1) return 'text-green-600';
  if (level <= 3) return 'text-yellow-600';
  if (level <= 5) return 'text-orange-600';
  return 'text-red-600';
}

interface SurvivalPanelProps {
  character: Character;
  charId: number;
  entries: InventoryEntry[];
  markLocalMutation: () => void;
  onSaved: () => Promise<void>;
  onError: (msg: string) => void;
}

function SurvivalPanel({ character, charId, entries, markLocalMutation, onSaved, onError }: SurvivalPanelProps) {
  const [exhaustion, setExhaustion] = useState(character.exhaustion);
  const [conditions, setConditions] = useState<string[]>(character.conditions);
  const [foodDays, setFoodDays] = useState(character.foodDays);
  const [waterDays, setWaterDays] = useState(character.waterDays);
  const [survivalCollapsed, setSurvivalCollapsed] = useState(() => {
    try { const v = localStorage.getItem('survivalCollapsed'); return v === null ? true : v === '1'; } catch { return true; }
  });
  const toggleSurvival = () => {
    const next = !survivalCollapsed;
    setSurvivalCollapsed(next);
    try { localStorage.setItem('survivalCollapsed', next ? '1' : '0'); } catch { /* ignore */ }
  };

  // Count available food/water from tagged inventory items
  // Water: skip items marked 'empty' in notes
  const foodCount = entries.reduce((sum, e) => {
    return sum + (e.item.survivalTags?.includes('food') ? e.quantity : 0);
  }, 0);
  const fullWaterCount = entries.reduce((sum, e) => {
    if (!e.item.survivalTags?.includes('water')) return sum;
    if (e.notes && e.notes.includes('empty')) return sum;
    return sum + e.quantity;
  }, 0);
  const emptyWaterCount = entries.reduce((sum, e) => {
    if (!e.item.survivalTags?.includes('water')) return sum;
    if (e.notes && e.notes.includes('empty')) return sum + e.quantity;
    return sum;
  }, 0);

  const consume = async (type: 'food' | 'water') => {
    markLocalMutation();
    try {
      await api.post(`/api/characters/${charId}/consume`, { type });
      await onSaved();
    } catch (err: any) {
      onError(err.response?.data?.error || 'Erreur');
    }
  };

  const refillWater = async () => {
    markLocalMutation();
    try {
      await api.post(`/api/characters/${charId}/refill`);
      await onSaved();
    } catch (err: any) {
      onError(err.response?.data?.error || 'Erreur');
    }
  };

  // Re-sync drafts when the character changes (e.g. remote sync, refresh)
  useEffect(() => {
    setExhaustion(character.exhaustion);
  }, [character.exhaustion]);
  useEffect(() => {
    setConditions(character.conditions);
  }, [character.conditions]);
  useEffect(() => {
    setFoodDays(character.foodDays);
  }, [character.foodDays]);
  useEffect(() => {
    setWaterDays(character.waterDays);
  }, [character.waterDays]);

  const patchCharacter = async (payload: Record<string, unknown>, errorMsg: string) => {
    markLocalMutation();
    try {
      await api.patch(`/api/characters/${charId}`, payload);
      await onSaved();
    } catch (err: any) {
      onError(err.response?.data?.error || errorMsg);
    }
  };

  const setExhaustionLevel = async (level: number) => {
    if (level === exhaustion) return;
    setExhaustion(level);
    await patchCharacter({ exhaustion: level }, 'Erreur de mise à jour');
  };

  const removeCondition = async (cond: string) => {
    const next = conditions.filter((c) => c !== cond);
    setConditions(next);
    await patchCharacter({ conditions: next }, 'Erreur de mise à jour');
  };

  const addCondition = async (cond: string) => {
    if (!cond || conditions.includes(cond)) return;
    const next = [...conditions, cond];
    setConditions(next);
    await patchCharacter({ conditions: next }, 'Erreur de mise à jour');
  };

  const stepDays = async (kind: 'foodDays' | 'waterDays', delta: number) => {
    const next = Math.max(0, (kind === 'foodDays' ? foodDays : waterDays) + delta);
    if (kind === 'foodDays') setFoodDays(next);
    else setWaterDays(next);
    await patchCharacter({ [kind]: next }, 'Erreur de mise à jour');
  };

  return (
    <section className="card p-4 sm:p-5 space-y-4">
      <button
        type="button"
        onClick={toggleSurvival}
        className="w-full flex items-center justify-between -my-1 group"
        aria-expanded={!survivalCollapsed}
        aria-controls="survival-panel-content"
      >
        <h2 className="font-display text-lg font-semibold flex items-center gap-2">
          <span aria-hidden="true">🩸</span> Survie
        </h2>
        <span className={`text-xs text-ink-400 group-hover:text-ink-600 transition-colors chevron ${survivalCollapsed ? 'is-closed' : 'is-open'}`}>
          ▼
        </span>
      </button>

      <div className={`expand-grid ${survivalCollapsed ? 'is-collapsed' : ''}`}>
        <div className="expand-inner">
          <div id="survival-panel-content" className="space-y-4 pt-1">
      {/* Exhaustion tracker */}
      {/* HP tracker */}
      <HpTracker character={character} charId={charId} markLocalMutation={markLocalMutation} onSaved={onSaved} onError={onError} />

      {/* Exhaustion */}
      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-sm font-medium text-ink-700">Épuisement</span>
          <span className={`text-xs font-semibold ${exhaustionColor(exhaustion)}`}>
            Niveau {exhaustion}/6
          </span>
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Niveau d'épuisement">
          {Array.from({ length: 7 }, (_, i) => {
            const active = i <= exhaustion && i > 0;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setExhaustionLevel(i)}
                className={`text-2xl leading-none transition-colors ${exhaustionColor(exhaustion)} ${
                  active ? 'opacity-100' : 'opacity-30 hover:opacity-60'
                }`}
                aria-pressed={i === exhaustion}
                aria-label={`Niveau d'épuisement ${i}`}
                title={`Niveau ${i}${i > 0 ? ` — ${EXHAUSTION_EFFECTS_FR[i]}` : ' — Aucun effet'}`}
              >
                {active ? '◆' : '◇'}
              </button>
            );
          })}
        </div>
        {exhaustion > 0 && (
          <p className="text-xs text-ink-500 mt-1">
            {EXHAUSTION_EFFECTS_FR[exhaustion]}
          </p>
        )}
      </div>

      {/* Conditions */}
      <div>
        <span className="text-sm font-medium text-ink-700 block mb-1.5">États</span>
        <div className="flex flex-wrap items-center gap-2">
          {conditions.length === 0 && (
            <span className="text-xs text-ink-400 italic">Aucun état actif</span>
          )}
          {conditions.map((cond) => (
            <span
              key={cond}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blood-50 text-blood-800 text-xs font-medium border border-blood-200"
            >
              {cond}
              <button
                type="button"
                onClick={() => removeCondition(cond)}
                className="text-blood-500 hover:text-blood-700 font-semibold"
                aria-label={`Retirer l'état ${cond}`}
              >
                ×
              </button>
            </span>
          ))}
          <label className="inline-flex items-center">
            <span className="sr-only">Ajouter un état</span>
            <select
              className="input py-1 text-xs w-auto"
              value=""
              onChange={(e) => {
                const v = e.target.value;
                if (v) addCondition(v);
                e.target.value = '';
              }}
              aria-label="Ajouter un état"
            >
              <option value="">+ Ajouter un état…</option>
              {DND_CONDITIONS_FR.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Deprivation + consume from inventory */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <DeprivationBox
            label="Sans nourriture"
            days={foodDays}
            icon="🍖"
            onStep={(d) => stepDays('foodDays', d)}
          />
          {foodCount > 0 && (
            <button
              onClick={() => consume('food')}
              className="text-xs px-2 py-1 rounded-lg bg-green-100 text-green-800 hover:bg-green-200 transition-colors"
            >
              🍖 Manger (×{foodCount} rations)
            </button>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <DeprivationBox
            label="Sans eau"
            days={waterDays}
            icon="💧"
            onStep={(d) => stepDays('waterDays', d)}
          />
          {fullWaterCount > 0 && (
            <button
              onClick={() => consume('water')}
              className="text-xs px-2 py-1 rounded-lg bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors"
            >
              💧 Boire (×{fullWaterCount} pleines)
            </button>
          )}
          {emptyWaterCount > 0 && (
            <button
              onClick={refillWater}
              className="text-xs px-2 py-1 rounded-lg bg-cyan-100 text-cyan-800 hover:bg-cyan-200 transition-colors"
            >
              ↻ Remplir (×{emptyWaterCount} vides)
            </button>
          )}
        </div>
      </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HpTracker({ character, charId, markLocalMutation, onSaved, onError }: {
  character: Character;
  charId: number;
  markLocalMutation: () => void;
  onSaved: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [maxHp, setMaxHp] = useState(character.maxHp);
  const [currentHp, setCurrentHp] = useState(character.currentHp);
  const [tempHp, setTempHp] = useState(character.tempHp);

  useEffect(() => { setMaxHp(character.maxHp); }, [character.maxHp]);
  useEffect(() => { setCurrentHp(character.currentHp); }, [character.currentHp]);
  useEffect(() => { setTempHp(character.tempHp); }, [character.tempHp]);

  const patch = async (field: string, value: number, setter: (n: number) => void) => {
    markLocalMutation();
    try {
      await api.patch(`/api/characters/${charId}`, { [field]: value });
      await onSaved();
    } catch (err: any) {
      onError(err.response?.data?.error || 'Erreur');
    }
  };

  const hpColor = currentHp <= 0 ? 'text-red-600' : currentHp <= maxHp * 0.3 ? 'text-red-500' : currentHp <= maxHp * 0.5 ? 'text-orange-500' : 'text-green-600';
  const hpPct = maxHp > 0 ? Math.min(100, (currentHp / maxHp) * 100) : 0;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-sm font-medium text-ink-700">❤️ PV</span>

      {/* Current HP */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => { const n = Math.max(0, currentHp - 1); setCurrentHp(n); patch('currentHp', n, setCurrentHp); }}
          className="w-7 h-7 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 text-sm font-medium flex items-center justify-center"
          aria-label="Blesser"
        >−</button>
        <input
          type="number"
          className={`w-14 text-center text-sm font-bold bg-white border border-parchment-300 rounded-md py-1 focus:outline-none focus:border-blood-500 ${hpColor}`}
          value={currentHp}
          onChange={(e) => setCurrentHp(Number(e.target.value) || 0)}
          onBlur={() => { if (Number(currentHp) !== character.currentHp) patch('currentHp', currentHp, setCurrentHp); }}
          aria-label="Points de vie actuels"
        />
        <button
          onClick={() => { const n = Math.min(maxHp, currentHp + 1); setCurrentHp(n); patch('currentHp', n, setCurrentHp); }}
          className="w-7 h-7 rounded-lg bg-green-100 hover:bg-green-200 text-green-700 text-sm font-medium flex items-center justify-center"
          aria-label="Soigner"
        >+</button>
      </div>
      <span className="text-ink-400 text-sm">/</span>

      {/* Max HP */}
      <label className="flex items-center gap-1">
        <span className="text-xs text-ink-400">max</span>
        <input
          type="number"
          className="w-14 text-center text-sm font-semibold bg-white border border-parchment-300 rounded-md py-1 focus:outline-none focus:border-blood-500"
          value={maxHp}
          onChange={(e) => setMaxHp(Number(e.target.value) || 1)}
          onBlur={() => { if (Number(maxHp) !== character.maxHp) { const n = Math.max(1, maxHp); setMaxHp(n); patch('maxHp', n, setMaxHp); } }}
          aria-label="Points de vie maximum"
        />
      </label>

      {/* Temp HP — editable with add/remove */}
      <label className="flex items-center gap-1">
        <span className="text-xs text-ink-400">PV temp</span>
        <button
          onClick={() => { const n = Math.max(0, tempHp - 1); setTempHp(n); patch('tempHp', n, setTempHp); }}
          disabled={tempHp <= 0}
          className="w-6 h-6 rounded bg-blue-100 hover:bg-blue-200 disabled:opacity-30 text-blue-700 text-xs flex items-center justify-center"
          aria-label="Retirer 1 PV temp"
        >−</button>
        <input
          type="number"
          className={`w-12 text-center text-sm font-medium bg-white border border-parchment-300 rounded-md py-1 focus:outline-none focus:border-blood-500 ${tempHp > 0 ? 'text-blue-700' : 'text-ink-400'}`}
          value={tempHp}
          min={0}
          onChange={(e) => setTempHp(Math.max(0, Number(e.target.value) || 0))}
          onBlur={() => { if (Number(tempHp) !== character.tempHp) patch('tempHp', Math.max(0, tempHp), setTempHp); }}
          aria-label="Points de vie temporaires"
        />
        <button
          onClick={() => { const n = tempHp + 1; setTempHp(n); patch('tempHp', n, setTempHp); }}
          className="w-6 h-6 rounded bg-blue-100 hover:bg-blue-200 text-blue-700 text-xs flex items-center justify-center"
          aria-label="Ajouter 1 PV temp"
        >+</button>
      </label>
      {tempHp > 0 && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
          +{tempHp}
        </span>
      )}

      {/* HP bar */}
      <div className="flex-1 min-w-[80px] h-2 bg-parchment-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${currentHp <= 0 ? 'bg-red-700' : currentHp <= maxHp * 0.3 ? 'bg-red-500' : currentHp <= maxHp * 0.5 ? 'bg-orange-400' : 'bg-green-500'}`}
          style={{ width: `${hpPct}%` }}
        />
      </div>
    </div>
  );
}

function DeprivationBox({
  label,
  days,
  icon,
  onStep,
}: {
  label: string;
  days: number;
  icon: string;
  onStep: (delta: number) => void;
}) {
  // Amber at 3+, red at 5+
  const tone =
    days >= 5
      ? 'bg-red-50 border-red-200 text-red-800'
      : days >= 3
        ? 'bg-amber-50 border-amber-200 text-amber-800'
        : 'bg-parchment-100 border-parchment-200 text-ink-700';
  return (
    <div className={`rounded-xl border p-3 ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium flex items-center gap-1">
          <span aria-hidden="true">{icon}</span>
          {label}
        </span>
        <span className="text-sm font-semibold">
          {days} j
        </span>
      </div>
      <div className="flex items-center gap-1 mt-2">
        <button
          type="button"
          onClick={() => onStep(-1)}
          className="w-7 h-7 rounded-lg bg-white/70 hover:bg-white text-sm font-medium flex items-center justify-center"
          aria-label={`Diminuer les jours ${label.toLowerCase()}`}
        >
          −
        </button>
        <button
          type="button"
          onClick={() => onStep(1)}
          className="w-7 h-7 rounded-lg bg-white/70 hover:bg-white text-sm font-medium flex items-center justify-center"
          aria-label={`Augmenter les jours ${label.toLowerCase()}`}
        >
          +
        </button>
      </div>
      {days >= 3 && (
        <p className="text-xs mt-1.5 italic">
          {days >= 5
            ? '⚠ Risque grave d\u2019épuisement'
            : '⚠ Privation prolongée'}
        </p>
      )}
    </div>
  );
}

