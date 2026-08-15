/**
 * Sorts tab — spell slots tracker, known/prepared spells, spell catalog browser.
 */
import { useState, useEffect, useCallback } from 'react';
import api from '../api';
import { BottomSheet } from '../components/ui';
import CastSpellSheet from '../components/CastSpellSheet';
import {
  type Character,
  type Spell,
  type CharacterSpell,
  type SpellSchool,
  type SpellcastingType,
  type ClassInfo,
  SPELL_SCHOOL_LABELS_FR,
  DND_CLASSES,
  ABILITY_LABELS_FR,
  ABILITY_SHORT_FR,
  abilityModifier,
  proficiencyBonus,
  spellSaveDC,
  formatModifier,
  maxSpellSlots,
  findClass,
  computePreparedSpellsLimit,
} from '@dnd-inventory/shared';

interface Props {
  character: Character;
  charId: number;
  onSaved: () => Promise<void>;
  onError: (msg: string) => void;
}

type DomainSpell = Spell & { domainLevel: number };

const PAGE_SIZE = 30;

// School colors for badges
const SCHOOL_COLORS: Record<string, string> = {
  abjuration: 'bg-blue-100 text-blue-800',
  conjuration: 'bg-amber-100 text-amber-800',
  divination: 'bg-purple-100 text-purple-800',
  enchantment: 'bg-pink-100 text-pink-800',
  evocation: 'bg-red-100 text-red-800',
  illusion: 'bg-gray-100 text-gray-700',
  necromancy: 'bg-green-100 text-green-800',
  transmutation: 'bg-orange-100 text-orange-800',
};

export default function CharacterSpellsTab({ character, charId, onSaved, onError }: Props) {
  const [charSpells, setCharSpells] = useState<CharacterSpell[]>([]);
  const [loadingSpells, setLoadingSpells] = useState(true);
  const [domainSpells, setDomainSpells] = useState<DomainSpell[]>([]);

  // Catalog browser
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [catalogLevel, setCatalogLevel] = useState<string>('');
  const [catalogSchool, setCatalogSchool] = useState<string>('');
  const [catalogClass, setCatalogClass] = useState<string>(character.characterClass ?? '');
  const [catalogSpells, setCatalogSpells] = useState<Spell[]>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogOffset, setCatalogOffset] = useState(0);
  const [addingSpellId, setAddingSpellId] = useState<number | null>(null);

  // Expanded spell detail (by character_spell link id or catalog spell id)
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Casting: the spell currently in the cast sheet
  const [castingSpell, setCastingSpell] = useState<Spell | null>(null);

  const classInfo = findClass(character.characterClass);
  const castingType: SpellcastingType = classInfo?.spellcasting ?? 'none';
  const isCaster = castingType !== 'none';

  const level = character.level ?? 1;
  const profBonus = proficiencyBonus(level);
  const castingAbility = classInfo?.spellcastingAbility;
  const castingMod = isCaster && castingAbility
    ? abilityModifier((character[castingAbility as keyof Character] as number) ?? 10)
    : 0;

  const slots = isCaster ? maxSpellSlots(level, castingType) : [0,0,0,0,0,0,0,0,0];
  const slotsUsed = character.spellSlotsUsed ?? [0,0,0,0,0,0,0,0,0];

  // Spell preparation limit (classes that prepare: Magicien, Clerc, Druide, Paladin, Rôdeur, Artificier)
  const preparedLimit = classInfo && castingAbility
    ? computePreparedSpellsLimit(classInfo, level, (character[castingAbility as keyof Character] as number) ?? 10)
    : null;
  // Domain spells are always prepared and don't count against the limit
  const domainIds = new Set(domainSpells.map((sp) => sp.id));
  const preparedCount = charSpells.filter((cs) => cs.prepared && !domainIds.has(cs.spell.id)).length;

  // Fetch character's known spells
  const fetchCharSpells = useCallback(async () => {
    try {
      const res = await api.get(`/api/characters/${charId}/spells`);
      // API returns { spells: CharacterSpell[] } — extract the array
      const data = res.data?.spells ?? res.data ?? [];
      setCharSpells(Array.isArray(data) ? data : []);
    } catch {
      // Character might not have spells endpoint yet
    } finally {
      setLoadingSpells(false);
    }
  }, [charId]);

  useEffect(() => {
    fetchCharSpells();
  }, [fetchCharSpells]);

  // Divine domain spells (always prepared, derived — refetched with the character)
  const isCleric = findClass(character.characterClass)?.name === 'Clerc';
  const divineDomain = character.divineDomain ?? null;
  useEffect(() => {
    if (!isCleric || !divineDomain) { setDomainSpells([]); return; }
    let alive = true;
    api.get(`/api/characters/${charId}/domain-spells`)
      .then((res) => { if (alive) setDomainSpells(res.data.spells ?? []); })
      .catch(() => { if (alive) setDomainSpells([]); });
    return () => { alive = false; };
  }, [isCleric, divineDomain, charId, character.level]);

  // Debounce search input (same pattern as items catalog)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(catalogSearch), 300);
    return () => clearTimeout(t);
  }, [catalogSearch]);

  // Fetch catalog with filters
  const fetchCatalog = useCallback(async (offset = 0) => {
    setCatalogLoading(true);
    try {
      const params: Record<string, string | number> = { limit: PAGE_SIZE, offset };
      if (catalogClass) params.class = catalogClass;
      if (catalogLevel !== '') params.level = catalogLevel;
      if (catalogSchool) params.school = catalogSchool;
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      const res = await api.get('/api/spells', { params });
      setCatalogSpells(res.data.spells);
      setCatalogTotal(res.data.total);
      setCatalogOffset(offset);
    } catch {
      setCatalogSpells([]);
      setCatalogTotal(0);
    } finally {
      setCatalogLoading(false);
    }
  }, [catalogClass, catalogLevel, catalogSchool, debouncedSearch]);

  // Only fetch when there's a search query or active filters — don't preload all spells
  const hasQuery = !!(debouncedSearch.trim() || catalogLevel !== '' || catalogSchool || catalogClass);

  useEffect(() => {
    if (hasQuery) {
      fetchCatalog(0);
    } else {
      setCatalogSpells([]);
      setCatalogTotal(0);
    }
  }, [fetchCatalog, hasQuery]);

  const addSpell = async (spellId: number) => {
    setAddingSpellId(spellId);
    try {
      await api.post(`/api/characters/${charId}/spells`, { spellId });
      await fetchCharSpells();
      await onSaved();
    } catch (err) {
      onError(err instanceof Error && err.message.includes('UNIQUE')
        ? 'Sort déjà connu'
        : 'Erreur lors de l\'ajout du sort');
    } finally {
      setAddingSpellId(null);
    }
  };

  const removeSpell = async (linkId: number) => {
    try {
      await api.delete(`/api/character-spells/${linkId}`);
      await fetchCharSpells();
      await onSaved();
    } catch {
      onError('Erreur lors de la suppression');
    }
  };

  const togglePrepared = async (linkId: number, prepared: boolean) => {
    try {
      await api.patch(`/api/character-spells/${linkId}`, { prepared: !prepared });
      await fetchCharSpells();
    } catch {
      onError('Erreur de mise à jour');
    }
  };

  const spendSlot = async (spellLevel: number) => {
    // spellLevel is 1-9 (index 0 = level 1)
    const idx = spellLevel - 1;
    const used = [...slotsUsed];
    if (used[idx] >= slots[idx]) return;
    used[idx] = used[idx] + 1;
    try {
      await api.patch(`/api/characters/${charId}`, { spellSlotsUsed: used });
      await onSaved();
    } catch {
      onError('Erreur de mise à jour');
    }
  };

  const restoreSlot = async (spellLevel: number) => {
    const idx = spellLevel - 1;
    const used = [...slotsUsed];
    if (used[idx] <= 0) return;
    used[idx] = used[idx] - 1;
    try {
      await api.patch(`/api/characters/${charId}`, { spellSlotsUsed: used });
      await onSaved();
    } catch {
      onError('Erreur de mise à jour');
    }
  };

  const restoreAll = async () => {
    try {
      await api.patch(`/api/characters/${charId}`, { spellSlotsUsed: [0,0,0,0,0,0,0,0,0] });
      await onSaved();
    } catch {
      onError('Erreur de mise à jour');
    }
  };

  /**
   * Cast a spell at the chosen level: consume one slot of that level (unless
   * cast as a ritual — no slot, +10 min) and, for concentration spells, take
   * over the concentration flag (breaking any spell already concentrated on).
   */
  const castSpell = async (level: number, ritual = false) => {
    if (!castingSpell) return;
    const fields: Record<string, unknown> = {};
    if (level > 0 && !ritual) {
      const used = [...slotsUsed];
      if (used[level - 1] >= (slots[level - 1] ?? 0)) return;
      used[level - 1] = used[level - 1] + 1;
      fields.spellSlotsUsed = used;
    }
    if (castingSpell.concentration) fields.concentrating = true;
    if (Object.keys(fields).length > 0) {
      try {
        await api.patch(`/api/characters/${charId}`, fields);
        await onSaved();
      } catch {
        onError('Erreur lors du lancement');
      }
    }
    setCastingSpell(null);
  };

  // Group spells by level — prepared spells first, then alphabetical.
  // Domain spells (not already in the spellbook) join as always-prepared rows.
  const knownIds = new Set(charSpells.map((cs) => cs.spell.id));
  const domainOnly: CharacterSpell[] = domainSpells
    .filter((sp) => !knownIds.has(sp.id))
    .map((sp) => ({
      id: 1_000_000 + sp.id, // synthetic link id, never in the DB
      characterId: Number(charId),
      spell: sp,
      prepared: true,
      sortOrder: 0,
      addedAt: '',
    }));
  const spellsByLevel = [0,1,2,3,4,5,6,7,8,9].map((lvl) => ({
    level: lvl,
    spells: [...charSpells, ...domainOnly].filter((cs) => cs.spell.level === lvl)
      .sort((a, b) =>
        Number(b.prepared) - Number(a.prepared) ||
        (a.spell.nameFr ?? a.spell.name).localeCompare(b.spell.nameFr ?? b.spell.name, 'fr'),
      ),
  })).filter((g) => g.spells.length > 0);

  if (!isCaster && charSpells.length === 0) {
    return (
      <div className="card p-8 text-center space-y-3">
        <p className="text-4xl">✨</p>
        <p className="text-ink-500">Cette classe ne lance pas de sorts.</p>
        <p className="text-xs text-ink-400">
          Définissez une classe de lanceur de sorts dans l'onglet Caractéristiques pour accéder aux sorts.
        </p>
      </div>
    );
  }

  // Shared catalog props
  const catalogProps = {
    spells: catalogSpells,
    total: catalogTotal,
    loading: catalogLoading,
    offset: catalogOffset,
    search: catalogSearch,
    level: catalogLevel,
    school: catalogSchool,
    selectedClass: catalogClass,
    addingSpellId,
    knownSpellIds: new Set(charSpells.map((cs) => cs.spell.id)),
    castingMod,
    profBonus,
    isCaster,
    charLevel: level,
    onSearch: setCatalogSearch,
    onLevel: setCatalogLevel,
    onSchool: setCatalogSchool,
    onClass: setCatalogClass,
    onAdd: addSpell,
    onLoadMore: () => fetchCatalog(catalogOffset + PAGE_SIZE),
  };

  return (
    <div className="space-y-4">
      {/* Spell slots tracker */}
      {isCaster && (
        <section className="card p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Emplacements de sort</h2>
            <button
              onClick={restoreAll}
              className="text-xs text-blood-600 hover:underline"
            >
              ↻ Restaurer tout
            </button>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
            {slots.map((maxSlots, i) => {
              if (maxSlots === 0) return null;
              const spellLevel = i + 1;
              const used = slotsUsed[i] ?? 0;
              const remaining = maxSlots - used;
              return (
                <div key={spellLevel} className="bg-parchment-100 rounded-xl p-2.5 text-center">
                  <div className="text-xs font-semibold text-ink-500 mb-1">Niv. {spellLevel}</div>
                  <div className="flex items-center justify-center gap-1.5">
                    <button
                      onClick={() => restoreSlot(spellLevel)}
                      disabled={used <= 0}
                      className="w-6 h-6 rounded-md bg-parchment-200 hover:bg-parchment-300 disabled:opacity-30 text-sm font-medium flex items-center justify-center transition-colors"
                      aria-label={`Restaurer un emplacement de niveau ${spellLevel}`}
                    >−</button>
                    <span className={`text-lg font-bold tabular-nums ${remaining === 0 ? 'text-red-500' : 'text-ink-800'}`}>
                      {remaining}
                    </span>
                    <button
                      onClick={() => spendSlot(spellLevel)}
                      disabled={remaining <= 0}
                      className="w-6 h-6 rounded-md bg-parchment-200 hover:bg-parchment-300 disabled:opacity-30 text-sm font-medium flex items-center justify-center transition-colors"
                      aria-label={`Dépenser un emplacement de niveau ${spellLevel}`}
                    >+</button>
                  </div>
                  <div className="text-xs text-ink-400 mt-0.5">/ {maxSlots}</div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Two-column layout on desktop: known spells (left) + catalog (right) */}
      <div className="grid lg:grid-cols-[3fr_2fr] gap-4 items-start min-w-0">
        {/* Known spells */}
        <section className="card p-4 sm:p-5 space-y-3 min-w-0">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold flex items-center gap-2">
              Sorts connus <span className="text-ink-400 text-sm font-normal">({charSpells.length})</span>
              {preparedLimit !== null && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  preparedCount > preparedLimit
                    ? 'bg-red-100 text-red-700 border border-red-200'
                    : 'bg-blood-50 text-blood-700 border border-blood-200'
                }`}>
                  {preparedCount} / {preparedLimit} préparés
                </span>
              )}
            </h2>
            {/* Mobile: open catalog as bottom sheet */}
            <button
              onClick={() => setCatalogOpen(true)}
              className="btn-primary text-sm px-3 py-1.5 lg:hidden"
            >
              + Ajouter
            </button>
          </div>

          {loadingSpells ? (
            <p className="text-sm text-ink-400 animate-pulse">Chargement…</p>
          ) : spellsByLevel.length === 0 ? (
            <p className="text-sm text-ink-400 italic">Aucun sort. {typeof window !== 'undefined' && window.innerWidth >= 1024 ? 'Parcourez le grimoire →' : 'Cliquez sur « Ajouter » pour parcourir le grimoire.'}</p>
          ) : (
            <div className="space-y-3">
              {spellsByLevel.map((group) => (
                <div key={group.level}>
                  <div className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-1.5">
                    {group.level === 0 ? 'Tours de magie' : `Niveau ${group.level}`}
                  </div>
                  <ul className="space-y-1.5">
                    {group.spells.map((cs) => {
                      const spell = cs.spell;
                      const isExpanded = expandedId === cs.id;
                      const name = spell.nameFr ?? spell.name;
                      return (
                        <li key={cs.id} className="bg-parchment-50 rounded-lg border border-parchment-200 overflow-hidden">
                          <div className="flex items-center gap-2 p-2.5">
                            {domainIds.has(cs.spell.id) ? (
                              <span
                                className="text-lg shrink-0 text-gold-500"
                                title="Sort de domaine — toujours préparé, ne compte pas dans la limite"
                                aria-label="Sort de domaine toujours préparé"
                              >
                                ◆
                              </span>
                            ) : (
                              <button
                                onClick={() => togglePrepared(cs.id, cs.prepared)}
                                className={`text-lg shrink-0 ${cs.prepared ? 'text-gold-400' : 'text-parchment-300 hover:text-parchment-400'}`}
                                aria-label={cs.prepared ? 'Sort préparé' : 'Sort non préparé'}
                                title={cs.prepared ? 'Préparé' : 'Non préparé'}
                              >
                                {cs.prepared ? '★' : '☆'}
                              </button>
                            )}
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : cs.id)}
                              className="min-w-0 flex-1 text-left"
                              aria-expanded={isExpanded}
                            >
                              <span className="font-medium text-sm text-ink-800 block truncate">{name}</span>
                              <span className="flex items-center gap-1.5 text-xs text-ink-400 min-w-0">
                                {spell.concentration && (
                                  <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-700 border border-indigo-200">
                                    🌀 Concentration
                                  </span>
                                )}
                                {spell.ritual && (
                                  <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 border border-purple-200">
                                    ⚗ Rituel
                                  </span>
                                )}
                                <span className="truncate min-w-0">{spell.castingTime}</span>
                              </span>
                            </button>
                            <button
                              onClick={() => setCastingSpell(spell)}
                              className="text-sm shrink-0 px-1.5 py-1 rounded-md bg-parchment-100 hover:bg-gold-100 text-ink-500 hover:text-gold-600 border border-parchment-200 transition-colors"
                              aria-label={`Lancer ${name}`}
                              title="Lancer le sort"
                            >
                              🪄
                            </button>
                            {!domainIds.has(cs.spell.id) && (
                              <button
                                onClick={() => removeSpell(cs.id)}
                                className="text-ink-300 hover:text-red-500 text-sm shrink-0 px-1"
                                aria-label={`Oublier ${name}`}
                              >
                                ×
                              </button>
                            )}
                          </div>
                          {isExpanded && (
                            <div className="px-3 pb-3 pt-1 border-t border-parchment-200 text-xs text-ink-600 space-y-1.5">
                              {spell.descriptionFr ?? spell.description}
                              {spell.higherLevelFr && (
                                <p className="text-ink-400 italic"><strong>Aux niveaux supérieurs :</strong> {spell.higherLevelFr}</p>
                              )}
                              <SpellStatBadges
                                spell={spell}
                                castingMod={castingMod}
                                profBonus={profBonus}
                                isCaster={isCaster}
                                charLevel={level}
                              />
                              {/* All carac chips on one bottom line */}
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                <span className={`px-2 py-1 rounded-md text-[10px] font-medium ${SCHOOL_COLORS[spell.school] ?? 'bg-parchment-200'}`}>
                                  {SPELL_SCHOOL_LABELS_FR[spell.school as SpellSchool] ?? spell.school}
                                </span>
                                {spell.ritual && (
                                  <span className="px-2 py-1 rounded-md bg-purple-100 text-purple-800 text-[10px] font-semibold border border-purple-300">
                                    ⚗ Rituel
                                  </span>
                                )}
                                {spell.castingTime && (
                                  <span className="px-2 py-1 rounded-md bg-parchment-100 border border-parchment-200 text-ink-600 text-[10px] font-medium max-w-full text-left">
                                    ⏱ {spell.castingTime}
                                  </span>
                                )}
                                {spell.rangeText && (
                                  <span className="px-2 py-1 rounded-md bg-parchment-100 border border-parchment-200 text-ink-600 text-[10px] font-medium max-w-full text-left">
                                    📡 {spell.rangeText}
                                  </span>
                                )}
                                {(spell.duration || spell.concentration) && (
                                  <span className={`px-2 py-1 rounded-md text-[10px] font-semibold max-w-full text-left ${
                                    spell.concentration
                                      ? 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                                      : 'bg-parchment-100 border border-parchment-200 text-ink-600 font-medium'
                                  }`}>
                                    {spell.concentration ? '🌀' : '⏳'} {spell.duration ?? 'Concentration'}
                                  </span>
                                )}
                                <span className="px-2 py-1 rounded-md bg-parchment-100 border border-parchment-200 text-ink-600 text-[10px] font-medium max-w-full text-left">
                                  📝 {spell.components.join(', ') || '—'}
                                </span>
                              </div>
                              {spell.material && (
                                <p className="text-ink-400 truncate">💎 {spell.material}</p>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Desktop: catalog panel always visible on the right */}
        <section className="hidden lg:block space-y-3">
          <h2 className="font-display text-lg font-semibold">Grimoire</h2>
          <div className="card p-4 space-y-3 max-h-[70vh] overflow-y-auto">
            <SpellCatalog {...catalogProps} />
          </div>
        </section>
      </div>

      {/* Mobile: catalog as bottom sheet */}
      <BottomSheet open={catalogOpen} onClose={() => setCatalogOpen(false)} title="Grimoire">
        <SpellCatalog {...catalogProps} />
      </BottomSheet>

      {/* Cast sheet (portal — works above any stacking context) */}
      {castingSpell && (
        <CastSpellSheet
          spell={castingSpell}
          slots={slots}
          slotsUsed={slotsUsed}
          castingMod={castingMod}
          profBonus={profBonus}
          charLevel={level}
          concentrating={!!character.concentrating}
          onClose={() => setCastingSpell(null)}
          onCast={castSpell}
        />
      )}
    </div>
  );
}

// ---------- Damage type translations (English → French) ----------
const DAMAGE_TYPE_FR: Record<string, string> = {
  fire: 'feu', cold: 'froid', lightning: 'foudre', thunder: 'tonnerre',
  acid: 'acide', poison: 'poison', necrotic: 'nécrotique', radiant: 'radiant',
  force: 'force', psychic: 'psychique', bludgeoning: 'contondant',
  piercing: 'perforant', slashing: 'tranchant',
};

// DC success type labels
const DC_SUCCESS_FR: Record<string, string> = {
  none: 'Aucun effet en cas de réussite',
  half: 'Moitié des dégâts en cas de réussite',
  other: 'Effet réduit en cas de réussite',
};

/** Parse JSON safely, returning null on failure. */
function safeParse<T>(json: string | null): T | null {
  if (!json) return null;
  try { return JSON.parse(json) as T; } catch { return null; }
}

/** Compute damage dice string for a spell based on character level / spell level. */
function computeDamageDice(spell: Spell, charLevel: number): string | null {
  const dmg = safeParse<{
    damage_type?: { index?: string; name?: string };
    damage_at_slot_level?: Record<string, string>;
    damage_at_character_level?: Record<string, string>;
  }>(spell.damageJson);
  if (!dmg) return null;

  let dice: string | null = null;
  const damageType = dmg.damage_type?.index ?? '';

  if (dmg.damage_at_character_level) {
    // Cantrip — scale with character level. Pick highest key ≤ charLevel.
    const levels = Object.keys(dmg.damage_at_character_level).map(Number).sort((a, b) => a - b);
    const applicable = levels.filter((l) => l <= charLevel);
    const key = applicable.length > 0 ? applicable[applicable.length - 1] : levels[0];
    dice = dmg.damage_at_character_level[String(key)] ?? null;
  } else if (dmg.damage_at_slot_level) {
    // Slotted spell — show dice at the spell's base level (first key).
    const firstKey = Object.keys(dmg.damage_at_slot_level).sort((a, b) => Number(a) - Number(b))[0];
    dice = firstKey ? dmg.damage_at_slot_level[firstKey] : null;
  }

  if (!dice) return null;
  const typeFr = DAMAGE_TYPE_FR[damageType] ?? damageType ?? '';
  return `${dice}${typeFr ? ' ' + typeFr : ''}`;
}

/** Render spell stat badges: save DC, attack bonus, damage — computed from character stats. */
function SpellStatBadges({
  spell,
  castingMod,
  profBonus,
  isCaster,
  charLevel,
}: {
  spell: Spell;
  castingMod: number;
  profBonus: number;
  isCaster: boolean;
  charLevel: number;
}) {
  if (!isCaster) return null;

  const dc = safeParse<{
    dc_type?: { index?: string; name?: string };
    dc_success?: string;
  }>(spell.dcJson);

  const damageDice = computeDamageDice(spell, charLevel);
  const attackBonus = castingMod + profBonus;
  const dcValue = spellSaveDC(castingMod, profBonus);

  // No relevant data to show
  if (!dc && !spell.attackType && !damageDice) return null;

  return (
    <div className="flex flex-wrap gap-1.5 pt-1.5">
      {dc && (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-800 text-[11px] font-medium border border-blue-200">
          🛡 DD {dcValue}
          {dc.dc_type?.index && (
            <span className="text-blue-500">
              · {ABILITY_SHORT_FR[dc.dc_type.index as keyof typeof ABILITY_SHORT_FR] ?? dc.dc_type.index.toUpperCase()}
            </span>
          )}
          {dc.dc_success && dc.dc_success !== 'none' && (
            <span className="text-blue-400">
              · {DC_SUCCESS_FR[dc.dc_success] ?? ''}
            </span>
          )}
        </span>
      )}
      {spell.attackType && (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-50 text-red-800 text-[11px] font-medium border border-red-200">
          🎯 {formatModifier(attackBonus)}
          <span className="text-red-500">
            · {spell.attackType === 'ranged' ? 'Distance' : 'Corps à corps'}
          </span>
        </span>
      )}
      {damageDice && (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-orange-50 text-orange-800 text-[11px] font-medium border border-orange-200">
          ⚔ {damageDice}
        </span>
      )}
    </div>
  );
}

// ---------- Spell catalog browser ----------

function SpellCatalog({
  spells,
  total,
  loading,
  offset,
  search,
  level,
  school,
  selectedClass,
  addingSpellId,
  knownSpellIds,
  castingMod,
  profBonus,
  isCaster,
  charLevel,
  onSearch,
  onLevel,
  onSchool,
  onClass,
  onAdd,
  onLoadMore,
}: {
  spells: Spell[];
  total: number;
  loading: boolean;
  offset: number;
  search: string;
  level: string;
  school: string;
  selectedClass: string;
  addingSpellId: number | null;
  knownSpellIds: Set<number>;
  castingMod: number;
  profBonus: number;
  isCaster: boolean;
  charLevel: number;
  onSearch: (v: string) => void;
  onLevel: (v: string) => void;
  onSchool: (v: string) => void;
  onClass: (v: string) => void;
  onAdd: (id: number) => void;
  onLoadMore: () => void;
}) {
  const [expandedSpellId, setExpandedSpellId] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="space-y-2">
        <input
          type="text"
          className="input"
          placeholder="Rechercher un sort…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
        <select
          className="input py-1.5 text-sm w-full"
          value={selectedClass}
          onChange={(e) => onClass(e.target.value)}
          aria-label="Filtrer par classe"
        >
          <option value="">Toutes classes</option>
          {DND_CLASSES.map((c) => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <select
            className="input py-1.5 text-sm flex-1"
            value={level}
            onChange={(e) => onLevel(e.target.value)}
            aria-label="Filtrer par niveau"
          >
            <option value="">Tous niveaux</option>
            {[0,1,2,3,4,5,6,7,8,9].map((l) => (
              <option key={l} value={String(l)}>{l === 0 ? 'Tours de magie' : `Niveau ${l}`}</option>
            ))}
          </select>
          <select
            className="input py-1.5 text-sm flex-1"
            value={school}
            onChange={(e) => onSchool(e.target.value)}
            aria-label="Filtrer par école"
          >
            <option value="">Toutes écoles</option>
            {Object.entries(SPELL_SCHOOL_LABELS_FR).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <p className="text-sm text-ink-400 animate-pulse text-center py-4">Chargement…</p>
      ) : spells.length === 0 ? (
        search.trim() || level !== '' || school ? (
          <p className="text-sm text-ink-400 italic text-center py-4">Aucun sort trouvé.</p>
        ) : (
          <div className="text-center py-8 space-y-1">
            <p className="text-3xl">📝</p>
            <p className="text-sm text-ink-400">Recherchez un sort</p>
            <p className="text-xs text-ink-400">Tapez le nom d'un sort ou filtrez par niveau/école.</p>
          </div>
        )
      ) : (
        <>
          <p className="text-xs text-ink-400">{total} sort(s)</p>
          <ul className="space-y-1.5">
            {spells.map((spell) => {
              const isExpanded = expandedSpellId === spell.id;
              const isKnown = knownSpellIds.has(spell.id);
              const name = spell.nameFr ?? spell.name;
              return (
                <li key={spell.id} className="bg-parchment-50 rounded-lg border border-parchment-200 overflow-hidden">
                  <div className="flex items-center gap-2 p-2.5">
                    <button
                      onClick={() => setExpandedSpellId(isExpanded ? null : spell.id)}
                      className="min-w-0 flex-1 text-left"
                      aria-expanded={isExpanded}
                    >
                      <span className="font-medium text-sm text-ink-800 block truncate">{name}</span>
                      <span className="flex items-center gap-1.5 text-xs text-ink-400 min-w-0">
                        <span className="shrink-0">{spell.level === 0 ? 'Tour' : `Niv. ${spell.level}`}</span>
                        {spell.concentration && (
                          <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-700 border border-indigo-200">
                            🌀 Concentration
                          </span>
                        )}
                        {spell.ritual && (
                          <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 border border-purple-200">
                            ⚗ Rituel
                          </span>
                        )}
                      </span>
                    </button>
                    <button
                      onClick={() => onAdd(spell.id)}
                      disabled={isKnown || addingSpellId === spell.id}
                      className="text-xs px-2.5 py-1.5 rounded-lg bg-blood-600 text-white hover:bg-blood-700 disabled:opacity-40 disabled:cursor-not-allowed shrink-0 transition-colors"
                    >
                      {isKnown ? '✓' : addingSpellId === spell.id ? '…' : '+ Ajouter'}
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="px-3 pb-3 pt-1 border-t border-parchment-200 text-xs text-ink-600 space-y-1.5">
                      <p>{spell.descriptionFr ?? spell.description}</p>
                      {spell.higherLevelFr && (
                        <p className="text-ink-400 italic"><strong>Aux niveaux supérieurs :</strong> {spell.higherLevelFr}</p>
                      )}
                      <SpellStatBadges
                        spell={spell}
                        castingMod={castingMod}
                        profBonus={profBonus}
                        isCaster={isCaster}
                        charLevel={charLevel}
                      />
                      {/* All carac chips on one bottom line */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <span className={`px-2 py-1 rounded-md text-[10px] font-medium ${SCHOOL_COLORS[spell.school] ?? 'bg-parchment-200'}`}>
                          {SPELL_SCHOOL_LABELS_FR[spell.school as SpellSchool] ?? spell.school}
                        </span>
                        {spell.ritual && (
                          <span className="px-2 py-1 rounded-md bg-purple-100 text-purple-800 text-[10px] font-semibold border border-purple-300">
                            ⚗ Rituel
                          </span>
                        )}
                        {spell.castingTime && (
                          <span className="px-2 py-1 rounded-md bg-parchment-100 border border-parchment-200 text-ink-600 text-[10px] font-medium max-w-full text-left">
                            ⏱ {spell.castingTime}
                          </span>
                        )}
                        {spell.rangeText && (
                          <span className="px-2 py-1 rounded-md bg-parchment-100 border border-parchment-200 text-ink-600 text-[10px] font-medium max-w-full text-left">
                            📡 {spell.rangeText}
                          </span>
                        )}
                        {(spell.duration || spell.concentration) && (
                          <span className={`px-2 py-1 rounded-md text-[10px] font-semibold max-w-full text-left ${
                            spell.concentration
                              ? 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                              : 'bg-parchment-100 border border-parchment-200 text-ink-600 font-medium'
                          }`}>
                            {spell.concentration ? '🌀' : '⏳'} {spell.duration ?? 'Concentration'}
                          </span>
                        )}
                        <span className="px-2 py-1 rounded-md bg-parchment-100 border border-parchment-200 text-ink-600 text-[10px] font-medium max-w-full text-left">
                          📝 {spell.components.join(', ') || '—'}
                        </span>
                      </div>
                      {spell.classes.length > 0 && (
                        <p className="text-ink-400">Classes : {spell.classes.join(', ')}</p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {offset + PAGE_SIZE < total && (
            <button
              onClick={onLoadMore}
              className="btn-ghost text-ink-700 w-full text-sm py-2"
            >
              Charger plus ({total - offset - PAGE_SIZE} restants)
            </button>
          )}
        </>
      )}
    </div>
  );
}
