/**
 * Caractéristiques tab — zone de lecture d'abord (caractéristiques, stats
 * dérivées : ce que le joueur consulte en jeu), zone de configuration ensuite
 * (identité & classe, maîtrise d'armes : ce qui se règle rarement).
 * Part of the character sheet integration.
 */

import {
  ABILITY_LABELS_FR,
  ABILITY_SHORT_FR,
  type AbilityKey,
  abilityModifier,
  type Character,
  CLASS_SUBCLASSES,
  classWeaponProficiencies,
  computeAC,
  computeEncumbrance,
  computeSpeed,
  DIVINE_DOMAINS,
  DND_CLASSES,
  effectiveWeaponProficiencies,
  FIGHTING_STYLE_CLASSES,
  FIGHTING_STYLE_LABELS_FR,
  findClass,
  formatModifier,
  type InventoryEntry,
  LAND_CIRCLES,
  MUNDANE_WEAPONS,
  passivePerception,
  proficiencyBonus,
  SACRED_OATHS,
  skillProficiencyLevel,
  spellSaveDC,
} from '@dnd-inventory/shared';
import { useCallback, useEffect, useState } from 'react';
import api from '../api';
import { BottomSheet } from '../components/ui';

interface Props {
  character: Character;
  charId: number;
  entries: InventoryEntry[];
  onSaved: () => Promise<void>;
  onError: (msg: string) => void;
}

// Fields that are directly editable ability scores
const ABILITY_FIELDS: { key: keyof Character; ability: AbilityKey }[] = [
  { key: 'strength', ability: 'strength' },
  { key: 'dexterity', ability: 'dexterity' },
  { key: 'constitution', ability: 'constitution' },
  { key: 'intelligence', ability: 'intelligence' },
  { key: 'wisdom', ability: 'wisdom' },
  { key: 'charisma', ability: 'charisma' },
];

/** Classes using the generic `subclass` column, with their French picker label.
 *  Clerc/Druide/Paladin keep their dedicated columns (domaine/cercle/serment). */
const GENERIC_SUBCLASS_LABELS: Record<string, string> = {
  Barbare: 'Voie primordiale',
  Barde: 'Collège bardique',
  Ensorceleur: 'Origine de sorcellerie',
  Guerrier: 'Archétype martial',
  Magicien: 'École de magie',
  Moine: 'Tradition monastique',
  Occultiste: 'Patron surnaturel',
  Rôdeur: 'Archétype de rôdeur',
  Roublard: 'Archétype roublard',
};

/** Niveau RAW d'acquisition des sous-classes à colonne dédiée. */
const DEDICATED_SUBCLASS_LEVELS: Record<string, number> = {
  cercle: 2, // Druide — Cercle druidique
  terrain: 2, // Druide — Terrain du cercle (cercle de la Terre)
  serment: 3, // Paladin — Serment sacré
};

export default function CharacterStatsTab({ character, charId, entries, onSaved, onError }: Props) {
  // Drafts for ability scores (auto-save on blur)
  const [abilityDrafts, setAbilityDrafts] = useState<Record<string, string>>({});
  const [classDraft, setClassDraft] = useState(character.characterClass ?? '');
  const [raceDraft, setRaceDraft] = useState(character.race ?? '');
  const [bgDraft, setBgDraft] = useState(character.background ?? '');
  const [levelDraft, setLevelDraft] = useState(String(character.level ?? 1));
  const [speedDraft, setSpeedDraft] = useState(String(character.speed ?? 9));

  // Feuilles d'édition (configuration peu fréquente)
  const [identityOpen, setIdentityOpen] = useState(false);
  const [portageOpen, setPortageOpen] = useState(false);
  const [multDraft, setMultDraft] = useState('');

  useEffect(() => {
    const drafts: Record<string, string> = {};
    for (const { key } of ABILITY_FIELDS) {
      drafts[key] = String((character[key] as number) ?? 10);
    }
    setAbilityDrafts(drafts);
    setClassDraft(character.characterClass ?? '');
    setRaceDraft(character.race ?? '');
    setBgDraft(character.background ?? '');
    setLevelDraft(String(character.level ?? 1));
    setSpeedDraft(String(character.speed ?? 9));
  }, [character]);

  const patchCharacter = useCallback(
    async (payload: Record<string, unknown>, errMsg: string) => {
      try {
        await api.patch(`/api/characters/${charId}`, payload);
        await onSaved();
      } catch {
        onError(errMsg);
      }
    },
    [charId, onSaved, onError],
  );

  const commitAbility = (ability: AbilityKey) => {
    const raw = abilityDrafts[ability];
    if (raw === undefined) return;
    const val = Number(raw);
    const current =
      (character[
        ability === 'strength' ? 'strength' : (`${ability}` as keyof Character)
      ] as number) ?? 10;
    if (!Number.isFinite(val) || val === current) {
      setAbilityDrafts((d) => ({ ...d, [ability]: String(current) }));
      return;
    }
    const clamped = Math.max(1, Math.min(30, Math.round(val)));
    patchCharacter({ [ability]: clamped }, 'Erreur de mise à jour');
  };

  const commitClass = () => {
    if (classDraft === (character.characterClass ?? '')) return;
    patchCharacter({ characterClass: classDraft.trim() || null }, 'Erreur de mise à jour');
  };

  const commitRace = () => {
    if (raceDraft === (character.race ?? '')) return;
    patchCharacter({ race: raceDraft.trim() || null }, 'Erreur de mise à jour');
  };

  const commitBackground = () => {
    if (bgDraft === (character.background ?? '')) return;
    patchCharacter({ background: bgDraft.trim() || null }, 'Erreur de mise à jour');
  };

  const commitLevel = () => {
    const val = Number(levelDraft);
    const current = character.level ?? 1;
    if (!Number.isFinite(val) || val === current) {
      setLevelDraft(String(current));
      return;
    }
    const clamped = Math.max(1, Math.min(20, Math.round(val)));
    patchCharacter({ level: clamped }, 'Erreur de mise à jour');
  };

  const commitSpeed = () => {
    const val = Number(speedDraft);
    const current = character.speed ?? 9;
    if (!Number.isFinite(val) || val === current) {
      setSpeedDraft(String(current));
      return;
    }
    // Les demi-mètres sont valides (petites races : 7,5 m) — normalise à 1 décimale
    patchCharacter({ speed: Math.max(0, Math.round(val * 10) / 10) }, 'Erreur de mise à jour');
  };

  // Fermeture de la feuille identité : on commite les brouillons restants
  // (fermer par le scrim ne déclenche pas leur blur)
  const closeIdentity = () => {
    commitClass();
    commitLevel();
    commitRace();
    commitBackground();
    setIdentityOpen(false);
  };

  // Armor-dependent class speed features (Moine / Barbare)
  const speedResult = computeSpeed(character, entries);

  // Derived stats
  const level = character.level ?? 1;
  const classInfo = findClass(character.characterClass);
  const clsName = classInfo?.name ?? '';
  const profBonus = proficiencyBonus(level);
  const dexMod = abilityModifier(character.dexterity ?? 10);
  const wisMod = abilityModifier(character.wisdom ?? 10);
  const perceptionLevel = skillProficiencyLevel(character, 'perception');
  const passPerc = passivePerception(wisMod, profBonus, perceptionLevel);

  const castingAbility = classInfo?.spellcastingAbility;
  const isSpellcaster = classInfo && classInfo.spellcasting !== 'none' && castingAbility;
  const castingMod = isSpellcaster
    ? abilityModifier((character[castingAbility as keyof Character] as number) ?? 10)
    : 0;
  const spellDC = isSpellcaster ? spellSaveDC(castingMod, profBonus) : 0;

  // Armor Class — computed from equipped armor, or manual override
  const acResult = computeAC(entries, dexMod, character.fightingStyle === 'defense', character);
  const acOverride = character.armorClassOverride;
  const effectiveAC = acOverride ?? acResult.ac;
  const [acDraft, setAcDraft] = useState('');
  const [editingAC, setEditingAC] = useState(false);

  // Portage — max dérivé de FOR × 7,5 kg × multiplicateur (édité dans sa feuille)
  const capacityMult = character.capacityMultiplier ?? 1;
  const portageMaxKg = computeEncumbrance(
    0,
    character.strength ?? 10,
    'variant',
    0,
    capacityMult,
  ).maxCarryKg;
  const openPortage = () => {
    setMultDraft(String(capacityMult));
    setPortageOpen(true);
  };
  const saveMult = () => {
    setPortageOpen(false);
    const parsed = Number(multDraft);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    const newMult = Math.round(parsed * 100) / 100;
    if (newMult === capacityMult) return;
    patchCharacter({ capacityMultiplier: newMult }, 'Erreur de mise à jour');
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: armorClassOverride is a deliberate dep — collapse the inline AC editor when the override changes (e.g. synced from another device).
  useEffect(() => {
    setEditingAC(false);
  }, [character.armorClassOverride]);

  const commitAC = () => {
    const val = acDraft.trim();
    if (val === '' || val === 'auto' || val === '0') {
      patchCharacter({ armorClassOverride: null }, 'Erreur de mise à jour');
    } else {
      const num = Number(val);
      if (Number.isFinite(num) && num > 0) {
        patchCharacter({ armorClassOverride: Math.round(num) }, 'Erreur de mise à jour');
      }
    }
    setEditingAC(false);
  };

  // Sous-classes choisies, pour la ligne résumé de la carte identité
  const subclassLines: string[] = [];
  if (clsName === 'Clerc' && character.divineDomain) {
    const label = DIVINE_DOMAINS.find((d) => d.key === character.divineDomain)?.label;
    if (label) subclassLines.push(label);
  }
  if (clsName === 'Druide' && character.druidCircle) {
    subclassLines.push(
      character.druidCircle === 'terre' ? 'Cercle de la Terre' : 'Cercle de la Lune',
    );
    if (character.druidCircle === 'terre' && character.landCircle) {
      const label = LAND_CIRCLES.find((t) => t.key === character.landCircle)?.label;
      if (label) subclassLines.push(label);
    }
  }
  if (clsName === 'Paladin' && character.sacredOath) {
    const label = SACRED_OATHS.find((o) => o.key === character.sacredOath)?.label;
    if (label) subclassLines.push(label);
  }
  if (character.subclass && CLASS_SUBCLASSES[clsName]) {
    const label = CLASS_SUBCLASSES[clsName].find((s) => s.key === character.subclass)?.label;
    if (label) subclassLines.push(label);
  }
  const hasSubclassPicker =
    clsName === 'Clerc' ||
    clsName === 'Druide' ||
    clsName === 'Paladin' ||
    Boolean(GENERIC_SUBCLASS_LABELS[clsName]);

  return (
    <div className="space-y-4">
      {/* ── Zone de lecture ─────────────────────────────────────────── */}

      {/* Ability scores */}
      <section className="card p-4 sm:p-5 space-y-3">
        <h2 className="section-title">Caractéristiques</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {ABILITY_FIELDS.map(({ key, ability }) => {
            const score = (character[key as keyof Character] as number) ?? 10;
            const mod = abilityModifier(score);
            const draftVal = abilityDrafts[ability] ?? String(score);
            return (
              <div key={ability} className="bg-parchment-100 rounded-xl p-3 text-center">
                <div className="text-xs font-medium text-ink-500 mb-1">
                  {ABILITY_LABELS_FR[ability]}
                </div>
                <div className="text-2xl font-bold text-ink-800 mb-0.5">{formatModifier(mod)}</div>
                <input
                  type="number"
                  min={1}
                  max={30}
                  className="w-16 text-center text-sm font-semibold bg-white border border-parchment-300 rounded-md py-1 focus:outline-none focus:border-blood-500"
                  value={draftVal}
                  onChange={(e) => setAbilityDrafts((d) => ({ ...d, [ability]: e.target.value }))}
                  onBlur={() => commitAbility(ability)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                  aria-label={`Score de ${ABILITY_LABELS_FR[ability]}`}
                />
              </div>
            );
          })}
        </div>
      </section>

      {/* Derived stats */}
      <section className="card p-4 sm:p-5 space-y-3">
        <h2 className="section-title">Statistiques dérivées</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Armor Class — computed or overridden */}
          <div className="bg-parchment-100 rounded-xl p-3 text-center">
            <div className="text-xs font-medium text-ink-500 mb-1">Classe d'armure</div>
            {editingAC ? (
              <input
                type="number"
                min={0}
                className="w-12 text-center text-xl font-bold text-ink-800 bg-white border border-parchment-300 rounded-md py-1.5 focus:outline-none focus:border-blood-500"
                value={acDraft}
                onChange={(e) => setAcDraft(e.target.value)}
                onBlur={commitAC}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') setEditingAC(false);
                }}
                placeholder={String(acResult.ac)}
                autoFocus
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAcDraft(acOverride ? String(acOverride) : '');
                  setEditingAC(true);
                }}
                className="w-full min-h-11 flex items-center justify-center gap-1.5 text-2xl font-bold text-ink-800 hover:text-blood-600 transition-colors"
                aria-label="Modifier la classe d'armure"
              >
                {effectiveAC}
                <span className="text-sm font-normal text-ink-500" aria-hidden="true">
                  ✎
                </span>
              </button>
            )}
            <div className="text-[11px] text-ink-500 mt-0.5">
              {acOverride !== null ? (
                <>
                  <span className="font-medium text-blood-600">Manuel</span>
                  {' · '}
                  <button
                    type="button"
                    onClick={() => patchCharacter({ armorClassOverride: null }, 'Erreur')}
                    className="text-blood-600 hover:underline py-1"
                  >
                    ↺ Auto
                  </button>
                </>
              ) : (
                acResult.source
              )}
            </div>
          </div>
          <DerivedStat label="Initiative" value={formatModifier(dexMod)} />
          {isSpellcaster && (
            <>
              <DerivedStat label="DD de sauvegarde" value={String(spellDC)} />
              <DerivedStat label="Attaque de sort" value={formatModifier(castingMod + profBonus)} />
            </>
          )}
          <DerivedStat label="Perception passive" value={String(passPerc)} />
          <DerivedStat
            label="Vitesse"
            value={`${speedResult.speed} m`}
            editable
            draftValue={speedDraft}
            onChange={setSpeedDraft}
            onBlur={commitSpeed}
            hint={
              speedResult.sources.length > 0
                ? `→ ${speedResult.speed} m · ${speedResult.sources.join(' · ')}`
                : undefined
            }
          />
          {classInfo && (
            <DerivedStat
              label="Dé de vie"
              value={`d${classInfo.hitDie} · ${Math.max(0, (character.level ?? 1) - (character.hitDiceUsed ?? 0))}/${character.level ?? 1}`}
            />
          )}
          <DerivedStat label="Bonus de maîtrise" value={formatModifier(profBonus)} />
          {/* Portage max — FOR × 7,5 kg × multiplicateur (feuille dédiée) */}
          <div className="bg-parchment-100 rounded-xl p-3 text-center">
            <div className="text-xs font-medium text-ink-500 mb-1">Portage max</div>
            <button
              type="button"
              onClick={openPortage}
              className="w-full min-h-11 flex items-center justify-center gap-1.5 text-2xl font-bold text-ink-800 hover:text-blood-600 transition-colors"
              aria-label="Modifier le multiplicateur de portage"
            >
              {portageMaxKg} kg
              <span className="px-1.5 py-0.5 rounded-full bg-blood-50 border border-blood-200 text-blood-700 text-[11px] font-semibold">
                ×{capacityMult}
              </span>
            </button>
            <div className="text-[11px] text-ink-500 mt-0.5">
              FOR {character.strength ?? 10} × 7,5 kg
            </div>
          </div>
        </div>
        {classInfo && (
          <p className="text-xs text-ink-500">
            Sauvegardes maîtrisées :{' '}
            {classInfo.savingThrows.map((s) => ABILITY_SHORT_FR[s]).join(', ')}
            {isSpellcaster &&
              castingAbility &&
              ` · Incantation : ${ABILITY_LABELS_FR[castingAbility]}`}
          </p>
        )}
      </section>

      {/* ── Zone de configuration ───────────────────────────────────── */}

      {/* Identity: summary card, full editor in bottom sheet */}
      <section className="card p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="section-title">Identité & classe</h2>
          <button
            type="button"
            onClick={() => setIdentityOpen(true)}
            className="btn-secondary text-sm px-3 py-2"
          >
            ✎ Modifier
          </button>
        </div>
        <div className="space-y-1">
          <p className="font-display text-lg font-semibold text-ink-800">
            {character.characterClass
              ? `${character.characterClass} · niv. ${level}`
              : `Niveau ${level} · classe non définie`}
          </p>
          {subclassLines.length > 0 && (
            <p className="text-sm text-ink-700">{subclassLines.join(' · ')}</p>
          )}
          <p className="text-sm text-ink-500">
            {[character.race, character.background].filter(Boolean).join(' · ') ||
              'Race et historique non définies'}
          </p>
        </div>
      </section>

      {/* Weapon mastery */}
      <WeaponMasteryCard character={character} patchCharacter={patchCharacter} />

      {/* Identity editor sheet */}
      <BottomSheet
        open={identityOpen}
        onClose={closeIdentity}
        title="Identité & classe"
        mobileOnly={false}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">Classe</span>
              <input
                type="text"
                list="dnd-classes"
                className="input"
                value={classDraft}
                onChange={(e) => setClassDraft(e.target.value)}
                onBlur={commitClass}
                placeholder="Magicien"
              />
              <datalist id="dnd-classes">
                {DND_CLASSES.map((c) => (
                  <option key={c.name} value={c.name} />
                ))}
              </datalist>
            </label>
            <label className="block">
              <span className="label">Niveau</span>
              <input
                type="number"
                min={1}
                max={20}
                className="input"
                value={levelDraft}
                onChange={(e) => setLevelDraft(e.target.value)}
                onBlur={commitLevel}
              />
            </label>
            <label className="block">
              <span className="label">Race</span>
              <input
                type="text"
                className="input"
                value={raceDraft}
                onChange={(e) => setRaceDraft(e.target.value)}
                onBlur={commitRace}
                placeholder="Haut-elfe"
              />
            </label>
            <label className="block">
              <span className="label">Historique</span>
              <input
                type="text"
                className="input"
                value={bgDraft}
                onChange={(e) => setBgDraft(e.target.value)}
                onBlur={commitBackground}
                placeholder="Sage"
              />
            </label>
          </div>
          {hasSubclassPicker && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide">
                Voie de classe
              </p>
              {clsName === 'Clerc' && (
                <label className="flex items-center justify-between gap-3">
                  <span className="label mb-0">Domaine divin</span>
                  <select
                    className="input py-1.5 text-sm w-auto max-w-[60%]"
                    value={character.divineDomain ?? ''}
                    onChange={(e) =>
                      patchCharacter(
                        { divineDomain: e.target.value === '' ? null : e.target.value },
                        'Erreur de mise à jour',
                      )
                    }
                    aria-label="Domaine divin"
                  >
                    <option value="">—</option>
                    {DIVINE_DOMAINS.map((d) => (
                      <option key={d.key} value={d.key}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {clsName === 'Druide' && (
                <label className="flex items-center justify-between gap-3">
                  <span className="label mb-0">
                    Cercle druidique
                    {level < DEDICATED_SUBCLASS_LEVELS.cercle && (
                      <span className="text-ink-400 font-normal">
                        {' '}
                        (niv. {DEDICATED_SUBCLASS_LEVELS.cercle})
                      </span>
                    )}
                  </span>
                  <select
                    className="input py-1.5 text-sm w-auto max-w-[60%]"
                    value={character.druidCircle ?? ''}
                    disabled={level < DEDICATED_SUBCLASS_LEVELS.cercle}
                    onChange={(e) =>
                      patchCharacter(
                        { druidCircle: e.target.value === '' ? null : e.target.value },
                        'Erreur de mise à jour',
                      )
                    }
                    aria-label="Cercle druidique"
                  >
                    <option value="">—</option>
                    <option value="terre">Cercle de la Terre</option>
                    <option value="lune">Cercle de la Lune</option>
                  </select>
                </label>
              )}
              {clsName === 'Druide' && character.druidCircle === 'terre' && (
                <label className="flex items-center justify-between gap-3">
                  <span className="label mb-0">
                    Terrain du cercle
                    {level < DEDICATED_SUBCLASS_LEVELS.terrain && (
                      <span className="text-ink-400 font-normal">
                        {' '}
                        (niv. {DEDICATED_SUBCLASS_LEVELS.terrain})
                      </span>
                    )}
                  </span>
                  <select
                    className="input py-1.5 text-sm w-auto max-w-[60%]"
                    value={character.landCircle ?? ''}
                    disabled={level < DEDICATED_SUBCLASS_LEVELS.terrain}
                    onChange={(e) =>
                      patchCharacter(
                        { landCircle: e.target.value === '' ? null : e.target.value },
                        'Erreur de mise à jour',
                      )
                    }
                    aria-label="Terrain du cercle"
                  >
                    <option value="">—</option>
                    {LAND_CIRCLES.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {clsName === 'Paladin' && (
                <label className="flex items-center justify-between gap-3">
                  <span className="label mb-0">
                    Serment sacré
                    {level < DEDICATED_SUBCLASS_LEVELS.serment && (
                      <span className="text-ink-400 font-normal">
                        {' '}
                        (niv. {DEDICATED_SUBCLASS_LEVELS.serment})
                      </span>
                    )}
                  </span>
                  <select
                    className="input py-1.5 text-sm w-auto max-w-[60%]"
                    value={character.sacredOath ?? ''}
                    disabled={level < DEDICATED_SUBCLASS_LEVELS.serment}
                    onChange={(e) =>
                      patchCharacter(
                        { sacredOath: e.target.value === '' ? null : e.target.value },
                        'Erreur de mise à jour',
                      )
                    }
                    aria-label="Serment sacré"
                  >
                    <option value="">—</option>
                    {SACRED_OATHS.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {(() => {
                // Sous-classe générique (SRD 5.1) — remplit la colonne `subclass`.
                // Verrouillé tant que le niveau d'acquisition de la classe n'est pas
                // atteint (1 : Ensorceleur/Occultiste — 2 : Magicien — 3 : le reste).
                const label = GENERIC_SUBCLASS_LABELS[clsName];
                const options = CLASS_SUBCLASSES[clsName];
                if (!label || !options) return null;
                const unlockLevel = Math.min(...options.map((s) => s.level));
                const locked = level < unlockLevel;
                return (
                  <label className="flex items-center justify-between gap-3">
                    <span className="label mb-0">
                      {label}
                      {locked && (
                        <span className="text-ink-400 font-normal"> (niv. {unlockLevel})</span>
                      )}
                    </span>
                    <select
                      className="input py-1.5 text-sm w-auto max-w-[60%]"
                      value={character.subclass ?? ''}
                      disabled={locked}
                      onChange={(e) =>
                        patchCharacter(
                          { subclass: e.target.value === '' ? null : e.target.value },
                          'Erreur de mise à jour',
                        )
                      }
                      aria-label={label}
                    >
                      <option value="">—</option>
                      {options.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })()}
            </div>
          )}
        </div>
      </BottomSheet>

      {/* Portage sheet — multiplier editor + metric rule help */}
      <BottomSheet
        open={portageOpen}
        onClose={() => setPortageOpen(false)}
        title="Portage maximum"
        mobileOnly={false}
        size="md"
        footer={
          <button type="button" onClick={saveMult} className="btn-primary flex-1">
            Enregistrer
          </button>
        }
      >
        <div className="space-y-4">
          <div className="bg-parchment-100 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-ink-800">
              {portageMaxKg} kg
              <span className="ml-2 text-base font-semibold text-ink-600">×{capacityMult}</span>
            </div>
            <div className="text-[11px] text-ink-500 mt-1">
              FOR {character.strength ?? 10} × 7,5 kg × multiplicateur
            </div>
          </div>
          <label className="block">
            <span className="label">Multiplicateur de portage</span>
            <input
              type="number"
              min={1}
              step={0.5}
              className="input"
              value={multDraft}
              onChange={(e) => setMultDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveMult();
              }}
            />
          </label>
          <div className="text-xs text-ink-600 bg-parchment-50 border border-parchment-200 rounded-lg p-3 space-y-1.5">
            <p>
              <strong>×1 (défaut)</strong> : créature de taille M sans capacité spéciale.
            </p>
            <p>
              <strong>×2</strong> : Construction massive (Goliath, Firbolg, Demi-Orc, Bugbear, Orc,
              Loxodon) ou créature de taille G. Le personnage compte comme une catégorie de taille
              supérieure pour le calcul du poids transportable.
            </p>
            <p>
              <strong>×3</strong> : Créature de taille TG.
            </p>
            <p>
              <strong>×4</strong> : Créature de taille Gig.
            </p>
            <p className="text-ink-500">
              Ce multiplicateur s'applique aux trois paliers (encombré, lourdement encombré, max).
              Modifie-le si ton personnage a un trait qui augmente sa capacité de portage. La barre
              d'encombrement du bandeau suit automatiquement.
            </p>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}

function DerivedStat({
  label,
  value,
  editable,
  draftValue,
  onChange,
  onBlur,
  hint,
}: {
  label: string;
  value: string;
  editable?: boolean;
  draftValue?: string;
  onChange?: (v: string) => void;
  onBlur?: () => void;
  hint?: string;
}) {
  return (
    <div className="bg-parchment-100 rounded-xl p-3 text-center">
      <div className="text-xs font-medium text-ink-500 mb-1">{label}</div>
      {hint && <div className="text-[11px] text-blood-600 font-medium leading-tight">{hint}</div>}
      {editable ? (
        <input
          type="number"
          min={0}
          step={0.5}
          className="mt-1 block mx-auto w-16 min-h-11 text-center text-lg font-bold text-ink-800 bg-white border border-parchment-300 rounded-md py-1 focus:outline-none focus:border-blood-500"
          value={draftValue ?? ''}
          onChange={(e) => onChange?.(e.target.value)}
          onBlur={onBlur}
        />
      ) : (
        <div className="min-h-11 flex items-center justify-center text-xl font-bold text-ink-800">
          {value}
        </div>
      )}
    </div>
  );
}

/** Weapon mastery editor: toggles for simple/martial + class-specific info. */
function WeaponMasteryCard({
  character,
  patchCharacter,
}: {
  character: Character;
  patchCharacter: (payload: Record<string, unknown>, errMsg: string) => Promise<void>;
}) {
  const effective = effectiveWeaponProficiencies(character);
  const isCustom = character.weaponProficiencies != null;
  const classDefault = classWeaponProficiencies(character.characterClass);

  const toggle = (token: 'simple' | 'martial') => {
    // Materialize the effective list (class defaults when untouched), then flip
    const tokens: string[] = [];
    if (token === 'simple' ? !effective.simple : effective.simple) tokens.push('simple');
    if (token === 'martial' ? !effective.martial : effective.martial) tokens.push('martial');
    tokens.push(...effective.specific);
    patchCharacter({ weaponProficiencies: tokens }, 'Erreur de mise à jour');
  };

  const specificFr = effective.specific.map(
    (nameEn) => MUNDANE_WEAPONS.find((m) => m.nameEn === nameEn)?.nameFr ?? nameEn,
  );

  const chip = (active: boolean) =>
    `flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
      active
        ? 'bg-blood-600 text-white border-blood-700'
        : 'bg-parchment-50 text-ink-600 border-parchment-200 hover:border-blood-400'
    }`;

  return (
    <section className="card p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="section-title">Maîtrise d'armes</h2>
        {isCustom && (
          <button
            type="button"
            onClick={() => patchCharacter({ weaponProficiencies: null }, 'Erreur de mise à jour')}
            className="text-xs text-blood-600 hover:underline"
            title="Revenir aux maîtrises par défaut de la classe"
          >
            ↺ Selon la classe
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => toggle('simple')}
          className={chip(effective.simple)}
          aria-pressed={effective.simple}
        >
          <span aria-hidden="true">🗡</span> Armes simples
        </button>
        <button
          type="button"
          onClick={() => toggle('martial')}
          className={chip(effective.martial)}
          aria-pressed={effective.martial}
        >
          <span aria-hidden="true">⚔️</span> Armes de guerre
        </button>
      </div>
      {specificFr.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-ink-400">Spécifiques :</span>
          {specificFr.map((fr) => (
            <span
              key={fr}
              className="px-2 py-0.5 rounded-full bg-parchment-100 border border-parchment-300 text-xs font-medium text-ink-700"
            >
              {fr}
            </span>
          ))}
        </div>
      )}
      {(FIGHTING_STYLE_CLASSES as readonly string[]).includes(character.characterClass ?? '') && (
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-ink-700">Style de combat</span>
          <select
            className="input py-1.5 text-sm w-auto max-w-[60%]"
            value={character.fightingStyle ?? ''}
            onChange={(e) =>
              patchCharacter(
                { fightingStyle: e.target.value === '' ? null : e.target.value },
                'Erreur de mise à jour',
              )
            }
            aria-label="Style de combat"
          >
            <option value="">—</option>
            {Object.entries(FIGHTING_STYLE_LABELS_FR).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="text-xs text-ink-400">
        {isCustom
          ? 'Maîtrises personnalisées.'
          : `Selon la classe ${character.characterClass ?? '—'} : ${
              [
                classDefault.simple && 'armes simples',
                classDefault.martial && 'armes de guerre',
                classDefault.specific.length > 0 &&
                  `${classDefault.specific.length} arme(s) spécifique(s)`,
              ]
                .filter(Boolean)
                .join(' + ') || 'aucune maîtrise'
            }.`}
      </p>
    </section>
  );
}
