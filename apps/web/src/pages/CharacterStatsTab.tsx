/**
 * Caractéristiques tab — ability scores, class/race/level, derived stats.
 * Part of the character sheet integration.
 */
import { useState, useEffect, useCallback } from 'react';
import api from '../api';
import {
  type Character,
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
  findClass,
} from '@dnd-inventory/shared';

interface Props {
  character: Character;
  charId: number;
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

export default function CharacterStatsTab({ character, charId, onSaved, onError }: Props) {
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
          <DerivedStat label="Bonus de maîtrise" value={formatModifier(profBonus)} />
          <DerivedStat label="Initiative" value={formatModifier(dexMod)} />
          <DerivedStat label="Perception passive" value={String(passPerc)} />
          <DerivedStat label="Vitesse" value={`${character.speed ?? 9} m`}
            editable
            draftValue={speedDraft}
            onChange={setSpeedDraft}
            onBlur={commitSpeed}
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
}: {
  label: string;
  value: string;
  editable?: boolean;
  draftValue?: string;
  onChange?: (v: string) => void;
  onBlur?: () => void;
}) {
  return (
    <div className="bg-parchment-100 rounded-xl p-3 text-center">
      <div className="text-xs font-medium text-ink-500 mb-1">{label}</div>
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
