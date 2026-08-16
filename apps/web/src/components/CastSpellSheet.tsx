import type { Spell } from '@dnd-inventory/shared';
import { formatModifier, spellDamageAtLevel, spellSaveDC } from '@dnd-inventory/shared';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Chip } from './ui';

/**
 * Bottom sheet (mobile) / dialog (desktop) to cast a known spell:
 * pick the slot level (with upcast options), warn about concentration
 * conflicts, then consume the slot in one PATCH.
 *
 * Portaled to body — .card's backdrop-filter would break fixed positioning.
 */
export default function CastSpellSheet({
  spell,
  slots,
  slotsUsed,
  concentrating,
  castingMod,
  profBonus,
  charLevel,
  onClose,
  onCast,
}: {
  spell: Spell;
  /** Max slots per level 1-9 (index 0 = level 1). */
  slots: number[];
  slotsUsed: number[];
  concentrating: boolean;
  /** For the DD / attack preview chips. */
  castingMod?: number;
  profBonus?: number;
  charLevel?: number;
  onClose: () => void;
  /** Called with the chosen slot level (0 = cantrip, no slot) and whether it's a ritual cast (no slot either). */
  onCast: (level: number, ritual?: boolean) => Promise<void> | void;
}) {
  const isCantrip = spell.level === 0;
  const canUpcast = !!(spell.higherLevelFr || spell.higherLevel);

  // Castable levels: the spell's own level, plus higher levels when the
  // spell scales ("Aux niveaux supérieurs"), limited to slots remaining.
  const castableLevels: number[] = [];
  if (!isCantrip) {
    for (let lvl = spell.level; lvl <= 9; lvl++) {
      if (lvl > spell.level && !canUpcast) break;
      const remaining = (slots[lvl - 1] ?? 0) - (slotsUsed[lvl - 1] ?? 0);
      if (remaining > 0) castableLevels.push(lvl);
    }
  }

  const [chosen, setChosen] = useState<number>(isCantrip ? 0 : (castableLevels[0] ?? -1));
  const [casting, setCasting] = useState(false);

  const concConflict = spell.concentration && concentrating;

  const cast = async (level: number, ritual = false) => {
    setCasting(true);
    try {
      await onCast(level, ritual);
    } finally {
      setCasting(false);
    }
  };

  const remainingAt = (lvl: number) => (slots[lvl - 1] ?? 0) - (slotsUsed[lvl - 1] ?? 0);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="card w-full sm:max-w-md rounded-b-none sm:rounded-2xl p-4 sheet-enter bg-white max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Lancer ${spell.nameFr ?? spell.name}`}
      >
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <h3 className="section-title">🪄 {spell.nameFr ?? spell.name}</h3>
            <p className="text-xs text-ink-400">
              {isCantrip ? 'Tour de magie' : `Sort de niveau ${spell.level}`}
              {spell.concentration && ' · 🌀 Concentration'}
              {spell.ritual && ' · ⚗ Rituel'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-400 hover:text-ink-700 text-lg leading-none px-1"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        {concConflict && (
          <div className="rounded-lg bg-amber-50 border border-amber-300 p-3 mb-3 text-sm text-amber-900">
            <p className="font-semibold">⚠️ Concentration en cours</p>
            <p className="mt-0.5">
              Tu concentres déjà un sort. Lancer <strong>{spell.nameFr ?? spell.name}</strong>{' '}
              mettra fin au sort précédent.
            </p>
          </div>
        )}

        {isCantrip ? (
          <p className="text-sm text-ink-600 bg-parchment-100 rounded-lg p-3">
            Les tours de magie se lancent à volonté — aucun emplacement à dépenser.
          </p>
        ) : castableLevels.length === 0 ? (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            Aucun emplacement de sort disponible. Il te faut un repos.
          </p>
        ) : (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-ink-500">Emplacement à dépenser :</p>
            {castableLevels.map((lvl) => {
              const selected = chosen === lvl;
              const isUpcast = lvl > spell.level;
              return (
                <button
                  type="button"
                  key={lvl}
                  onClick={() => setChosen(lvl)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                    selected
                      ? 'bg-blood-600 text-white border-blood-700'
                      : 'bg-parchment-50 text-ink-700 border-parchment-200 hover:border-blood-400'
                  }`}
                  aria-pressed={selected}
                >
                  <span className="font-medium">
                    Niveau {lvl}
                    {isUpcast && (
                      <span
                        className={`ml-1.5 text-[10px] font-semibold uppercase ${selected ? 'text-gold-300' : 'text-blood-500'}`}
                      >
                        supérieur
                      </span>
                    )}
                  </span>
                  <span className={selected ? 'text-parchment-100' : 'text-ink-400'}>
                    {remainingAt(lvl)} restant{remainingAt(lvl) > 1 ? 's' : ''}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Damage / DD preview at the chosen level */}
        {(() => {
          const dmg = spellDamageAtLevel(spell, chosen, charLevel ?? 1);
          const hasPreview = dmg.dice || spell.dcJson || spell.attackType;
          if (!hasPreview || (chosen < 0 && !isCantrip)) return null;
          return (
            <div className="flex flex-wrap items-center gap-1.5 mt-3">
              {!isCantrip && chosen > 0 && (
                <span className="text-xs text-ink-400">Au niveau {chosen} :</span>
              )}
              {dmg.dice && (
                <Chip tone="orange">
                  ⚔ {dmg.dice}
                  {dmg.typeFr ? ` dégâts ${dmg.typeFr}` : ''}
                </Chip>
              )}
              {spell.dcJson && castingMod !== undefined && profBonus !== undefined && (
                <Chip tone="blue">🛡 DD {spellSaveDC(castingMod, profBonus)}</Chip>
              )}
              {spell.attackType && castingMod !== undefined && profBonus !== undefined && (
                <Chip tone="red">🎯 {formatModifier(castingMod + profBonus)}</Chip>
              )}
            </div>
          );
        })()}

        <button
          type="button"
          onClick={() => cast(chosen)}
          disabled={casting || chosen < 0}
          className="btn-primary w-full mt-4 py-2.5 disabled:opacity-40"
        >
          {casting
            ? '…'
            : concConflict
              ? '🪄 Lancer et rompre la concentration'
              : isCantrip
                ? '🪄 Lancer le tour de magie'
                : `🪄 Lancer au niveau ${chosen > 0 ? chosen : '—'}`}
        </button>

        {/* Ritual cast: no slot consumed, +10 minutes */}
        {spell.ritual && (
          <button
            type="button"
            onClick={() => cast(spell.level, true)}
            disabled={casting}
            className="w-full mt-2 py-2.5 rounded-lg bg-purple-100 text-purple-800 border border-purple-300 hover:bg-purple-200 font-medium text-sm disabled:opacity-40 transition-colors"
          >
            ⚗ Rituel (10 minutes){' '}
            <span className="font-normal text-purple-500">— sans emplacement</span>
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
