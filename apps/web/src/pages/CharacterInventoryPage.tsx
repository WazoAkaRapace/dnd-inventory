import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, Link } from 'react-router-dom';
import api from '../api';
import { useSyncEvent, useSync } from '../sync';
import { useAuth } from '../auth';
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
  ConcentrationCheck,
} from '@dnd-inventory/shared';
import {
  CATEGORY_LABELS_FR,
  RARITY_LABELS_FR,
  COIN_LABELS_FR,
  DND_CONDITIONS_FR,
  computeWeaponStats,
  computeUnarmedStats,
  sneakAttackDice,
  extraAttacks,
  findClass,
  wildShapeDurationHours,
  wildShapeMaxCR,
  type WildShapeFormSummary,
  WEAPON_PROPERTY_LABELS_FR,
  resolveMagicArmorBase,
  proficiencyBonus,
  formatModifier,
} from '@dnd-inventory/shared';
import CharacterStatsTab from './CharacterStatsTab';
import CharacterSkillsTab from './CharacterSkillsTab';
import CharacterSpellsTab from './CharacterSpellsTab';
import CharacterFeaturesTab from './CharacterFeaturesTab';
import CharacterDescriptionTab from './CharacterDescriptionTab';
import NpcPage from './NpcPage';
import CharacterNotesTab from './CharacterNotesTab';
import ConcentrationAlert from '../components/ConcentrationAlert';
import MonsterStatBlock from '../components/MonsterStatBlock';

type CharacterTab = 'inventory' | 'survival' | 'stats' | 'spells' | 'skills' | 'features' | 'description' | 'npcs' | 'notes';

/** Character sheet tabs (shared by the desktop top bar and the mobile bottom dock). */
const CHARACTER_TABS: { key: CharacterTab; label: string; icon: string; primary: boolean; short?: string }[] = [
  { key: 'inventory', label: 'Inventaire', icon: '🎒', primary: false },
  { key: 'survival', label: 'Survie', icon: '🩸', primary: true, short: 'Survie' },
  { key: 'stats', label: 'Caractéristiques', icon: '⚔️', primary: true, short: 'Caract.' },
  { key: 'spells', label: 'Sorts', icon: '✨', primary: true, short: 'Sorts' },
  { key: 'skills', label: 'Compétences', icon: '🎯', primary: true, short: 'Comp.' },
  { key: 'features', label: 'Traits', icon: '📋', primary: false, short: 'Traits' },
  { key: 'description', label: 'Description', icon: '👤', primary: false },
  { key: 'npcs', label: 'PNJ', icon: '🎭', primary: false },
  { key: 'notes', label: 'Notes', icon: '📝', primary: false },
];
/** Dock slot order: the 4 essentials split around the center button. */
const DOCK_PRIMARY: CharacterTab[] = ['survival', 'stats', 'spells', 'skills'];
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
  const { user } = useAuth();
  const { partyId, charId } = useParams<{ partyId: string; charId: string }>();

  // Inventory / character state
  const [data, setData] = useState<CharacterInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Party role: the GM can edit any sheet in their party
  const [isGM, setIsGM] = useState(false);

  // Editable capacity multiplier
  const [multDraft, setMultDraft] = useState('1');
  const [showMultHelp, setShowMultHelp] = useState(false);
  const [showCarryModal, setShowCarryModal] = useState(false);
  // Inline-editable character name
  const [nameDraft, setNameDraft] = useState('');
  const [editingName, setEditingName] = useState(false);

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
  const [moreOpen, setMoreOpen] = useState(false); // mobile « Plus » tabs sheet
  // Mobile combat: the dock hub doubles as the combat indicator
  const [hubCombat, setHubCombat] = useState<{
    encounterId: number; partyId: number; status: string; round: number;
    needsInitiative: boolean; isMyTurn: boolean; currentCombatantName: string | null;
    myCombatantId: number | null; initiativeBonus: number;
  } | null>(null);
  const [hubInitOpen, setHubInitOpen] = useState(false);
  const [hubInitInput, setHubInitInput] = useState('');
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

  // GM status: from the party members list (mirrors the server's isPartyGM check)
  useEffect(() => {
    if (!partyId || !user) return;
    let alive = true;
    api.get<PartyDetail>(`/api/parties/${partyId}`)
      .then((res) => {
        if (alive) setIsGM(res.data.members.some((m) => m.userId === user.id && m.role === 'gm'));
      })
      .catch(() => { if (alive) setIsGM(false); });
    return () => { alive = false; };
  }, [partyId, user]);

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
      setMultDraft(String(res.data.character.capacityMultiplier ?? 1));      // Default the active tab to the carried location
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
      // Diff guard: only update state if data actually changed.
      // This prevents deep re-renders when the response is identical
      // (e.g. after a no-op sync event or unchanged data).
      const newDataStr = JSON.stringify(res.data);
      setData((prev) => {
        if (prev && JSON.stringify(prev) === newDataStr) return prev;
        return res.data;
      });
      // Sync coins only if values changed
      setCoins((prev) => {
        const next = {
          copper: res.data.character.copper,
          silver: res.data.character.silver,
          electrum: res.data.character.electrum,
          gold: res.data.character.gold,
          platinum: res.data.character.platinum,
        };
        return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
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

  const commitName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === character.name) {
      setEditingName(false);
      return;
    }
    try {
      await api.patch(`/api/characters/${charId}`, { name: trimmed });
      markLocalMutation();
      await refreshInventory();
      pushToast('Nom mis à jour');
    } catch (err: any) {
      pushToast(err.response?.data?.error || 'Erreur', 'error');
    } finally {
      setEditingName(false);
    }
  };

  const dismissError = () => setError('');

  // ---------- Combat indicator hooks ----------
  // MUST stay above the render guards: hooks after a conditional return
  // change the hook count between renders and crash React (#310).
  // The sync listener bumps a counter that re-runs the effect below.
  const [combatRefresh, setCombatRefresh] = useState(0);
  useSyncEvent((event) => {
    if (event.partyId === Number(partyId) && event.type === 'combat:change') {
      setCombatRefresh(n => n + 1);
    }
  }, [partyId]);

  // Mobile combat: check if this character is in an active/setup encounter.
  // Only setState when the combat status actually changes to avoid re-render loops.
  const hubCombatRef = useRef<string>('');
  useEffect(() => {
    if (!user || !data?.character) return;
    const ownerId = data.character.ownerId;
    let alive = true;
    const load = async () => {
      try {
        const encRes = await api.get(`/api/parties/${partyId}/encounters`);
        const encounters = encRes.data.encounters || [];
        const relevant = encounters.filter((e: any) => e.status === 'active' || e.status === 'setup');
        for (const enc of relevant) {
          const det = await api.get(`/api/encounters/${enc.id}`);
          const detail = det.data.encounter;
          const mine = detail.combatants.find(
            (c: any) => c.characterId === Number(charId),
          );
          if (mine) {
            const current = detail.combatants[detail.turnIndex];
            const dexMod = Math.floor(((data?.character?.dexterity ?? 10) - 10) / 2);
            const next = {
              encounterId: detail.id, partyId: detail.partyId,
              status: detail.status, round: detail.round,
              needsInitiative: mine.initiative === null,
              isMyTurn: detail.status === 'active' && current?.id === mine.id,
              currentCombatantName: current?.name ?? null,
              myCombatantId: mine.id,
              initiativeBonus: mine.initiativeBonus ?? dexMod,
            };
            // Only update state if the combat snapshot actually changed
            const key = JSON.stringify(next);
            if (alive && key !== hubCombatRef.current) {
              hubCombatRef.current = key;
              setHubCombat(next);
            }
            return;
          }
        }
        if (alive && hubCombatRef.current !== '') {
          hubCombatRef.current = '';
          setHubCombat(null);
        }
      } catch { /* silent */ }
    };
    load();
    return () => { alive = false; };
  }, [user, partyId, charId, data?.character?.ownerId, combatRefresh]);

  // ---------- Render guards ----------
  if (loading) return <LoadingSpinner label="Chargement du sac à dos…" />;
  if (error && !data) return <ErrorMsg message={error} />;
  if (!data) return <ErrorMsg message="Personnage introuvable" />;

  const { character, encumbrance, locations, locationWeights } = data;

  // Only the sheet owner or the party GM can edit (the API enforces the same rule)
  const canEdit = data.character.ownerId === user?.id || isGM;

  // Non-casters never open Sorts: Traits takes its dock slot, Sorts moves to the hub
  const isCasterClass = !!findClass(character.characterClass) && findClass(character.characterClass)!.spellcasting !== 'none';
  const dockPrimaryList: CharacterTab[] = isCasterClass
    ? ['survival', 'stats', 'spells', 'skills']
    : ['survival', 'stats', 'features', 'skills'];

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
      readOnly={!canEdit}
      onAdd={addFromCatalog}
      onLoadMore={() => fetchCatalog(catalogOffset + CATALOG_PAGE_SIZE, true)}
    />
  );

  return (
    <div className="space-y-4 pb-16 lg:pb-0">
      {/* Character header + encumbrance */}
      <div>
        <div className="card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-display text-xl sm:text-2xl font-bold truncate flex items-center gap-2">
              {character.portraitUrl && (
                <img
                  src={character.portraitUrl}
                  alt={character.name}
                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover border-2 border-parchment-300 shrink-0"
                />
              )}
              {editingName ? (
                <input
                  type="text"
                  className="font-display text-xl sm:text-2xl font-bold bg-transparent border-b-2 border-blood-500 outline-none min-w-0 flex-1"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={commitName}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') { setEditingName(false); }
                  }}
                  autoFocus
                />
              ) : canEdit ? (
                <button
                  onClick={() => { setNameDraft(character.name); setEditingName(true); }}
                  className="hover:text-blood-600 transition-colors truncate"
                  title="Cliquer pour renommer"
                >
                  {character.name}
                </button>
              ) : (
                <span className="truncate">{character.name}</span>
              )}
              {character.concentrating && (
                <span className="shrink-0 text-base" title="Concentration en cours" aria-label="En concentration">
                  🌀
                </span>
              )}
              {canEdit && (
                <button
                  onClick={() => setShowCarryModal(true)}
                  className="ml-auto shrink-0 text-ink-400 hover:text-blood-600 transition-colors"
                  aria-label="Portage"
                  title="Portage"
                >
                  <SettingsIcon className="w-5 h-5" />
                </button>
              )}
            </h1>
          </div>
          <div className="mt-3">
            <EncumbranceBar encumbrance={encumbrance} />
          </div>
        </div>
      </div>

      {/* ---------- Portage modal ---------- */}
      <Modal open={showCarryModal} onClose={() => setShowCarryModal(false)} title="Portage">
        <div className="space-y-4">
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

      {/* ---------- Tab navigation — desktop top bar ---------- */}
      <div className="-mx-4 px-4 sm:mx-0 sm:px-0 hidden lg:block">
        <div className="flex items-center gap-1 bg-parchment-100 rounded-xl p-1 overflow-x-auto no-scrollbar">
          {CHARACTER_TABS.map((tab) => (
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

      {/* ---------- Tab navigation — floating mobile dock with sliding indicator ---------- */}
      <div className="lg:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-30 max-w-[calc(100vw-2rem)]">
        {/* Combat status card — always visible, attached to the top of the dock.
            Initiative pending: expands inline with input + dice. */}
        {hubCombat && hubCombat.needsInitiative && hubCombat.myCombatantId ? (
          <div className={`mb-[-6px] mx-auto w-fit max-w-full rounded-t-xl rounded-b-md shadow-md border border-b-0 overflow-hidden transition-all duration-300 bg-yellow-400 border-yellow-500 ${
            hubInitOpen ? 'max-h-44' : 'max-h-12'
          }`}>
            <button
              onClick={() => setHubInitOpen(o => !o)}
              className="block w-full px-3 py-1.5 text-xs font-semibold text-ink-900"
              aria-expanded={hubInitOpen}
            >
              🎲 Lance ton initiative !
            </button>
            {hubInitOpen && (
              <div className="px-3 pb-2 pt-1 flex items-center gap-2 bg-yellow-50 border-t border-yellow-300">
                <input
                  type="number"
                  min={1}
                  max={40}
                  value={hubInitInput}
                  onChange={(e) => setHubInitInput(e.target.value)}
                  placeholder="—"
                  className="input input-compact text-sm py-1"
                  autoFocus
                  aria-label="Ton initiative"
                />
                <button
                  onClick={async () => {
                    const v = parseInt(hubInitInput, 10);
                    if (isNaN(v)) return;
                    try {
                      await api.patch(
                        `/api/encounters/${hubCombat.encounterId}/combatants/${hubCombat.myCombatantId}/initiative`,
                        { initiative: v },
                      );
                      setHubInitOpen(false);
                      setHubInitInput('');
                      await refreshInventory();
                    } catch { /* silent */ }
                  }}
                  className="btn-primary text-xs px-3 py-1"
                >
                  OK
                </button>
                <button
                  onClick={() => {
                    const roll = Math.floor(Math.random() * 20) + 1;
                    setHubInitInput(String(roll + hubCombat.initiativeBonus));
                  }}
                  className="btn-secondary text-xs px-2 py-1"
                  title={`d20 + ${hubCombat.initiativeBonus} (DEX)`}
                >
                  🎲
                </button>
              </div>
            )}
          </div>
        ) : hubCombat && (
          <Link
            to={`/party/${hubCombat.partyId}/combat`}
            className={`block mb-[-6px] mx-auto w-fit max-w-full px-3 py-1.5 rounded-t-xl rounded-b-md text-xs font-semibold shadow-md border border-b-0 transition-colors ${
              hubCombat.isMyTurn
                ? 'bg-blood-600 text-parchment-50 border-blood-700'
                : 'bg-ink-900 text-parchment-200 border-ink-700'
            }`}
            aria-label="Combat en cours — ouvrir le traqueur"
          >
            {hubCombat.isMyTurn
              ? '⚔ À toi de jouer !'
              : hubCombat.currentCombatantName
                ? `⚔ ${hubCombat.currentCombatantName}`
                : '⚔ Combat en préparation'}
          </Link>
        )}
        {(() => {
          const dockPrimary = dockPrimaryList;
          const primaries = dockPrimary.map((k) => CHARACTER_TABS.find((t) => t.key === k)!);
          const left = primaries.slice(0, 2);
          const right = primaries.slice(2);
          const secondary = CHARACTER_TABS.find((t) => t.key === activeTab && !dockPrimary.includes(t.key));
          // Flex order: [slot][slot][hub][slot][slot] — equal 56px blocks with
          // 4px gaps after an 8px padding. The hub occupies visual slot 2, so
          // right-side tabs skip it; the indicator slides behind the hub only
          // when a secondary tab is selected.
          const activeIdx = primaries.findIndex((p) => p.key === activeTab);
          const indicatorIdx = activeIdx === -1 ? 2 : activeIdx <= 1 ? activeIdx : activeIdx + 1;
            const slot = (tab: typeof primaries[number]) => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`relative z-10 flex flex-col items-center gap-0.5 w-14 py-1 rounded-full transition-[color,transform] duration-200 active:scale-95 whitespace-nowrap ${
                    active ? 'text-white' : 'text-ink-400 hover:text-ink-700'
                  }`}
                  aria-pressed={active}
                  aria-label={tab.label}
                >
                  <span className="text-lg leading-none" aria-hidden="true">{tab.icon}</span>
                  <span className="text-[9px] font-medium leading-none">{tab.short ?? tab.label}</span>
                </button>
              );
            };
            return (
              <div className="dock-rise relative flex items-center gap-1 bg-white/95 backdrop-blur rounded-full shadow-xl border border-parchment-200 px-2 py-1.5">
                {/* Sliding active indicator — 8px padding + 60px per block */}
                <span
                  className="dock-indicator absolute top-1 bottom-1 left-2 w-14 rounded-full bg-blood-600 shadow-sm"
                  style={{ transform: `translateX(${indicatorIdx * 60}px)` }}
                  aria-hidden="true"
                />
                {left.map(slot)}
                {/* Center: expandable button — doubles as the combat indicator */}
                <button
                  onClick={() => setMoreOpen((o) => !o)}
                  className={`hub-button relative z-10 mx-1 -my-3 w-12 h-12 shrink-0 rounded-full shadow-lg flex items-center justify-center text-xl leading-none active:scale-90 border-4 border-parchment-50 ${
                    moreOpen ? 'bg-ink-900 rotate-90 text-white'
                    : hubCombat?.isMyTurn ? 'bg-blood-700 text-white shadow-[0_0_0_3px_rgba(185,28,28,0.5),0_0_18px_rgba(185,28,28,0.5)]'
                    : hubCombat?.needsInitiative ? 'bg-yellow-500 text-ink-900 shadow-[0_0_0_3px_rgba(202,138,4,0.5),0_0_18px_rgba(202,138,4,0.5)]'
                    : hubCombat ? 'bg-blood-600 text-white shadow-[0_0_0_2px_rgba(185,28,28,0.3),0_0_12px_rgba(185,28,28,0.25)]'
                    : 'bg-blood-600 hover:bg-blood-700 text-white'
                  }`}
                  aria-expanded={moreOpen}
                  aria-label={hubCombat ? 'Combat en cours' : moreOpen ? 'Fermer les autres onglets' : 'Autres onglets'}
                >
                  <span key={moreOpen ? 'x' : hubCombat ? 'combat' : secondary ? secondary.key : 'menu'} className="icon-swap" aria-hidden="true">
                    {moreOpen ? '✕' : hubCombat ? '⚔' : secondary ? secondary.icon : '☰'}
                  </span>
                </button>
                {right.map(slot)}
              </div>
            );
        })()}
      </div>

      {/* Expanding dial: scrim + secondary tab stack above the center button,
          with the same sliding indicator (vertical) behind the active tab */}
      {moreOpen && (
        <>
          <div className="scrim-fade lg:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setMoreOpen(false)} />
          {(() => {
            const secondaryTabs = CHARACTER_TABS.filter((t) => !dockPrimaryList.includes(t.key));
            const activeIdx = secondaryTabs.findIndex((t) => t.key === activeTab);
            // Compact 2-column grid anchored just above the dock — stays in
            // thumb reach. Cells are w-36 (144px) + 8px gaps; the 5th item
            // spans both columns. No highlight when a dock tab is active.
            const indPos = (idx: number) => {
              const row = Math.floor(idx / 2);
              const span = idx === 4; // 5th item is full-width
              return {
                x: span ? 0 : (idx % 2) * 152,
                y: row * 48,
                w: span ? 296 : 144,
              };
            };
            const p = activeIdx >= 0 ? indPos(activeIdx) : null;
            return (
              <div className="lg:hidden fixed z-50 bottom-24 left-1/2 -translate-x-1/2">
              <div className="w-[296px] grid grid-cols-2 gap-2">
                {p && (
                  <span
                    className="dock-indicator absolute top-0 left-0 h-10 rounded-full bg-blood-600 shadow-sm"
                    style={{ width: p.w, transform: `translate(${p.x}px, ${p.y}px)` }}
                    aria-hidden="true"
                  />
                )}
                {secondaryTabs.map((tab, i) => {
                  const active = activeTab === tab.key;
                  const span = i === 4;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => { setActiveTab(tab.key); setMoreOpen(false); }}
                      className={`dial-item relative z-10 ${span ? 'col-span-2 w-full' : 'w-36'} h-10 flex items-center justify-center gap-2 rounded-full border shadow-lg text-sm font-medium whitespace-nowrap transition-[color,border-color,background-color] duration-200 active:scale-95 ${
                        active
                          ? 'bg-transparent text-white border-blood-700'
                          : 'bg-white text-ink-700 border-parchment-200 hover:border-blood-400'
                      }`}
                      style={{ animationDelay: `${i * 30}ms` }}
                    >
                      <span className="text-lg leading-none" aria-hidden="true">{tab.icon}</span>
                      {tab.label}
                    </button>
                  );
                })}
              </div>
              </div>
          );
        })()}
      </>
      )}

      {/* ---------- Non-inventory tabs (rendered when selected) ---------- */}
      {activeTab === 'survival' && (
        <SurvivalPanel
          character={character}
          charId={Number(charId)}
          entries={entries}
          canEdit={canEdit}
          markLocalMutation={markLocalMutation}
          onSaved={refreshInventory}
          onError={(msg) => pushToast(msg, 'error')}
          onNotice={(msg) => pushToast(msg)}
        />
      )}
      {activeTab === 'stats' && (
        <CharacterStatsTab
          character={character}
          charId={Number(charId)}
          entries={entries}
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
                {loc.type !== 'carried' && isActive && canEdit && (
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
          {canEdit && (
            <button
              onClick={() => setShowNewLocationModal(true)}
              className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium border border-dashed border-parchment-300 text-ink-500 hover:border-blood-400 hover:text-blood-600 transition-colors"
              aria-label="Ajouter un transport"
              title="Ajouter un transport"
            >
              <span aria-hidden="true">+</span> Transport
            </button>
          )}
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
                  character={character}
                  busyEntryIds={busyEntryIds}
                  expandedId={expandedId}
                  flashEntryId={flashEntryId}
                  confirmDeleteId={confirmDeleteId}
                  locations={locations}
                  activeLocationId={activeLocationResolvedId}
                  canEdit={canEdit}
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
          readOnly={!canEdit}
          onChange={(key, val) => {
            setCoins((c) => ({ ...c, [key]: Math.max(0, val) }));
            setCoinsDirty(true);
          }}
          onBlur={saveCoins}
        />
      </section>
        </>
      )}

      {/* ---------- Mobile FAB: open catalog as bottom sheet (inventory tab only) ---------- */}
      {activeTab === 'inventory' && canEdit && (
      <button
        onClick={() => setCatalogOpen(true)}
        className="lg:hidden fab-enter fixed bottom-24 right-5 z-30 w-14 h-14 rounded-full bg-blood-600 text-white shadow-lg flex items-center justify-center text-2xl font-light hover:bg-blood-700 active:scale-95 transition-all"
        aria-label="Ajouter un objet au catalogue"
      >
        +
      </button>
      )}

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
  character: Character;
  busyEntryIds: Set<number>;
  expandedId: number | null;
  flashEntryId: number | null;
  confirmDeleteId: number | null;
  locations: StorageLocation[];
  activeLocationId: number | null;
  canEdit: boolean;
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
  character,
  busyEntryIds,
  expandedId,
  flashEntryId,
  confirmDeleteId,
  locations,
  activeLocationId,
  canEdit,
  onToggleExpand,
  onStep,
  onSetQuantity,
  onToggleEquipped,
  onConfirmDelete,
  onCancelDelete,
  onTransfer,
  onMoveLocation,
}: CategoryGroupProps) {
  const [collapsed, setCollapsed] = useState(true);
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
                character={character}
                busy={busyEntryIds.has(entry.id)}
                expanded={expandedId === entry.id}
                flashed={flashEntryId === entry.id}
                confirmingDelete={confirmDeleteId === entry.id}
                locations={locations}
                activeLocationId={activeLocationId}
                canEdit={canEdit}
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
  character: Character;
  busy: boolean;
  expanded: boolean;
  flashed: boolean;
  confirmingDelete: boolean;
  locations: StorageLocation[];
  activeLocationId: number | null;
  canEdit: boolean;
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
  character,
  busy,
  expanded,
  flashed,
  confirmingDelete,
  locations,
  activeLocationId,
  canEdit,
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
  const canExpand = hasDetails || (canMove && canEdit);

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
              {canEdit ? (
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
              ) : (
                <span
                  className={`shrink-0 mt-0.5 text-lg leading-none ${entry.equipped ? 'text-gold-400' : 'text-ink-400/40'}`}
                  title={entry.equipped ? 'Équipé' : 'Non équipé'}
                >
                  {entry.equipped ? '★' : '☆'}
                </span>
              )}

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
              {canEdit ? (
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
              ) : (
                <span className="hidden sm:inline text-sm text-ink-500 shrink-0">× {quantity}</span>
              )}
            </div>

            {/* Row 2 (mobile only): weight info + transfer + stepper side by side */}
            <div className="flex items-center justify-between gap-2 mt-1.5 sm:hidden pl-7">
              <div className="flex items-center gap-2 text-xs text-ink-500 min-w-0">
                <WeightBadge weightKg={effectiveWeightKg} />
                {totalWeight !== null && quantity > 1 && (
                  <span className="text-ink-400">× {quantity} = {totalWeight.toFixed(1)} kg</span>
                )}
                {canEdit && (
                  <button onClick={onTransfer} disabled={busy} className="text-ink-400 hover:text-blood-600 text-xs underline" aria-label={`Transférer ${itemName}`}>
                    ↗
                  </button>
                )}
              </div>
              {canEdit ? (
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
              ) : (
                <span className="text-sm text-ink-500 shrink-0">× {quantity}</span>
              )}
            </div>

            {/* Desktop: weight info + transfer stays under the name */}
            <div className="hidden sm:flex items-center gap-3 mt-1 ml-7 text-xs text-ink-500">
              <WeightBadge weightKg={effectiveWeightKg} />
              {totalWeight !== null && quantity > 1 && (
                <span className="text-ink-400">× {quantity} = {totalWeight.toFixed(1)} kg</span>
              )}
              {canEdit && (
                <button onClick={onTransfer} disabled={busy} className="text-ink-400 hover:text-blood-600 underline" aria-label={`Transférer ${itemName}`}>
                  ↗ Transférer
                </button>
              )}
            </div>

            {/* Expanded: details + secondary actions (progressive disclosure) */}
            {canExpand && (
              <div className={`expand-grid mt-3 ${expanded ? '' : 'is-collapsed'}`}>
                <div className="expand-inner">
                  <div className="border-t border-parchment-200 pt-3 space-y-2">
                    {item.description && (
                      <p className="text-sm text-ink-700 whitespace-pre-line">{item.description}</p>
                    )}
                    {item.aliases && item.aliases.length > 0 && (
                      <p className="text-xs text-ink-400">
                        Aussi connu sous : {item.aliases.join(', ')}
                      </p>
                    )}
                    {/* Computed attack & damage from character stats (weapons) */}
                    {item.category === 'weapon' && (() => {
                      const stats = computeWeaponStats(item, character);
                      if (!stats) return null;
                      const abilityLabel = stats.ability === 'dexterity' ? 'DEX' : 'FOR';
                      const archery = character.fightingStyle === 'archery' && stats.ranged ? 2 : 0;
                      const profBonus = proficiencyBonus(character.level ?? 1);
                      const breakdown = `d20 ${formatModifier(stats.attackBonus - (stats.proficient ? profBonus : 0) - stats.magicBonus - archery)} (${abilityLabel})`
                        + (stats.proficient ? ` + ${profBonus} (maîtrise)` : '')
                        + (archery > 0 ? ` + ${archery} (archerie)` : '')
                        + (stats.magicBonus > 0 ? ` + ${stats.magicBonus} (magique)` : '');
                      return (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border ${
                              stats.proficient
                                ? 'bg-red-50 text-red-800 border-red-200'
                                : 'bg-amber-50 text-amber-800 border-amber-300'
                            }`}
                            title={stats.proficient ? `Attaque : ${breakdown}` : `Attaque : ${breakdown} — non qualifié avec cette arme (pas de bonus de maîtrise)`}
                          >
                            🎯 {formatModifier(stats.attackBonus)}{!stats.proficient && ' ⚠'}
                          </span>
                          {stats.damageStr && (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-orange-50 text-orange-800 text-[11px] font-medium border border-orange-200"
                              title={`Dégâts : ${stats.damageStr} (${abilityLabel})${stats.magicBonus > 0 ? ` + ${stats.magicBonus} magique` : ''}`}
                            >
                              ⚔ {stats.damageStr}{stats.damageTypeFr ? ` ${stats.damageTypeFr}` : ''}
                            </span>
                          )}
                          {stats.versatileDamageStr && (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-orange-50/60 text-orange-700 text-[11px] font-medium border border-orange-200"
                              title="Dégâts à deux mains"
                            >
                              {stats.versatileDamageStr} · deux mains
                            </span>
                          )}
                          {stats.magicBonus > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gold-100 text-gold-700 text-[11px] font-semibold border border-gold-300">
                              ✨ +{stats.magicBonus}
                            </span>
                          )}
                          {stats.presumedBase && (
                            <span className="text-[10px] text-ink-400 italic">base présumée</span>
                          )}
                        </div>
                      );
                    })()}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
                      {item.acBase !== null && <span>🛡 CA : {item.acBase}</span>}
                      {item.acBase === null && item.category === 'armor' && (() => {
                        const magic = resolveMagicArmorBase(item);
                        if (magic.shield) return <span>🛡 Bouclier (+2 à la CA)</span>;
                        if (!magic.base) return null;
                        return (
                          <span>
                            🛡 CA : {magic.base.acBase}
                            {magic.magicBonus > 0 && ` +${magic.magicBonus}`} · base {magic.base.nameFr}
                          </span>
                        );
                      })()}
                      {item.strMin !== null && <span>💪 FOR min. : {item.strMin}</span>}
                      {item.stealthDisadvantage && <span>🤫 Désavantage Discrétion</span>}
                      {item.properties && item.properties.filter((p) => p !== 'monk').length > 0 && (
                        <span>
                          Propriétés : {item.properties
                            .filter((p) => p !== 'monk')
                            .map((p) => WEAPON_PROPERTY_LABELS_FR[p] ?? p)
                            .join(', ')}
                        </span>
                      )}
                    </div>
                    {entry.notes && (
                      <p className="text-xs text-ink-500 italic">Note : {entry.notes}</p>
                    )}
                    {/* Move to another storage location */}
                    {canMove && canEdit && (
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
                    {canEdit && (
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
                    )}
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
  /** When true (viewer mode), hide the add buttons — catalog is browse-only. */
  readOnly?: boolean;
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
  readOnly = false,
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
                  {item.aliases && item.aliases.length > 0 && (
                    <p className="text-[11px] text-ink-400 mt-0.5">
                      Aussi : {item.aliases.join(', ')}
                    </p>
                  )}
                </div>
                {!readOnly && (
                  <button
                    onClick={() => onAdd(item)}
                    disabled={addingItemId === item.id}
                    className="btn-primary text-sm px-3 py-2 shrink-0"
                    aria-label={`Ajouter ${item.nameFr || item.name}`}
                  >
                    {addingItemId === item.id ? '…' : '+ Ajouter'}
                  </button>
                )}
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
  readOnly = false,
  onChange,
  onBlur,
}: {
  coins: { copper: number; silver: number; electrum: number; gold: number; platinum: number };
  /** Viewer mode: display amounts without inputs. */
  readOnly?: boolean;
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
                  {readOnly ? (
                    <div
                      className="input bg-parchment-100 text-ink-700 flex items-center justify-between"
                      aria-label={`Quantité de ${COIN_LABELS_FR[unit]}`}
                    >
                      <span>{coins[key]}</span>
                      <span className="text-xs text-ink-400">{unit}</span>
                    </div>
                  ) : (
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
                  )}
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
  /** Only the sheet owner or GM can use the survival actions. */
  canEdit: boolean;
  markLocalMutation: () => void;
  onSaved: () => Promise<void>;
  onError: (msg: string) => void;
  onNotice?: (msg: string) => void;
}

function SurvivalPanel({ character, charId, entries, canEdit, markLocalMutation, onSaved, onError, onNotice }: SurvivalPanelProps) {
  const [exhaustion, setExhaustion] = useState(character.exhaustion);
  const [conditions, setConditions] = useState<string[]>(character.conditions);
  const [foodDays, setFoodDays] = useState(character.foodDays);
  const [waterDays, setWaterDays] = useState(character.waterDays);
  const [concCheck, setConcCheck] = useState<ConcentrationCheck | null>(null);
  const [shapePickerOpen, setShapePickerOpen] = useState(false);
  const [shapeForms, setShapeForms] = useState<WildShapeFormSummary[]>([]);
  const [shapeSearch, setShapeSearch] = useState('');
  const [shapeSeenOnly, setShapeSeenOnly] = useState(true);
  const [shapeStatBlock, setShapeStatBlock] = useState<string | null>(null);
  const [shapeHpDraft, setShapeHpDraft] = useState<string | null>(null);

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
      const res = await api.patch(`/api/characters/${charId}`, payload);
      // Applying an incapacitating condition breaks concentration — tell the player.
      if (res?.data?.concentrationBroken) {
        onNotice?.(`🌀 Concentration rompue : ${res.data.concentrationBroken} — le sort en cours est interrompu`);
      }
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

  const openShapePicker = async () => {
    try {
      const res = await api.get(`/api/characters/${charId}/wild-shape/forms`);
      setShapeForms(res.data.forms ?? []);
      setShapeSearch('');
      setShapePickerOpen(true);
    } catch {
      onError('Erreur du bestiaire');
    }
  };

  const toggleShapeSeen = async (slug: string, seen: boolean) => {
    markLocalMutation();
    try {
      const current = character.wildShapeSeen ?? [];
      const next = seen ? current.filter((x) => x !== slug) : [...current, slug];
      await api.patch(`/api/characters/${charId}`, { wildShapeSeen: next });
      setShapeForms((prev) => prev.map((f) => (f.slug === slug ? { ...f, seen: !seen } : f)));
      await onSaved();
    } catch {
      onError('Erreur de mise à jour');
    }
  };

  const takeShape = async (slug: string) => {
    markLocalMutation();
    try {
      await api.post(`/api/characters/${charId}/wild-shape`, { slug });
      setShapePickerOpen(false);
      await onSaved();
    } catch (err: any) {
      onError(err.response?.data?.error || 'Erreur de transformation');
    }
  };

  const revertShape = async () => {
    markLocalMutation();
    try {
      await api.post(`/api/characters/${charId}/wild-shape/revert`);
      await onSaved();
    } catch (err: any) {
      onError(err.response?.data?.error || 'Erreur de retour à la normale');
    }
  };

  const stepDays = async (kind: 'foodDays' | 'waterDays', delta: number) => {
    const next = Math.max(0, (kind === 'foodDays' ? foodDays : waterDays) + delta);
    if (kind === 'foodDays') setFoodDays(next);
    else setWaterDays(next);
    await patchCharacter({ [kind]: next }, 'Erreur de mise à jour');
  };

  return (
    <section className="card p-4 sm:p-5 space-y-4">
      <h2 className="font-display text-lg font-semibold flex items-center gap-2">
        <span aria-hidden="true">🩸</span> Survie
      </h2>

      {/* Attack options — equipped weapons with computed attack & damage */}
      <div>
        <span className="text-sm font-medium text-ink-700 block mb-1.5">⚔ Attaques</span>
        {(() => {
          const equippedWeapons = entries.filter((e) => e.equipped && e.item.category === 'weapon');
          if (equippedWeapons.length === 0) return null;
          return (
            <div className="space-y-1.5">
              {equippedWeapons.map((e) => {
                const stats = computeWeaponStats(e.item, character);
                const itemName = e.item.nameFr || e.item.name;
                if (!stats) {
                  return (
                    <div key={e.id} className="flex items-center justify-between bg-parchment-50 rounded-lg px-3 py-2 border border-parchment-200">
                      <span className="text-sm font-medium text-ink-800 truncate">{itemName}</span>
                      <span className="text-xs text-ink-400">arme non résolue</span>
                    </div>
                  );
                }
                const abilityLabel = stats.ability === 'dexterity' ? 'DEX' : 'FOR';
                const profBonus = proficiencyBonus(character.level ?? 1);
                const nAttacks = extraAttacks(character.characterClass, character.level ?? 1);
                const archery = character.fightingStyle === 'archery' && stats.ranged ? 2 : 0;
                const breakdown = `d20 ${formatModifier(stats.attackBonus - (stats.proficient ? profBonus : 0) - stats.magicBonus - archery)} (${abilityLabel})`
                  + (stats.proficient ? ` + ${profBonus} (maîtrise)` : '')
                  + (archery > 0 ? ` + ${archery} (archerie)` : '')
                  + (stats.magicBonus > 0 ? ` + ${stats.magicBonus} (magique)` : '');
                return (
                  <div key={e.id} className="bg-parchment-50 rounded-lg px-3 py-2 border border-parchment-200 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-ink-800 truncate">{itemName}</span>
                      {!stats.proficient && (
                        <span className="text-[10px] font-semibold text-amber-600 shrink-0">⚠ non qualifié</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border ${
                          stats.proficient
                            ? 'bg-red-50 text-red-800 border-red-200'
                            : 'bg-amber-50 text-amber-800 border-amber-300'
                        }`}
                        title={`Attaque : ${breakdown}`}
                      >
                        🎯 {formatModifier(stats.attackBonus)}
                      </span>
                      {nAttacks > 1 && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blood-50 text-blood-800 text-[11px] font-semibold border border-blood-200"
                          title={`${nAttacks} attaques par action d'attaque`}
                        >
                          ×{nAttacks}
                        </span>
                      )}
                      {stats.damageStr && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-orange-50 text-orange-800 text-[11px] font-medium border border-orange-200"
                          title={`Dégâts : ${stats.damageStr} (${abilityLabel})`}
                        >
                          ⚔ {stats.damageStr}{stats.damageTypeFr ? ` ${stats.damageTypeFr}` : ''}
                        </span>
                      )}
                      {stats.versatileDamageStr && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-orange-50/60 text-orange-700 text-[11px] font-medium border border-orange-200"
                          title="Dégâts à deux mains"
                        >
                          {stats.versatileDamageStr} · deux mains
                        </span>
                      )}
                      {stats.magicBonus > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gold-100 text-gold-700 text-[11px] font-semibold border border-gold-300">
                          ✨ +{stats.magicBonus}
                        </span>
                      )}
                      {stats.presumedBase && (
                        <span className="text-[10px] text-ink-400 italic">base présumée</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
        {/* Unarmed strike — always available */}
        {entries.filter((e) => e.equipped && e.item.category === 'weapon').length === 0 && (
          <p className="text-xs text-ink-400 italic -mb-1">
            Aucune arme équipée — la frappe sans arme reste disponible.
          </p>
        )}
        {findClass(character.characterClass)?.name === 'Roublard' && (
          (() => {
            const hasFinesseWeapon = entries.some((e) => e.equipped && e.item.category === 'weapon'
              && (e.item.properties?.includes('finesse') || e.item.properties?.includes('ammunition')));
            return (
              <div className="bg-parchment-100 rounded-lg px-3 py-2 border border-parchment-200 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-ink-800 truncate">☠ Attaque furtive</span>
                  {!hasFinesseWeapon && (
                    <span className="text-[10px] text-ink-400 shrink-0">arme de finesse ou à distance requise</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-orange-50 text-orange-800 text-[11px] font-medium border border-orange-200"
                    title="Une fois par tour, avec avantage ou un allié adjacent à la cible — dégâts du type de l'arme"
                  >
                    ⚔ {sneakAttackDice(character.level ?? 1)} dégâts de l'arme
                  </span>
                  <span className="text-[10px] text-ink-400">une fois par tour</span>
                </div>
              </div>
            );
          })()
        )}
        {findClass(character.characterClass)?.name === 'Druide' && (character.level ?? 1) >= 2 && (() => {
          const shaped = !!character.wildShapeSlug;
          return (
            <div className="rounded-xl border border-green-300 bg-green-50 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-green-900 flex items-center gap-1.5">
                  🐾 Forme sauvage
                </span>
                <span className="flex items-center gap-0.5" role="group" aria-label="Utilisations de forme sauvage">
                  {[1, 2].map((n) => (
                    <button
                      key={n}
                      onClick={async () => {
                        if ((character.wildShapeUses ?? 2) === n) return;
                        markLocalMutation();
                        try {
                          await api.patch(`/api/characters/${charId}`, { wildShapeUses: n });
                          await onSaved();
                        } catch { onError('Erreur de mise à jour'); }
                      }}
                      className={`text-base leading-none px-0.5 transition-opacity ${(character.wildShapeUses ?? 2) >= n ? 'opacity-100' : 'opacity-25 hover:opacity-60'}`}
                      aria-pressed={(character.wildShapeUses ?? 2) >= n}
                      aria-label={`${n} utilisation${n > 1 ? 's' : ''} de forme sauvage`}
                      title={`Régler à ${n} utilisation${n > 1 ? 's' : ''} (récupérées après un repos court ou long)`}
                    >
                      🐾
                    </button>
                  ))}
                </span>
              </div>
              {shaped ? (
                <>
                  <div className="text-xs text-green-800 flex items-center gap-1.5 flex-wrap">
                    <span>
                      Forme actuelle : <strong>{shapeForms.find((f) => f.slug === character.wildShapeSlug)?.nameFr ?? character.wildShapeSlug}</strong>
                      {' '}· {wildShapeDurationHours(character.level ?? 2)} h max
                    </span>
                    <button
                      onClick={() => setShapeStatBlock(character.wildShapeSlug)}
                      className="w-7 h-7 rounded-lg bg-white/70 hover:bg-white text-ink-600 border border-green-200 text-sm flex items-center justify-center transition-colors"
                      aria-label="Voir le bloc de stats de la forme"
                      title="Bloc de stats de la forme actuelle"
                    >
                      📜
                    </button>
                  </div>
                  <button onClick={revertShape} className="btn-secondary text-xs w-full py-1.5">
                    ↩ Revenir à la forme normale (action bonus)
                  </button>
                </>
              ) : (
                <>
                  <p className="text-xs text-green-800">
                    Bêtes jusqu'à DD {(() => { const cr = wildShapeMaxCR(character.level ?? 2, character.druidCircle); return cr === 0.25 ? '1/4' : cr === 0.5 ? '1/2' : cr; })()}
                    {character.druidCircle !== 'lune' && (character.level ?? 2) < 4 && ' · pas de nage'}
                    {character.druidCircle !== 'lune' && (character.level ?? 2) < 8 && ' · pas de vol'}
                    {(character.level ?? 2) >= 4 && character.druidCircle !== 'lune' && ' · nage'}
                    {(character.level ?? 2) >= 8 && character.druidCircle !== 'lune' && ' · vol'} — PV lancés aux dés de la forme.
                  </p>
                  {character.druidCircle === 'lune' && (
                    <p className="text-[10px] text-green-700">
                      🌙 Lune : transformation et retour en action bonus{((character.level ?? 2) >= 10) ? ' · formes élémentaires disponibles' : ''}
                      {((character.level ?? 2) >= 6) ? ' · attaques de bête magiques' : ''}.
                    </p>
                  )}
                  <button
                    onClick={openShapePicker}
                    disabled={(character.wildShapeUses ?? 2) <= 0}
                    className="btn-primary text-xs w-full py-1.5 disabled:opacity-40"
                  >
                    🐾 Prendre une forme
                  </button>
                </>
              )}
            </div>
          );
        })()}

        {/* Beast picker sheet (portal) */}
        {shapePickerOpen && createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
            onClick={() => setShapePickerOpen(false)}
          >
            <div
              className="card w-full sm:max-w-md rounded-b-none sm:rounded-2xl p-4 sheet-enter bg-white max-h-[80vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Choisir une forme"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-lg font-semibold">🐾 Choisir une forme</h3>
                <button onClick={() => setShapePickerOpen(false)} className="text-ink-400 hover:text-ink-700 text-lg leading-none px-1" aria-label="Fermer">✕</button>
              </div>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  className="input flex-1"
                  placeholder="Rechercher une bête…"
                  value={shapeSearch}
                  onChange={(e) => setShapeSearch(e.target.value)}
                  autoFocus
                />
                <button
                  onClick={() => setShapeSeenOnly((v) => !v)}
                  className={`shrink-0 px-3 rounded-lg border text-xs font-semibold transition-colors ${
                    shapeSeenOnly
                      ? 'bg-green-100 text-green-800 border-green-300'
                      : 'bg-parchment-100 text-ink-500 border-parchment-300'
                  }`}
                  aria-pressed={shapeSeenOnly}
                  title="Filtrer sur les bêtes déjà vues (SRD)"
                >
                  👁 Vues
                </button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-1.5 -mx-1 px-1">
                {shapeForms
                  .filter((f) => (!shapeSeenOnly || f.seen)
                    && (!shapeSearch.trim()
                      || (f.nameFr ?? f.name).toLowerCase().includes(shapeSearch.toLowerCase())))
                  .map((f) => (
                    <div
                      key={f.slug}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-parchment-200 ${f.seen ? 'bg-parchment-50' : 'bg-parchment-50/40'} transition-colors`}
                    >
                      <button
                        onClick={() => f.seen && takeShape(f.slug)}
                        disabled={!f.seen}
                        className={`min-w-0 flex-1 text-left ${f.seen ? 'hover:opacity-80' : 'cursor-not-allowed'}`}
                        title={f.seen ? 'Prendre cette forme' : 'Bête non vue — marquez-la 👁 pour pouvoir vous transformer'}
                      >
                        <span className={`text-sm font-medium block truncate ${f.seen ? 'text-ink-800' : 'text-ink-400'}`}>{f.nameFr ?? f.name}</span>
                        <span className="text-[10px] text-ink-400">
                          DD {f.challengeRating === 0.125 ? '1/8' : f.challengeRating === 0.25 ? '1/4' : f.challengeRating === 0.5 ? '1/2' : f.challengeRating}
                          {f.size ? ` · ${f.size}` : ''}{f.fly ? ' · 🦅 vol' : ''}{f.swim ? ' · 🏊 nage' : ''}
                          {!f.seen && ' · non vue'}
                        </span>
                      </button>
                      <span className="text-xs text-ink-500 shrink-0 text-right">
                        ❤ {f.hitPoints ?? '—'}<br />🛡 {f.armorClass ?? '—'}
                      </span>
                      <button
                        onClick={() => setShapeStatBlock(f.slug)}
                        className="shrink-0 w-8 h-8 rounded-lg bg-parchment-100 hover:bg-gold-100 text-ink-500 hover:text-gold-600 border border-parchment-200 text-sm flex items-center justify-center transition-colors"
                        aria-label={`Voir le bloc de stats de ${f.nameFr ?? f.name}`}
                        title="Bloc de stats"
                      >
                        📜
                      </button>
                      <button
                        onClick={() => toggleShapeSeen(f.slug, !!f.seen)}
                        className={`shrink-0 w-8 h-8 rounded-lg text-base flex items-center justify-center transition-colors ${
                          f.seen
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-parchment-200 text-ink-400 hover:bg-parchment-300'
                        }`}
                        aria-label={f.seen ? `Marquer ${f.nameFr ?? f.name} comme non vue` : `Marquer ${f.nameFr ?? f.name} comme vue`}
                        aria-pressed={f.seen}
                        title={f.seen ? 'Déjà vue — cliquer pour retirer' : 'Marquer comme vue'}
                      >
                        {f.seen ? '👁' : '⊘'}
                      </button>
                    </div>
                  ))}
                {shapeForms.length === 0 && (
                  <p className="text-sm text-ink-400 italic text-center py-4">Aucune forme disponible à ce niveau.</p>
                )}
                {shapeForms.length > 0 && shapeForms.every((f) => !f.seen) && shapeSeenOnly && (
                  <p className="text-xs text-ink-400 italic text-center py-3">
                    Aucune bête marquée comme vue — désactivez « Vues » et marquez-en avec 👁 (formes déjà rencontrées par votre druide).
                  </p>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
        <MonsterStatBlock
          open={!!shapeStatBlock}
          slug={shapeStatBlock}
          onClose={() => setShapeStatBlock(null)}
        />

        {(() => {
          const u = computeUnarmedStats(character);
                const abilityLabel = u.ability === 'dexterity' ? 'DEX' : 'FOR';
                return (
                  <div className="bg-parchment-100 rounded-lg px-3 py-2 border border-parchment-200 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-ink-800 truncate">✊ Frappe sans arme</span>
                      {u.monk && (
                        <span className="text-[10px] font-semibold text-indigo-600 shrink-0">Arts martiaux</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-50 text-red-800 text-[11px] font-medium border border-red-200"
                        title={`Attaque : d20 ${formatModifier(u.attackBonus - proficiencyBonus(character.level ?? 1))} (${abilityLabel}) + ${proficiencyBonus(character.level ?? 1)} (maîtrise)`}
                      >
                        🎯 {formatModifier(u.attackBonus)}
                      </span>
                      <span
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-orange-50 text-orange-800 text-[11px] font-medium border border-orange-200"
                        title={`Dégâts : ${u.damageStr} (${abilityLabel})`}
                      >
                        ⚔ {u.damageStr} {u.damageTypeFr}
                      </span>
                      {u.bonusActionAttack && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-50 text-indigo-700 text-[11px] font-medium border border-indigo-200"
                          title="Arts martiaux : une frappe sans arme supplémentaire en action bonus après une attaque"
                        >
                          ⚡ action bonus
                        </span>
                      )}
                    </div>
                  </div>
          );
        })()}
      </div>

      <div className="space-y-4">
          {/* Exhaustion tracker */}
          {/* HP tracker — while shaped it shows the beast's bar (routed server-side to wild_shape_hp) */}
      {character.wildShapeSlug ? (() => {
        const shapeHp = character.wildShapeHp ?? 0;
        const shapeMax = character.wildShapeMaxHp ?? 1;
        const commitShapeHp = async () => {
          if (shapeHpDraft === null) return;
          const n = Math.max(0, Math.round(Number(shapeHpDraft) || 0));
          setShapeHpDraft(null);
          if (n === shapeHp) return;
          markLocalMutation();
          try {
            await api.patch(`/api/characters/${charId}`, { currentHp: n });
            await onSaved();
          } catch { onError('Erreur'); }
        };
        return (
          <div className="rounded-xl border border-green-300 bg-green-50 p-3 space-y-2">
            <div className="text-xs font-semibold text-green-900">❤ PV — forme animale</div>
            <div className="h-4 bg-green-100 rounded-full overflow-hidden border border-green-200">
              <div
                className={`h-full rounded-full transition-all ${shapeHp <= 0 ? 'bg-red-600' : shapeHp <= shapeMax * 0.3 ? 'bg-orange-500' : 'bg-green-600'}`}
                style={{ width: `${Math.max(0, Math.min(100, (shapeHp / shapeMax) * 100))}%` }}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1">
                <input
                  type="number"
                  className="w-14 text-center text-sm font-bold bg-white border border-green-200 rounded-md py-1 focus:outline-none focus:border-green-500 text-green-900"
                  value={shapeHpDraft ?? String(shapeHp)}
                  onChange={(e) => setShapeHpDraft(e.target.value)}
                  onBlur={commitShapeHp}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  aria-label="Points de vie de la forme"
                />
                <span className="text-xs text-green-700">/ {shapeMax}</span>
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={async () => {
                    const n = Math.max(0, shapeHp - 1);
                    markLocalMutation();
                    try {
                      await api.patch(`/api/characters/${charId}`, { currentHp: n });
                      await onSaved();
                    } catch { onError('Erreur'); }
                  }}
                  className="w-7 h-7 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 text-sm font-medium flex items-center justify-center"
                  aria-label="Blesser la forme"
                >−</button>
                <button
                  onClick={async () => {
                    const n = shapeHp + 1;
                    markLocalMutation();
                    try {
                      await api.patch(`/api/characters/${charId}`, { currentHp: n });
                      await onSaved();
                    } catch { onError('Erreur'); }
                  }}
                  className="w-7 h-7 rounded-lg bg-green-100 hover:bg-green-200 text-green-700 text-sm font-medium flex items-center justify-center"
                  aria-label="Soigner la forme"
                >+</button>
              </div>
            </div>
            <p className="text-[10px] text-green-700 italic">À 0 PV : retour automatique à la forme normale, les dégâts excédentaires s'appliquent.</p>
          </div>
        );
      })() : (
        <HpTracker
          character={character}
          charId={charId}
          markLocalMutation={markLocalMutation}
          onSaved={onSaved}
          onError={onError}
          onConcentrationCheck={setConcCheck}
        />
      )}
      {concCheck && (
        <ConcentrationAlert
          check={concCheck}
          onDone={() => setConcCheck(null)}
          onBreak={() => patchCharacter({ concentrating: false }, 'Erreur de mise à jour')}
        />
      )}

      {/* Hit dice — spent on a short rest to heal */}
      {(() => {
        const classInfo = findClass(character.characterClass);
        const die = classInfo?.hitDie ?? 8;
        const total = character.level ?? 1;
        const used = character.hitDiceUsed ?? 0;
        const remaining = Math.max(0, total - used);
        const step = async (delta: number) => {
          markLocalMutation();
          try {
            await api.patch(`/api/characters/${charId}`, { hitDiceUsed: Math.min(total, Math.max(0, used + delta)) });
            await onSaved();
          } catch {
            onError('Erreur de mise à jour');
          }
        };
        return (
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-sm font-medium text-ink-700 flex items-center gap-1.5">
              🎲 Dés de vie
              <span className="text-xs font-normal text-ink-400">d{die}</span>
            </span>
            <span className="flex items-center gap-1">
              <button
                onClick={() => step(-1)}
                disabled={used <= 0}
                className="w-7 h-7 rounded-lg bg-parchment-200 hover:bg-parchment-300 disabled:opacity-30 text-sm font-medium flex items-center justify-center"
                aria-label="Récupérer un dé de vie"
                title="Récupérer un dé (repos long : niveau/2 dés, min 1)"
              >+</button>
              <span className={`text-sm font-bold tabular-nums ${remaining === 0 ? 'text-red-500' : 'text-ink-800'}`}>
                {remaining}
              </span>
              <span className="text-xs text-ink-400">/ {total}</span>
              <button
                onClick={() => step(1)}
                disabled={remaining <= 0}
                className="w-7 h-7 rounded-lg bg-parchment-200 hover:bg-parchment-300 disabled:opacity-30 text-sm font-medium flex items-center justify-center"
                aria-label="Dépenser un dé de vie"
                title="Dépenser un dé de vie (repos court)"
              >−</button>
            </span>
          </div>
        );
      })()}

      {/* Inspiration + Concentration toggles */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={async () => {
            markLocalMutation();
            try {
              await api.patch(`/api/characters/${charId}`, { inspiration: !character.inspiration });
              await onSaved();
            } catch { onError('Erreur'); }
          }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
            character.inspiration
              ? 'bg-gold-400/20 text-gold-500 border-gold-400'
              : 'bg-parchment-100 text-ink-400 border-parchment-300 hover:border-gold-400'
          }`}
          aria-pressed={character.inspiration}
          title="L'inspiration permet de relancer un d20 et de garder le meilleur résultat"
        >
          <span className="text-base">{character.inspiration ? '✨' : '✧'}</span>
          Inspiration
        </button>
        <button
          onClick={() => patchCharacter({ concentrating: !character.concentrating }, 'Erreur de mise à jour')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
            character.concentrating
              ? 'bg-indigo-100 text-indigo-700 border-indigo-400'
              : 'bg-parchment-100 text-ink-400 border-parchment-300 hover:border-indigo-400'
          }`}
          aria-pressed={character.concentrating}
          title="Tu concentres un sort. Si tu subis des dégâts : jet de sauvegarde de Constitution DD 10 ou ½ dégâts (le plus élevé) pour le maintenir."
        >
          <span className="text-base">{character.concentrating ? '🌀' : '◌'}</span>
          Concentration
        </button>
      </div>

      {/* Death saves — only shown at 0 HP */}
      {character.currentHp <= 0 && (
        <DeathSaveTracker character={character} charId={charId} markLocalMutation={markLocalMutation} onSaved={onSaved} onError={onError} />
      )}

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
          {foodCount > 0 && canEdit && (
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
          {fullWaterCount > 0 && canEdit && (
            <button
              onClick={() => consume('water')}
              className="text-xs px-2 py-1 rounded-lg bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors"
            >
              💧 Boire (×{fullWaterCount} pleines)
            </button>
          )}
          {emptyWaterCount > 0 && canEdit && (
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
    </section>
  );
}

function DeathSaveTracker({ character, charId, markLocalMutation, onSaved, onError }: {
  character: Character;
  charId: number;
  markLocalMutation: () => void;
  onSaved: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [successes, setSuccesses] = useState(character.deathSaveSuccesses ?? 0);
  const [failures, setFailures] = useState(character.deathSaveFailures ?? 0);

  useEffect(() => {
    setSuccesses(character.deathSaveSuccesses ?? 0);
    setFailures(character.deathSaveFailures ?? 0);
  }, [character.deathSaveSuccesses, character.deathSaveFailures]);

  const updateSaves = async (type: 'successes' | 'failures', value: number) => {
    const clamped = Math.max(0, Math.min(3, value));
    markLocalMutation();
    const field = type === 'successes' ? 'deathSaveSuccesses' : 'deathSaveFailures';
    try {
      await api.patch(`/api/characters/${charId}`, { [field]: clamped });
      await onSaved();
    } catch {
      onError('Erreur de mise à jour');
    }
  };

  const isDead = failures >= 3;
  const isStable = successes >= 3;

  return (
    <div className={`rounded-xl p-3 border ${isDead ? 'bg-red-50 border-red-300' : isStable ? 'bg-green-50 border-green-300' : 'bg-parchment-100 border-parchment-300'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-ink-700">💀 Jets de sauvegarde contre la mort</span>
        {isDead && <span className="text-xs font-bold text-red-600">MORT</span>}
        {isStable && <span className="text-xs font-bold text-green-600">STABLE</span>}
      </div>
      <div className="flex items-center justify-between gap-4">
        {/* Successes — tap a circle to toggle that position */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-green-600 font-medium w-12">Succès</span>
          <div className="flex items-center gap-1.5">
            {[0, 1, 2].map((i) => {
              const filled = i < successes;
              return (
                <button
                  key={i}
                  onClick={() => updateSaves('successes', filled ? i : i + 1)}
                  className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all ${
                    filled
                      ? 'bg-green-500 border-green-500 text-white'
                      : 'bg-white border-green-300 text-green-300 hover:border-green-500 hover:scale-110'
                  }`}
                  aria-label={`Succès ${i + 1}: ${filled ? 'coché' : 'vide'}`}
                >
                  ✓
                </button>
              );
            })}
          </div>
        </div>
        {/* Failures — tap a circle to toggle that position */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            {[0, 1, 2].map((i) => {
              const filled = i < failures;
              return (
                <button
                  key={i}
                  onClick={() => updateSaves('failures', filled ? i : i + 1)}
                  className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all ${
                    filled
                      ? 'bg-red-500 border-red-500 text-white'
                      : 'bg-white border-red-300 text-red-300 hover:border-red-500 hover:scale-110'
                  }`}
                  aria-label={`Échec ${i + 1}: ${filled ? 'coché' : 'vide'}`}
                >
                  ✗
                </button>
              );
            })}
          </div>
          <span className="text-xs text-red-600 font-medium w-12 text-right">Échecs</span>
        </div>
      </div>
    </div>
  );
}

function HpTracker({ character, charId, markLocalMutation, onSaved, onError, onConcentrationCheck }: {
  character: Character;
  charId: number;
  markLocalMutation: () => void;
  onSaved: () => Promise<void>;
  onError: (msg: string) => void;
  onConcentrationCheck: (check: ConcentrationCheck) => void;
}) {
  // Fields may be '' while the user is editing (input cleared).
  const [maxHp, setMaxHp] = useState<number | ''>(character.maxHp);
  const [currentHp, setCurrentHp] = useState<number | ''>(character.currentHp);
  const [tempHp, setTempHp] = useState<number | ''>(character.tempHp);

  useEffect(() => { setMaxHp(character.maxHp); }, [character.maxHp]);
  useEffect(() => { setCurrentHp(character.currentHp); }, [character.currentHp]);
  useEffect(() => { setTempHp(character.tempHp); }, [character.tempHp]);

  const patchFields = async (fields: Record<string, number>) => {
    markLocalMutation();
    try {
      const res = await api.patch(`/api/characters/${charId}`, fields);
      // Losing HP while concentrating requires a CON save — surface it immediately.
      if (res?.data?.concentrationCheck) onConcentrationCheck(res.data.concentrationCheck);
      await onSaved();
    } catch (err: any) {
      onError(err.response?.data?.error || 'Erreur');
    }
  };

  // +/− steppers: update the display instantly but debounce the PATCH by 1s.
  // A burst of clicks then produces a single before→after delta server-side,
  // so the concentration check (if any) fires once with the full damage.
  const pendingPatch = useRef<Record<string, number>>({});
  const patchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const schedulePatch = (field: string, value: number) => {
    pendingPatch.current[field] = value;
    if (patchTimer.current) clearTimeout(patchTimer.current);
    patchTimer.current = setTimeout(() => {
      patchTimer.current = null;
      const fields = pendingPatch.current;
      pendingPatch.current = {};
      patchFields(fields);
    }, 1000);
  };

  // Commit an input on blur: empty (or invalid) → 0 (1 for max HP),
  // and supersede any pending debounced update for that field.
  const commit = (field: 'currentHp' | 'maxHp' | 'tempHp', raw: number | '', setter: (n: number) => void) => {
    const min = field === 'maxHp' ? 1 : 0;
    const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.max(min, raw) : min;
    setter(n);
    delete pendingPatch.current[field];
    if (n !== character[field]) patchFields({ [field]: n });
  };

  // Don't lose a pending debounced change if the user navigates away.
  useEffect(() => () => {
    if (patchTimer.current) clearTimeout(patchTimer.current);
    const fields = pendingPatch.current;
    if (Object.keys(fields).length > 0) {
      api.patch(`/api/characters/${charId}`, fields).catch(() => {});
    }
  }, [charId]);

  const curNum = currentHp === '' ? 0 : currentHp;
  const maxNum = typeof maxHp === 'number' && maxHp > 0 ? maxHp : character.maxHp;
  const tempNum = tempHp === '' ? 0 : tempHp;
  const hpColor = curNum <= 0 ? 'text-red-600' : curNum <= maxNum * 0.3 ? 'text-red-500' : curNum <= maxNum * 0.5 ? 'text-orange-500' : 'text-green-600';
  const hpPct = maxNum > 0 ? Math.min(100, (curNum / maxNum) * 100) : 0;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-sm font-medium text-ink-700">❤️ PV</span>

      {/* Current HP */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => { const n = Math.max(0, curNum - 1); setCurrentHp(n); schedulePatch('currentHp', n); }}
          className="w-7 h-7 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 text-sm font-medium flex items-center justify-center"
          aria-label="Blesser"
        >−</button>
        <input
          type="number"
          className={`w-14 text-center text-sm font-bold bg-white border border-parchment-300 rounded-md py-1 focus:outline-none focus:border-blood-500 ${hpColor}`}
          value={currentHp}
          onChange={(e) => setCurrentHp(e.target.value === '' ? '' : Number(e.target.value) || 0)}
          onBlur={() => commit('currentHp', currentHp, setCurrentHp)}
          aria-label="Points de vie actuels"
        />
        <button
          onClick={() => { const n = Math.min(maxNum, curNum + 1); setCurrentHp(n); schedulePatch('currentHp', n); }}
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
          onChange={(e) => setMaxHp(e.target.value === '' ? '' : Number(e.target.value) || 0)}
          onBlur={() => commit('maxHp', maxHp, setMaxHp)}
          aria-label="Points de vie maximum"
        />
      </label>

      {/* Temp HP — editable with add/remove */}
      <label className="flex items-center gap-1">
        <span className="text-xs text-ink-400">PV temp</span>
        <button
          onClick={() => { const n = Math.max(0, tempNum - 1); setTempHp(n); schedulePatch('tempHp', n); }}
          disabled={tempNum <= 0}
          className="w-6 h-6 rounded bg-blue-100 hover:bg-blue-200 disabled:opacity-30 text-blue-700 text-xs flex items-center justify-center"
          aria-label="Retirer 1 PV temp"
        >−</button>
        <input
          type="number"
          className={`w-12 text-center text-sm font-medium bg-white border border-parchment-300 rounded-md py-1 focus:outline-none focus:border-blood-500 ${tempNum > 0 ? 'text-blue-700' : 'text-ink-400'}`}
          value={tempHp}
          min={0}
          onChange={(e) => setTempHp(e.target.value === '' ? '' : Math.max(0, Number(e.target.value) || 0))}
          onBlur={() => commit('tempHp', tempHp, setTempHp)}
          aria-label="Points de vie temporaires"
        />
        <button
          onClick={() => { const n = tempNum + 1; setTempHp(n); schedulePatch('tempHp', n); }}
          className="w-6 h-6 rounded bg-blue-100 hover:bg-blue-200 text-blue-700 text-xs flex items-center justify-center"
          aria-label="Ajouter 1 PV temp"
        >+</button>
      </label>
      {tempNum > 0 && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
          +{tempNum}
        </span>
      )}

      {/* HP bar */}
      <div className="flex-1 min-w-[80px] h-2 bg-parchment-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${curNum <= 0 ? 'bg-red-700' : curNum <= maxNum * 0.3 ? 'bg-red-500' : curNum <= maxNum * 0.5 ? 'bg-orange-400' : 'bg-green-500'}`}
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

