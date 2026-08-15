/**
 * Caractéristiques tab — ability scores, class/race/level, derived stats.
 * Part of the character sheet integration.
 */
import { useState, useEffect, useCallback } from 'react';
import api from '../api';
import {
  type Character,
  type InventoryEntry,
  type AbilityKey,
  DND_ABILITIES,
  ABILITY_LABELS_FR,
  ABILITY_SHORT_FR,
  DND_CLASSES,
  abilityModifier,
  formatModifier,
  proficiencyBonus,
  spellSaveDC,
  passivePerception,
  computeAC,
  findClass,
  effectiveWeaponProficiencies,
  classWeaponProficiencies,
  computeSpeed,
  MUNDANE_WEAPONS,
  FIGHTING_STYLE_LABELS_FR,
  FIGHTING_STYLE_CLASSES,
  type FightingStyle,
} from '@dnd-inventory/shared';

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

  const patchCharacter = useCallback(async (payload: Record<string, unknown>, errMsg: string) => {
    try {
      await api.patch(`/api/characters/${charId}`, payload);
      await onSaved();
    } catch {
      onError(errMsg);
    }
  }, [charId, onSaved, onError]);

  const commitAbility = (ability: AbilityKey) => {
    const raw = abilityDrafts[ability];
    if (raw === undefined) return;
    const val = Number(raw);
    const current = (character[ability === 'strength' ? 'strength' : `${ability}` as keyof Character] as number) ?? 10;
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
    patchCharacter({ speed: Math.max(0, Math.round(val)) }, 'Erreur de mise à jour');
  };

  // Armor-dependent class speed features (Moine / Barbare)
  const speedResult = computeSpeed(character, entries);

  // Derived stats
  const level = character.level ?? 1;
  const classInfo = findClass(character.characterClass);
  const profBonus = proficiencyBonus(level);
  const dexMod = abilityModifier(character.dexterity ?? 10);
  const wisMod = abilityModifier(character.wisdom ?? 10);
  const conMod = abilityModifier(character.constitution ?? 10);
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

  useEffect(() => { setEditingAC(false); }, [character.armorClassOverride]);

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
        <h2 className="font-display text-lg font-semibold">Identité</h2>
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
              {DND_CLASSES.map((c) => <option key={c.name} value={c.name} />)}
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
      </section>

      {/* Weapon mastery */}
      <WeaponMasteryCard character={character} patchCharacter={patchCharacter} />

      {/* Ability scores */}
      <section className="card p-4 sm:p-5 space-y-3">
        <h2 className="font-display text-lg font-semibold">Caractéristiques</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {ABILITY_FIELDS.map(({ key, ability }) => {
            const score = (character[key as keyof Character] as number) ?? 10;
            const mod = abilityModifier(score);
            const draftVal = abilityDrafts[ability] ?? String(score);
            return (
              <div key={ability} className="bg-parchment-100 rounded-xl p-3 text-center">
                <div className="text-xs font-medium text-ink-500 mb-1">{ABILITY_LABELS_FR[ability]}</div>
                <div className="text-2xl font-bold text-ink-800 mb-0.5">{formatModifier(mod)}</div>
                <input
                  type="number"
                  min={1}
                  max={30}
                  className="w-16 text-center text-sm font-semibold bg-white border border-parchment-300 rounded-md py-1 focus:outline-none focus:border-blood-500"
                  value={draftVal}
                  onChange={(e) => setAbilityDrafts((d) => ({ ...d, [ability]: e.target.value }))}
                  onBlur={() => commitAbility(ability)}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  aria-label={`Score de ${ABILITY_LABELS_FR[ability]}`}
                />
              </div>
            );
          })}
        </div>
      </section>

      {/* Derived stats */}
      <section className="card p-4 sm:p-5 space-y-3">
        <h2 className="font-display text-lg font-semibold">Statistiques dérivées</h2>
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
                onClick={() => { setAcDraft(acOverride ? String(acOverride) : ''); setEditingAC(true); }}
                className="text-2xl font-bold text-ink-800 hover:text-blood-600 transition-colors"
                title="Cliquer pour modifier"
              >
                {effectiveAC}
              </button>
            )}
            <div className="text-[10px] text-ink-400 mt-0.5">
              {acOverride !== null ? (
                <span className="text-blood-600">Manuel · </span>
              ) : null}
              {acOverride !== null && (
                <button onClick={() => patchCharacter({ armorClassOverride: null }, 'Erreur')} className="text-blood-500 hover:underline">
                  ↺ Auto
                </button>
              )}
              {acOverride === null && acResult.source}
            </div>
          </div>
          <DerivedStat label="Bonus de maîtrise" value={formatModifier(profBonus)} />
          <DerivedStat label="Initiative" value={formatModifier(dexMod)} />
          <DerivedStat label="Perception passive" value={String(passPerc)} />
          <DerivedStat label="Vitesse" value={`${speedResult.speed} m`}
            editable
            draftValue={speedDraft}
            onChange={setSpeedDraft}
            onBlur={commitSpeed}
            hint={speedResult.source ? `→ ${speedResult.speed} m · ${speedResult.source}` : undefined}
          />
          {isSpellcaster && (
            <>
              <DerivedStat label="DD de sauvegarde" value={String(spellDC)} />
              <DerivedStat
                label="Attaque de sort"
                value={formatModifier(castingMod + profBonus)}
              />
            </>
          )}
          {classInfo && (
            <DerivedStat label="Dé de vie" value={`d${classInfo.hitDie}`} />
          )}
        </div>
        {classInfo && (
          <p className="text-xs text-ink-400">
            Sauvegardes maîtrisées : {classInfo.savingThrows.map((s) => ABILITY_SHORT_FR[s]).join(', ')}
            {isSpellcaster && castingAbility && ` · Incantation : ${ABILITY_LABELS_FR[castingAbility]}`}
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
function WeaponMasteryCard({ character, patchCharacter }: {
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

  const specificFr = effective.specific
    .map((nameEn) => MUNDANE_WEAPONS.find((m) => m.nameEn === nameEn)?.nameFr ?? nameEn);

  const chip = (active: boolean) =>
    `flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
      active
        ? 'bg-blood-600 text-white border-blood-700'
        : 'bg-parchment-50 text-ink-600 border-parchment-200 hover:border-blood-400'
    }`;

  return (
    <section className="card p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Maîtrise d'armes</h2>
        {isCustom && (
          <button
            onClick={() => patchCharacter({ weaponProficiencies: null }, 'Erreur de mise à jour')}
            className="text-xs text-blood-600 hover:underline"
            title="Revenir aux maîtrises par défaut de la classe"
          >
            ↺ Selon la classe
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <button onClick={() => toggle('simple')} className={chip(effective.simple)} aria-pressed={effective.simple}>
          <span aria-hidden="true">🗡</span> Armes simples
        </button>
        <button onClick={() => toggle('martial')} className={chip(effective.martial)} aria-pressed={effective.martial}>
          <span aria-hidden="true">⚔️</span> Armes de guerre
        </button>
      </div>
      {specificFr.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-ink-400">Spécifiques :</span>
          {specificFr.map((fr) => (
            <span key={fr} className="px-2 py-0.5 rounded-full bg-parchment-100 border border-parchment-300 text-xs font-medium text-ink-700">
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
            onChange={(e) => patchCharacter(
              { fightingStyle: e.target.value === '' ? null : e.target.value },
              'Erreur de mise à jour',
            )}
            aria-label="Style de combat"
          >
            <option value="">—</option>
            {Object.entries(FIGHTING_STYLE_LABELS_FR).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
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
                classDefault.specific.length > 0 && `${classDefault.specific.length} arme(s) spécifique(s)`,
              ].filter(Boolean).join(' + ') || 'aucune maîtrise'
            }.`}
      </p>
    </section>
  );
}
