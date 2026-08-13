/**
 * A single combatant in the initiative order list.
 * Shows initiative, name, AC, HP bar, conditions.
 * GM controls: damage/heal/resist, initiative roll, conditions editor, delete.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Combatant, CombatantCondition } from '@dnd-inventory/shared';
import ConditionsEditor from './ConditionsEditor';
import MonsterStatBlock from './MonsterStatBlock';

interface Props {
  combatant: Combatant;
  label?: string; // override display name (e.g., "Gobelin 1" for group members)
  isCurrent: boolean;
  isGM: boolean;
  canSetInitiative: boolean; // player can set their own
  hideInitiative?: boolean; // initiative shown in parent group header
  onPatch: (id: number, patch: Partial<Combatant>) => void;
  onDelete?: (id: number) => void; // omitted when delete handled by group header
  onSetInitiative: (id: number, initiative: number) => void;
}

function rollD20(bonus: number): number {
  return Math.floor(Math.random() * 20) + 1 + bonus;
}

export default function CombatantRow({
  combatant,
  label,
  isCurrent,
  isGM,
  canSetInitiative,
  hideInitiative,
  onPatch,
  onDelete,
  onSetInitiative,
}: Props) {
  const [damageInput, setDamageInput] = useState('');
  const [showActions, setShowActions] = useState(false);
  const [showConditions, setShowConditions] = useState(false);
  const [showStatBlock, setShowStatBlock] = useState(false);
  const [editHp, setEditHp] = useState('');
  const [editMaxHp, setEditMaxHp] = useState('');
  const [initInput, setInitInput] = useState(
    combatant.initiative !== null ? String(combatant.initiative) : '',
  );

  const hpPct = combatant.hitPoints !== null && combatant.maxHitPoints
    ? Math.max(0, Math.min(100, (combatant.hitPoints / combatant.maxHitPoints) * 100))
    : 0;
  const hpColor = hpPct > 50 ? 'bg-green-500' : hpPct > 25 ? 'bg-yellow-500' : 'bg-red-500';

  const applyDamage = (multiplier: number) => {
    const val = parseInt(damageInput, 10);
    if (isNaN(val) || val <= 0) return;
    const max = combatant.maxHitPoints ?? 0;
    const cur = combatant.hitPoints ?? 0;
    const delta = Math.floor(val * multiplier);
    const newHp = Math.max(0, Math.min(max, cur - delta));
    onPatch(combatant.id, { hitPoints: newHp });
    setDamageInput('');
    setShowActions(false);
  };

  const applyHeal = () => {
    const val = parseInt(damageInput, 10);
    if (isNaN(val) || val <= 0) return;
    const max = combatant.maxHitPoints ?? 0;
    const cur = combatant.hitPoints ?? 0;
    const newHp = Math.max(0, Math.min(max, cur + val));
    // Auto-revive when healing a defeated creature above 0 HP
    const patch: Partial<Combatant> = { hitPoints: newHp };
    if (newHp > 0 && combatant.defeated) patch.defeated = false;
    onPatch(combatant.id, patch);
    setDamageInput('');
    setShowActions(false);
  };

  /** Apply direct HP/max HP edit. Revives if HP > 0 and was defeated. */
  const applyDirectHp = () => {
    const patch: Partial<Combatant> = {};
    if (editMaxHp.trim() !== '') {
      const max = Math.max(1, parseInt(editMaxHp, 10));
      patch.maxHitPoints = max;
    }
    if (editHp.trim() !== '') {
      const max = patch.maxHitPoints ?? combatant.maxHitPoints ?? 1;
      const hp = Math.max(0, Math.min(max, parseInt(editHp, 10)));
      patch.hitPoints = hp;
      // Auto-revive if HP > 0
      if (hp > 0 && combatant.defeated) patch.defeated = false;
      // Auto-defeat if HP = 0
      if (hp === 0) patch.defeated = true;
    }
    if (Object.keys(patch).length === 0) return;
    onPatch(combatant.id, patch);
    setEditHp('');
    setEditMaxHp('');
    setShowActions(false);
  };

  const handleInitSubmit = () => {
    const val = parseInt(initInput, 10);
    if (!isNaN(val)) {
      onSetInitiative(combatant.id, Math.max(0, Math.min(40, val)));
    }
  };

  return (
    <div
      className={`card p-3 transition-all ${
        isCurrent ? 'ring-2 ring-blood-500 shadow-lg' : ''
      } ${combatant.defeated ? 'opacity-50 grayscale' : ''}`}
    >
      <div className="flex items-center gap-3">
        {/* Initiative (hidden when shown in group header) */}
        {!hideInitiative && (
          <div className="flex flex-col items-center justify-center w-12 shrink-0">
            {combatant.initiative === null && (isGM || canSetInitiative) ? (
              <input
                type="number"
                value={initInput}
                onChange={(e) => setInitInput(e.target.value)}
                onBlur={handleInitSubmit}
                onKeyDown={(e) => e.key === 'Enter' && handleInitSubmit()}
                placeholder="—"
                className="input w-10 h-10 text-center p-0 text-sm font-bold"
                title="Saisir l'initiative"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-ink-900 text-parchment-50 flex items-center justify-center font-bold text-sm">
                {combatant.initiative ?? '—'}
              </div>
            )}
            {isGM && combatant.initiative === null && (
              <button
                onClick={() => onSetInitiative(combatant.id, rollD20(combatant.initiativeBonus))}
                className="text-xs text-blood-600 hover:text-blood-700 mt-1"
                title="Lancer l'initiative (d20 + DEX)"
              >
                🎲
              </button>
            )}
          </div>
        )}

        {/* Name + type */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-semibold">
              {combatant.type === 'player' ? '🧙' : '👹'} {label ?? combatant.name}
            </span>
            {combatant.defeated && <span className="text-lg">💀</span>}
            {isCurrent && !combatant.defeated && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-blood-600 text-parchment-50 animate-pulse">
                ◀ Tour
              </span>
            )}
          </div>
          {/* Conditions */}
          {combatant.conditions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {combatant.conditions.map((c) => (
                <span
                  key={c.name}
                  className="px-1.5 py-0.5 rounded text-xs bg-orange-100 text-orange-700"
                  title={c.duration == null ? "Jusqu'à dissipation" : `${c.duration} tour(s) restant(s)`}
                >
                  {c.name}
                  {c.duration != null && <span className="ml-1 font-mono">{c.duration}t</span>}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* AC + HP (hidden for combatants the viewer doesn't own — null from API) */}
        <div className="flex items-center gap-2 shrink-0">
          {combatant.armorClass !== null && (
            <div className="flex flex-col items-center">
              <span className="text-xs text-ink-400">CA</span>
              <span className="px-2 py-0.5 rounded bg-ink-100 text-ink-700 font-mono font-semibold text-sm">
                {combatant.armorClass}
              </span>
            </div>
          )}
          {combatant.hitPoints !== null && combatant.maxHitPoints !== null && (
            <div className="flex flex-col items-center min-w-[80px]">
              <span className="text-xs text-ink-400">PV</span>
              <div className="flex items-center gap-1">
                <div className="w-16 h-5 rounded-full bg-parchment-200 overflow-hidden relative">
                  <div className={`h-full ${hpColor} transition-all`} style={{ width: `${hpPct}%` }} />
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-mono font-semibold">
                    {combatant.hitPoints}/{combatant.maxHitPoints}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions (GM) */}
        {isGM && (
          <div className="flex items-center gap-1 shrink-0">
            {combatant.monsterSlug && (
              <button
                onClick={() => setShowStatBlock(true)}
                className="btn-secondary text-xs px-2 py-1"
                title="Stat block"
              >
                📜
              </button>
            )}
            <button
              onClick={() => setShowActions(!showActions)}
              className="btn-secondary text-xs px-2 py-1"
              title="Dégâts / soins / PV"
            >
              ⚔
            </button>
            {!combatant.defeated && (
              <button
                onClick={() => setShowConditions(true)}
                className="btn-secondary text-xs px-2 py-1"
                title="Conditions"
              >
                ✎
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(combatant.id)}
                className="text-ink-400 hover:text-red-600 text-sm p-1"
                title="Retirer"
              >
                🗑
              </button>
            )}
          </div>
        )}
      </div>

      {/* Damage/heal bottom sheet (portal to body to escape card's backdrop-filter stacking context) */}
      {showActions && isGM && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
          onClick={() => setShowActions(false)}
        >
          <div
            className="card w-full max-w-md rounded-b-none p-4 sheet-enter"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-semibold text-sm">
                {label ?? combatant.name}{combatant.hitPoints !== null ? ` — PV ${combatant.hitPoints}/${combatant.maxHitPoints}` : ''}
              </h3>
              <button
                onClick={() => setShowActions(false)}
                className="btn-ghost text-ink-500 p-1 text-sm"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>
            <input
              type="number"
              value={damageInput}
              onChange={(e) => setDamageInput(e.target.value)}
              placeholder="Montant"
              className="input w-full text-center text-lg mb-3"
              autoFocus
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => applyDamage(1)}
                className="btn-secondary text-sm bg-red-100 text-red-700 hover:bg-red-200 py-3"
              >
                ⚔ Dégâts
              </button>
              <button
                onClick={() => applyDamage(0.5)}
                className="btn-secondary text-sm bg-orange-100 text-orange-700 hover:bg-orange-200 py-3"
                title="Résistance : demi-dégâts"
              >
                🛡 Résist
              </button>
              <button
                onClick={applyHeal}
                className="btn-secondary text-sm bg-green-100 text-green-700 hover:bg-green-200 py-3"
              >
                ❤ Soins
              </button>
              <button
                onClick={() => { onPatch(combatant.id, { defeated: !combatant.defeated }); setShowActions(false); }}
                className="btn-secondary text-sm py-3"
              >
                {combatant.defeated ? '✨ Réanimer' : '💀 Vaincu'}
              </button>
            </div>

            {/* Direct HP / Max HP edit */}
            <div className="mt-3 pt-3 border-t border-parchment-200">
              <p className="text-xs text-ink-400 mb-2">Modification directe</p>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="text-xs text-ink-500 block mb-1">PV actuels</label>
                  <input
                    type="number"
                    value={editHp}
                    onChange={(e) => setEditHp(e.target.value)}
                    placeholder={combatant.hitPoints !== null ? String(combatant.hitPoints) : '—'}
                    className="input w-full text-center text-sm"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-ink-500 block mb-1">PV max</label>
                  <input
                    type="number"
                    value={editMaxHp}
                    onChange={(e) => setEditMaxHp(e.target.value)}
                    placeholder={combatant.maxHitPoints !== null ? String(combatant.maxHitPoints) : '—'}
                    className="input w-full text-center text-sm"
                  />
                </div>
                <button
                  onClick={applyDirectHp}
                  disabled={editHp.trim() === '' && editMaxHp.trim() === ''}
                  className="btn-primary text-sm py-2 px-4 disabled:opacity-40"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}

      <ConditionsEditor
        open={showConditions}
        onClose={() => setShowConditions(false)}
        conditions={combatant.conditions}
        onSave={(conds: CombatantCondition[]) => onPatch(combatant.id, { conditions: conds })}
        combatantName={combatant.name}
      />

      <MonsterStatBlock
        open={showStatBlock}
        slug={combatant.monsterSlug}
        onClose={() => setShowStatBlock(false)}
      />
    </div>
  );
}
