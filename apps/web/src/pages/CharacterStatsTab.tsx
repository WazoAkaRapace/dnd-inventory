/**
 * Caractéristiques tab — ability scores, class/race/level, derived stats.
 * Part of the character sheet integration.
 */

import {
  ABILITY_LABELS_FR,
  ABILITY_SHORT_FR,
  type AbilityKey,
  abilityModifier,
  type Character,
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
  spellSaveDC,
} from '@dnd-inventory/shared';
import { useCallback, useEffect, useState } from 'react';
import api from '../api';

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

export default function CharacterStatsTab({ character, charId, entries, onSaved, onError }: Props) {
  // Drafts for ability scores (auto-save on blur)
  const [abilityDrafts, setAbilityDrafts] = useState<Record<string, string>>({});
  const [classDraft, setClassDraft] = useState(character.characterClass ?? '');
  const [raceDraft, setRaceDraft] = useState(character.race ?? '');
  const [bgDraft, setBgDraft] = useState(character.background ?? '');
  const [levelDraft, setLevelDraft] = useState(String(character.level ?? 1));
  const [speedDraft, setSpeedDraft] = useState(String(character.speed ?? 9));

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

  // Armor-dependent class speed features (Moine / Barbare)
  const speedResult = computeSpeed(character, entries);

  // Derived stats
  const level = character.level ?? 1;
  const classInfo = findClass(character.characterClass);
  const profBonus = proficiencyBonus(level);
  const dexMod = abilityModifier(character.dexterity ?? 10);
  const wisMod = abilityModifier(character.wisdom ?? 10);
  const hasPerception = character.skillProficiencies?.includes('perception') ?? false;
  const passPerc = passivePerception(wisMod, profBonus, hasPerception);

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

  // Portage multiplier — the manual input behind the derived max-carry stat
  // (moved from the old cog modal; same input, same help)
  const [multDraft, setMultDraft] = useState('');
  const [editingMult, setEditingMult] = useState(false);
  const [showMultHelp, setShowMultHelp] = useState(false);
  const capacityMult = character.capacityMultiplier ?? 1;
  const portageMaxKg = computeEncumbrance(
    0,
    character.strength ?? 10,
    'variant',
    0,
    capacityMult,
  ).maxCarryKg;
  const commitMult = () => {
    setEditingMult(false);
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

  return (
    <div className="space-y-4">
      {/* Identity: class, level, race, background */}
      <section className="card p-4 sm:p-5 space-y-3">
        <h2 className="section-title">Identité</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
        {findClass(character.characterClass)?.name === 'Clerc' && (
          <label className="flex items-center justify-between gap-3 max-w-xs">
            <span className="label mb-0">Domaine divin</span>
            <select
              className="input py-1.5 text-sm w-auto"
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
        {findClass(character.characterClass)?.name === 'Druide' &&
          character.druidCircle === 'terre' && (
            <label className="flex items-center justify-between gap-3 max-w-xs">
              <span className="label mb-0">Terrain du cercle</span>
              <select
                className="input py-1.5 text-sm w-auto"
                value={character.landCircle ?? ''}
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
        {findClass(character.characterClass)?.name === 'Paladin' && (
          <label className="flex items-center justify-between gap-3 max-w-xs">
            <span className="label mb-0">Serment sacré</span>
            <select
              className="input py-1.5 text-sm w-auto"
              value={character.sacredOath ?? ''}
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
        {findClass(character.characterClass)?.name === 'Druide' && (
          <label className="flex items-center justify-between gap-3 max-w-xs">
            <span className="label mb-0">Cercle druidique</span>
            <select
              className="input py-1.5 text-sm w-auto"
              value={character.druidCircle ?? ''}
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
      </section>

      {/* Weapon mastery */}
      <WeaponMasteryCard character={character} patchCharacter={patchCharacter} />

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
                className="w-12 text-center text-xl font-bold text-ink-800 bg-white border border-parchment-300 rounded-md py-0.5 focus:outline-none focus:border-blood-500"
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
                className="text-2xl font-bold text-ink-800 hover:text-blood-600 transition-colors"
                title="Cliquer pour modifier"
              >
                {effectiveAC}
              </button>
            )}
            <div className="text-[10px] text-ink-400 mt-0.5">
              {acOverride !== null ? <span className="text-blood-600">Manuel · </span> : null}
              {acOverride !== null && (
                <button
                  type="button"
                  onClick={() => patchCharacter({ armorClassOverride: null }, 'Erreur')}
                  className="text-blood-500 hover:underline"
                >
                  ↺ Auto
                </button>
              )}
              {acOverride === null && acResult.source}
            </div>
          </div>
          <DerivedStat label="Bonus de maîtrise" value={formatModifier(profBonus)} />
          <DerivedStat label="Initiative" value={formatModifier(dexMod)} />
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
          {/* Portage max — derived from FOR × 15 × the multiplier (editable) */}
          <div className="bg-parchment-100 rounded-xl p-3 text-center">
            <div className="text-xs font-medium text-ink-500 mb-1">Portage max</div>
            {editingMult ? (
              <input
                type="number"
                min={1}
                step={0.5}
                className="w-14 text-center text-xl font-bold text-ink-800 bg-white border border-parchment-300 rounded-md py-0.5 focus:outline-none focus:border-blood-500"
                value={multDraft}
                onChange={(e) => setMultDraft(e.target.value)}
                onBlur={commitMult}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') setEditingMult(false);
                }}
                placeholder={`×${capacityMult}`}
                autoFocus
                aria-label="Multiplicateur de portage"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMultDraft('');
                  setEditingMult(true);
                }}
                className="text-2xl font-bold text-ink-800 hover:text-blood-600 transition-colors"
                title="Cliquer pour modifier le multiplicateur de portage"
              >
                {portageMaxKg} kg
              </button>
            )}
            <div className="text-[10px] text-ink-400 mt-0.5 flex items-center justify-center gap-1">
              <span title="Règle métrique : FOR × 7,5 kg par point de Force (FOR × 15 lb en impérial), multiplié par le multiplicateur de portage.">
                FOR {character.strength ?? 10} × 7,5 kg{' '}
                <span className="font-semibold text-ink-600">×{capacityMult}</span>
              </span>
              <button
                type="button"
                onClick={() => setShowMultHelp((s) => !s)}
                className="text-ink-400 hover:text-blood-600 leading-none"
                aria-label="Aide sur le multiplicateur de portage"
                aria-expanded={showMultHelp}
                title="Aide"
              >
                ?
              </button>
            </div>
          </div>
          {showMultHelp && (
            <div className="col-span-2 sm:col-span-4 text-left text-xs text-ink-600 bg-parchment-50 border border-parchment-200 rounded-lg p-3 space-y-1.5">
              <p>
                <strong>×1 (défaut)</strong> : créature de taille M sans capacité spéciale.
              </p>
              <p>
                <strong>×2</strong> : Construction massive (Goliath, Firbolg, Demi-Orc, Bugbear,
                Orc, Loxodon) ou créature de taille G. Le personnage compte comme une catégorie de
                taille supérieure pour le calcul du poids transportable.
              </p>
              <p>
                <strong>×3</strong> : Créature de taille TG.
              </p>
              <p>
                <strong>×4</strong> : Créature de taille Gig.
              </p>
              <p className="text-ink-400">
                Ce multiplicateur s'applique aux trois paliers (encombré, lourdement encombré, max).
                Modifie-le si ton personnage a un trait qui augmente sa capacité de portage. La
                barre d'encombrement du bandeau suit automatiquement.
              </p>
            </div>
          )}
          {isSpellcaster && (
            <>
              <DerivedStat label="DD de sauvegarde" value={String(spellDC)} />
              <DerivedStat label="Attaque de sort" value={formatModifier(castingMod + profBonus)} />
            </>
          )}
          {classInfo && (
            <DerivedStat
              label="Dé de vie"
              value={`d${classInfo.hitDie} · ${Math.max(0, (character.level ?? 1) - (character.hitDiceUsed ?? 0))}/${character.level ?? 1}`}
            />
          )}
        </div>
        {classInfo && (
          <p className="text-xs text-ink-400">
            Sauvegardes maîtrisées :{' '}
            {classInfo.savingThrows.map((s) => ABILITY_SHORT_FR[s]).join(', ')}
            {isSpellcaster &&
              castingAbility &&
              ` · Incantation : ${ABILITY_LABELS_FR[castingAbility]}`}
          </p>
        )}
      </section>
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
      {hint && <div className="text-[10px] text-blood-600 font-medium leading-tight">{hint}</div>}
      {editable ? (
        <input
          type="number"
          min={0}
          step={0.5}
          className="w-16 text-center text-lg font-bold text-ink-800 bg-white border border-parchment-300 rounded-md py-0.5 focus:outline-none focus:border-blood-500"
          value={draftValue ?? ''}
          onChange={(e) => onChange?.(e.target.value)}
          onBlur={onBlur}
        />
      ) : (
        <div className="text-xl font-bold text-ink-800">{value}</div>
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
