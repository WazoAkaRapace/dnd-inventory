/**
 * Sorts tab — spell slots tracker, known/prepared spells, spell catalog browser.
 */
import { useState, useEffect, useCallback } from 'react';
import api from '../api';
import { BottomSheet } from '../components/ui';
import {
  type Character,
  type Spell,
  type CharacterSpell,
  type SpellSchool,
  type SpellcastingType,
  SPELL_SCHOOL_LABELS_FR,
  DND_SKILLS,
  abilityModifier,
  formatModifier,
  proficiencyBonus,
  maxSpellSlots,
  findClass,
} from '@dnd-inventory/shared';

interface Props {
  character: Character;
  charId: number;
  onSaved: () => Promise<void>;
  onError: (msg: string) => void;
}

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

  // Catalog browser
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogLevel, setCatalogLevel] = useState<string>('');
  const [catalogSchool, setCatalogSchool] = useState<string>('');
  const [catalogSpells, setCatalogSpells] = useState<Spell[]>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogOffset, setCatalogOffset] = useState(0);
  const [addingSpellId, setAddingSpellId] = useState<number | null>(null);

  // Expanded spell detail (by character_spell link id or catalog spell id)
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const classInfo = findClass(character.characterClass);
  const castingType: SpellcastingType = classInfo?.spellcasting ?? 'none';
  const isCaster = castingType !== 'none';

  const level = character.level ?? 1;
  const slots = isCaster ? maxSpellSlots(level, castingType) : [0,0,0,0,0,0,0,0,0];
  const slotsUsed = character.spellSlotsUsed ?? [0,0,0,0,0,0,0,0,0];

  // Fetch character's known spells
  const fetchCharSpells = useCallback(async () => {
    try {
      const res = await api.get(`/api/characters/${charId}/spells`);
      setCharSpells(res.data);
    } catch {
      // Character might not have spells endpoint yet
    } finally {
      setLoadingSpells(false);
    }
  }, [charId]);

  useEffect(() => {
    fetchCharSpells();
  }, [fetchCharSpells]);

  // Fetch catalog with filters
  const fetchCatalog = useCallback(async (offset = 0) => {
    setCatalogLoading(true);
    try {
      const params: Record<string, string | number> = { limit: PAGE_SIZE, offset };
      if (character.characterClass) params.class = character.characterClass;
      if (catalogLevel !== '') params.level = catalogLevel;
      if (catalogSchool) params.school = catalogSchool;
      if (catalogSearch.trim()) params.search = catalogSearch.trim();
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
  }, [character.characterClass, catalogLevel, catalogSchool, catalogSearch]);

  useEffect(() => {
    if (catalogOpen) {
      const t = setTimeout(() => fetchCatalog(0), 250);
      return () => clearTimeout(t);
    }
  }, [catalogOpen, fetchCatalog]);

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

  // Group known spells by level
  const spellsByLevel = [0,1,2,3,4,5,6,7,8,9].map((lvl) => ({
    level: lvl,
    spells: charSpells.filter((cs) => cs.spell.level === lvl)
      .sort((a, b) => (a.spell.nameFr ?? a.spell.name).localeCompare(b.spell.nameFr ?? b.spell.name)),
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

      {/* Known spells */}
      <section className="card p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">
            Sorts connus <span className="text-ink-400 text-sm font-normal">({charSpells.length})</span>
          </h2>
          <button
            onClick={() => setCatalogOpen(true)}
            className="btn-primary text-sm px-3 py-1.5"
          >
            + Ajouter
          </button>
        </div>

        {loadingSpells ? (
          <p className="text-sm text-ink-400 animate-pulse">Chargement…</p>
        ) : spellsByLevel.length === 0 ? (
          <p className="text-sm text-ink-400 italic">Aucun sort. Cliquez sur « Ajouter » pour parcourir le grimoire.</p>
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
                          <button
                            onClick={() => togglePrepared(cs.id, cs.prepared)}
                            className={`text-lg shrink-0 ${cs.prepared ? 'text-gold-400' : 'text-parchment-300 hover:text-parchment-400'}`}
                            aria-label={cs.prepared ? 'Sort préparé' : 'Sort non préparé'}
                            title={cs.prepared ? 'Préparé' : 'Non préparé'}
                          >
                            {cs.prepared ? '★' : '☆'}
                          </button>
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : cs.id)}
                            className="min-w-0 flex-1 text-left"
                            aria-expanded={isExpanded}
                          >
                            <span className="font-medium text-sm text-ink-800 block truncate">{name}</span>
                            <span className="flex items-center gap-1.5 text-xs text-ink-400">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${SCHOOL_COLORS[spell.school] ?? 'bg-parchment-200'}`}>
                                {SPELL_SCHOOL_LABELS_FR[spell.school as SpellSchool] ?? spell.school}
                              </span>
                              {spell.concentration && <span title="Concentration">🎯</span>}
                              {spell.ritual && <span title="Rituel">⚗</span>}
                              <span className="truncate">{spell.castingTime}</span>
                            </span>
                          </button>
                          <button
                            onClick={() => removeSpell(cs.id)}
                            className="text-ink-300 hover:text-red-500 text-sm shrink-0 px-1"
                            aria-label={`Oublier ${name}`}
                          >
                            ×
                          </button>
                        </div>
                        {isExpanded && (
                          <div className="px-3 pb-3 pt-1 border-t border-parchment-200 text-xs text-ink-600 space-y-1.5">
                            {spell.descriptionFr ?? spell.description}
                            {spell.higherLevelFr && (
                              <p className="text-ink-400 italic"><strong>Aux niveaux supérieurs :</strong> {spell.higherLevelFr}</p>
                            )}
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 pt-1 text-ink-400">
                              <span>⏱ {spell.castingTime}</span>
                              <span>📡 {spell.rangeText}</span>
                              <span>⏳ {spell.duration}</span>
                              <span>📝 {spell.components.join(', ')}</span>
                              {spell.material && <span>💎 {spell.material}</span>}
                            </div>
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

      {/* Spell catalog browser */}
      <BottomSheet open={catalogOpen} onClose={() => setCatalogOpen(false)} title="Grimoire">
        <SpellCatalog
          spells={catalogSpells}
          total={catalogTotal}
          loading={catalogLoading}
          offset={catalogOffset}
          search={catalogSearch}
          level={catalogLevel}
          school={catalogSchool}
          charClass={character.characterClass}
          addingSpellId={addingSpellId}
          knownSpellIds={new Set(charSpells.map((cs) => cs.spell.id))}
          onSearch={setCatalogSearch}
          onLevel={setCatalogLevel}
          onSchool={setCatalogSchool}
          onAdd={addSpell}
          onLoadMore={() => fetchCatalog(catalogOffset + PAGE_SIZE)}
        />
      </BottomSheet>
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
  charClass,
  addingSpellId,
  knownSpellIds,
  onSearch,
  onLevel,
  onSchool,
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
  charClass: string | null;
  addingSpellId: number | null;
  knownSpellIds: Set<number>;
  onSearch: (v: string) => void;
  onLevel: (v: string) => void;
  onSchool: (v: string) => void;
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
        {charClass && (
          <p className="text-xs text-ink-400">Filtré par classe : {charClass}</p>
        )}
      </div>

      {/* Results */}
      {loading ? (
        <p className="text-sm text-ink-400 animate-pulse text-center py-4">Chargement…</p>
      ) : spells.length === 0 ? (
        <p className="text-sm text-ink-400 italic text-center py-4">Aucun sort trouvé.</p>
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
                      <span className="flex items-center gap-1.5 text-xs text-ink-400">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${SCHOOL_COLORS[spell.school] ?? 'bg-parchment-200'}`}>
                          {SPELL_SCHOOL_LABELS_FR[spell.school as SpellSchool] ?? spell.school}
                        </span>
                        <span>{spell.level === 0 ? 'Tour' : `Niv. ${spell.level}`}</span>
                        {spell.concentration && <span>🎯</span>}
                        {spell.ritual && <span>⚗</span>}
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
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 pt-1 text-ink-400">
                        <span>⏱ {spell.castingTime}</span>
                        <span>📡 {spell.rangeText}</span>
                        <span>⏳ {spell.duration}</span>
                        <span>📝 {spell.components.join(', ')}</span>
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
              className="btn-ghost w-full text-sm py-2"
            >
              Charger plus ({total - offset - PAGE_SIZE} restants)
            </button>
          )}
        </>
      )}
    </div>
  );
}
