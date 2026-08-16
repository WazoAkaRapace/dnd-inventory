/**
 * Compétences tab — 18 skills + 6 saving throws with proficiency toggles.
 */

import {
  ABILITY_SHORT_FR,
  type AbilityKey,
  abilityModifier,
  type Character,
  DND_ABILITIES,
  DND_SKILLS,
  formatModifier,
  type ProficiencyLevel,
  proficiencyBonus,
  type SkillKey,
} from '@dnd-inventory/shared';
import { useCallback } from 'react';
import api from '../api';

interface Props {
  character: Character;
  charId: number;
  onSaved: () => Promise<void>;
  onError: (msg: string) => void;
}

/** Get the ability score value for a given ability key from the character. */
function abilityScore(character: Character, key: AbilityKey): number {
  return (character[key as keyof Character] as number) ?? 10;
}

/** Read proficiency level for a skill from the character's proficiency arrays. */
function skillProficiency(character: Character, skillKey: SkillKey): ProficiencyLevel {
  const expert = (character as Record<string, unknown>).skillExpertise as string[] | undefined;
  const prof = character.skillProficiencies ?? [];
  if (expert?.includes(skillKey)) return 2;
  if (prof.includes(skillKey)) return 1;
  return 0;
}

/** Read proficiency for a saving throw. */
function saveProficiency(character: Character, ability: AbilityKey): boolean {
  return (character.savingThrowProficiencies ?? []).includes(ability);
}

export default function CharacterSkillsTab({ character, charId, onSaved, onError }: Props) {
  const level = character.level ?? 1;
  const profBonus = proficiencyBonus(level);

  const patchProficiencies = useCallback(
    async (skills: string[], saves: string[]) => {
      try {
        await api.patch(`/api/characters/${charId}`, {
          skillProficiencies: skills,
          savingThrowProficiencies: saves,
        });
        await onSaved();
      } catch {
        onError('Erreur de mise à jour');
      }
    },
    [charId, onSaved, onError],
  );

  const toggleSkill = (skillKey: SkillKey) => {
    const current = skillProficiency(character, skillKey);
    const profs = [...(character.skillProficiencies ?? [])];
    // Cycle: none → proficient → none (expertise handled via separate field if needed)
    if (current === 0) {
      profs.push(skillKey);
    } else {
      const idx = profs.indexOf(skillKey);
      if (idx >= 0) profs.splice(idx, 1);
    }
    patchProficiencies(profs, character.savingThrowProficiencies ?? []);
  };

  const toggleSave = (ability: AbilityKey) => {
    const current = saveProficiency(character, ability);
    const saves = [...(character.savingThrowProficiencies ?? [])];
    if (current) {
      const idx = saves.indexOf(ability);
      if (idx >= 0) saves.splice(idx, 1);
    } else {
      saves.push(ability);
    }
    patchProficiencies(character.skillProficiencies ?? [], saves);
  };

  // Group skills by ability
  const skillsByAbility = DND_ABILITIES.map((abi) => ({
    ability: abi.key,
    label: abi.label,
    skills: DND_SKILLS.filter((s) => s.ability === abi.key),
  })).filter((g) => g.skills.length > 0);

  return (
    <div className="space-y-4">
      {/* Saving throws */}
      <section className="card p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Jets de sauvegarde</h2>
          <span className="text-xs text-ink-400">
            Bonus de maîtrise {formatModifier(profBonus)}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {DND_ABILITIES.map((abi) => {
            const score = abilityScore(character, abi.key);
            const mod = abilityModifier(score);
            const proficient = saveProficiency(character, abi.key);
            const total = mod + (proficient ? profBonus : 0);
            return (
              <button
                type="button"
                key={abi.key}
                onClick={() => toggleSave(abi.key)}
                className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-colors text-left ${
                  proficient
                    ? 'bg-blood-50 border-blood-300'
                    : 'bg-parchment-100 border-parchment-200 hover:border-parchment-300'
                }`}
                aria-pressed={proficient}
              >
                <span className="text-sm font-medium text-ink-700">{abi.label}</span>
                <span className="flex items-center gap-1.5">
                  {proficient && <span className="text-blood-600 text-xs">●</span>}
                  <span className="font-bold text-ink-800">{formatModifier(total)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Skills grouped by ability */}
      <section className="card p-4 sm:p-5 space-y-3">
        <h2 className="font-display text-lg font-semibold">Compétences</h2>
        {skillsByAbility.map((group) => (
          <div key={group.ability}>
            <div className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-1.5">
              {ABILITY_SHORT_FR[group.ability as AbilityKey]} — {group.label}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {group.skills.map((skill) => {
                const score = abilityScore(character, skill.ability);
                const mod = abilityModifier(score);
                const prof = skillProficiency(character, skill.key);
                const total = mod + (prof === 1 ? profBonus : prof === 2 ? profBonus * 2 : 0);
                return (
                  <button
                    type="button"
                    key={skill.key}
                    onClick={() => toggleSkill(skill.key)}
                    className={`w-full flex items-center justify-between gap-1 px-3 py-2 rounded-lg border transition-colors text-left ${
                      prof > 0
                        ? 'bg-blood-50 border-blood-300'
                        : 'bg-parchment-50 border-parchment-200 hover:border-parchment-300'
                    }`}
                    aria-pressed={prof > 0}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className={`text-xs w-4 shrink-0 ${prof > 0 ? 'text-blood-600' : 'text-parchment-300'}`}
                      >
                        {prof > 0 ? '●' : '○'}
                      </span>
                      <span className="text-sm text-ink-700 truncate">{skill.label}</span>
                    </span>
                    <span className="font-bold text-ink-800 shrink-0">{formatModifier(total)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
