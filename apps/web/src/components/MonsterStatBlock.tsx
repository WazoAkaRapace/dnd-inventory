/**
 * Bottom sheet showing a full monster stat block.
 * Fetches the monster by slug on open and renders all capabilities:
 * abilities, saves, skills, senses, traits, actions (with attack/damage badges),
 * and legendary actions.
 */
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import api from '../api';
import {
  abilityModifier,
  formatModifier,
  formatCR,
  MONSTER_SIZE_LABELS_FR,
} from '@dnd-inventory/shared';
import type { Monster, MonsterAction } from '@dnd-inventory/shared';

interface Props {
  open: boolean;
  slug: string | null;
  onClose: () => void;
}

// French ability key → short label + capitalized save prefix
const ABILITY_INFO: { key: keyof Monster['abilities']; short: string; savePrefix: string }[] = [
  { key: 'for', short: 'FOR', savePrefix: 'For' },
  { key: 'dex', short: 'DEX', savePrefix: 'Dex' },
  { key: 'con', short: 'CON', savePrefix: 'Con' },
  { key: 'int', short: 'INT', savePrefix: 'Int' },
  { key: 'sag', short: 'SAG', savePrefix: 'Sag' },
  { key: 'cha', short: 'CHA', savePrefix: 'Cha' },
];

const SPEED_LABELS: Record<string, string> = {
  walk: '',
  swim: 'nage',
  fly: 'vol',
  climb: 'escalade',
  burrow: 'creusement',
};

export default function MonsterStatBlock({ open, slug, onClose }: Props) {
  const [monster, setMonster] = useState<Monster | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !slug) return;
    setLoading(true);
    setMonster(null);
    api
      .get(`/api/monsters/${slug}`)
      .then((res) => setMonster(res.data.monster))
      .catch(() => setMonster(null))
      .finally(() => setLoading(false));
  }, [open, slug]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md rounded-b-none flex flex-col sheet-enter"
        style={{ maxHeight: '88vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-parchment-200 shrink-0">
          <h2 className="font-display text-lg font-semibold">
            {monster?.nameFr ?? (loading ? 'Chargement…' : 'Monstre')}
          </h2>
          <button onClick={onClose} className="btn-ghost text-ink-500 p-1" aria-label="Fermer">✕</button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-4 flex-1">
          {loading && <p className="text-sm text-ink-400 text-center py-8">Chargement du stat block…</p>}
          {!loading && !monster && <p className="text-sm text-ink-400 text-center py-8">Monstre introuvable.</p>}
          {monster && <StatBlockBody monster={monster} />}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function StatBlockBody({ monster }: { monster: Monster }) {
  const sizeLabel = MONSTER_SIZE_LABELS_FR[monster.size] ?? monster.size;
  const typeLine = [monster.type, monster.subtype && `(${monster.subtype})`, sizeLabel && `de taille ${sizeLabel}`]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="space-y-4">
      {/* Type line */}
      <p className="text-sm italic text-ink-500">
        {typeLine}
        {monster.alignment && `, ${monster.alignment.toLowerCase()}`}
      </p>

      {/* Core stats: AC, HP, Speed */}
      <div className="space-y-1.5">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-sm">🛡 Classe d'armure</span>
          <span className="text-sm">
            {monster.armorClass}
            {monster.armorDesc && <span className="text-ink-400"> ({monster.armorDesc})</span>}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-sm">❤ Points de vie</span>
          <span className="text-sm">
            {monster.hitPoints}
            {monster.hitDice && <span className="text-ink-400"> ({monster.hitDice})</span>}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-sm">🏃 Vitesse</span>
          <span className="text-sm">{formatSpeed(monster)}</span>
        </div>
      </div>

      {/* Ability scores grid */}
      <div className="grid grid-cols-6 gap-1 text-center border-y border-parchment-200 py-2">
        {ABILITY_INFO.map(({ key, short }) => {
          const score = monster.abilities[key] ?? 10;
          const mod = abilityModifier(score);
          return (
            <div key={key}>
              <div className="text-xs font-bold text-ink-600">{short}</div>
              <div className="text-sm font-mono">{score}</div>
              <div className="text-xs text-ink-400">({formatModifier(mod)})</div>
            </div>
          );
        })}
      </div>

      {/* Saves, skills, senses, languages, CR */}
      <div className="space-y-1.5 text-sm">
        {monster.savingThrows.length > 0 && (
          <div>
            <span className="font-semibold">Jets de sauvegarde</span>
            <span className="text-ink-600 ml-2">{monster.savingThrows.join(', ')}</span>
          </div>
        )}
        {monster.skills.length > 0 && (
          <div>
            <span className="font-semibold">Compétences</span>
            <span className="text-ink-600 ml-2">
              {monster.skills.map((s) => `${s.name}${s.isExpert ? ' (expert)' : ''}`).join(', ')}
            </span>
          </div>
        )}
        {monster.senses && (
          <div>
            <span className="font-semibold">Sens</span>
            <span className="text-ink-600 ml-2">{monster.senses}</span>
            {monster.telepathy && <span className="text-ink-600">, télépathie {monster.telepathy} m</span>}
          </div>
        )}
        <div>
          <span className="font-semibold">Langues</span>
          <span className="text-ink-600 ml-2">
            {monster.languages.length > 0 ? monster.languages.join(', ') : '—'}
          </span>
        </div>
        <div>
          <span className="font-semibold">Puissance</span>
          <span className="text-ink-600 ml-2">
            {formatCR(monster.challengeRating)} ({monster.xp.toLocaleString('fr-FR')} PX)
          </span>
        </div>
      </div>

      {/* Damage modifiers */}
      {(monster.damageResistances?.length || monster.damageImmunities?.length || monster.conditionImmunities?.length) && (
        <div className="space-y-1.5 text-sm">
          {monster.damageResistances && monster.damageResistances.length > 0 && (
            <div>
              <span className="font-semibold">Résistances aux dégâts</span>
              <span className="text-ink-600 ml-2">{monster.damageResistances.join(', ')}</span>
            </div>
          )}
          {monster.damageImmunities && monster.damageImmunities.length > 0 && (
            <div>
              <span className="font-semibold">Immunités aux dégâts</span>
              <span className="text-ink-600 ml-2">{monster.damageImmunities.join(', ')}</span>
            </div>
          )}
          {monster.conditionImmunities && monster.conditionImmunities.length > 0 && (
            <div>
              <span className="font-semibold">Immunités aux états</span>
              <span className="text-ink-600 ml-2">{monster.conditionImmunities.join(', ')}</span>
            </div>
          )}
        </div>
      )}

      {/* Traits */}
      {monster.traits.length > 0 && (
        <ActionSection title="Capacités" actions={monster.traits} />
      )}

      {/* Actions */}
      {monster.actions.length > 0 && (
        <ActionSection title="Actions" actions={monster.actions} />
      )}

      {/* Legendary actions */}
      {monster.legendaryActions.length > 0 && (
        <ActionSection title="Actions légendaires" actions={monster.legendaryActions} />
      )}
    </div>
  );
}

function ActionSection({ title, actions }: { title: string; actions: MonsterAction[] }) {
  return (
    <div>
      <h3 className="font-display font-semibold text-blood-700 border-b border-blood-200 pb-1 mb-2 text-sm">
        {title}
      </h3>
      <div className="space-y-2">
        {actions.map((action, idx) => (
          <ActionEntry key={idx} action={action} />
        ))}
      </div>
    </div>
  );
}

function formatSpeed(monster: Monster): string {
  const parts: string[] = [];
  for (const [mode, value] of Object.entries(monster.speed)) {
    const num = Number(value);
    if (isNaN(num) || num === 0) continue;
    const label = SPEED_LABELS[mode];
    parts.push(label ? `${label} ${num} m` : `${num} m`);
  }
  return parts.length > 0 ? parts.join(', ') : '—';
}

// ---------- Dice rolling ----------

/** Roll a single d20 + bonus for an attack roll */
function rollAttack(bonus: number): { roll: number; natural: number; total: number } {
  const natural = Math.floor(Math.random() * 20) + 1;
  const total = natural + bonus;
  return { roll: total, natural, total };
}

/** Roll a dice formula like "2d6+5" → { total, rolls } */
function rollDamage(formula: string): { total: number; rolls: number[] } {
  const match = formula.match(/^(\d+)d(\d+)(?:([+-]\d+))?$/);
  if (!match) return { total: 0, rolls: [] };
  const numDice = parseInt(match[1], 10);
  const dieSize = parseInt(match[2], 10);
  const flatBonus = match[3] ? parseInt(match[3], 10) : 0;
  const rolls: number[] = [];
  let total = flatBonus;
  for (let i = 0; i < numDice; i++) {
    const r = Math.floor(Math.random() * dieSize) + 1;
    rolls.push(r);
    total += r;
  }
  return { total, rolls };
}

// ---------- Action entry with interactive dice ----------

function ActionEntry({ action }: { action: MonsterAction }) {
  const [attackResult, setAttackResult] = useState<{ roll: number; natural: number; total: number } | null>(null);
  const [damageResult, setDamageResult] = useState<{ total: number; rolls: number[] } | null>(null);

  const handleAttack = () => {
    if (action.attackBonus == null) return;
    setAttackResult(rollAttack(action.attackBonus));
    setDamageResult(null); // clear previous damage
  };

  const handleDamage = () => {
    if (!action.damageDice) return;
    setDamageResult(rollDamage(action.damageDice));
  };

  const isCrit = attackResult?.natural === 20;
  const isFumble = attackResult?.natural === 1;

  return (
    <div className="text-sm">
      <div className="flex items-start gap-2 flex-wrap">
        <span className="font-semibold italic">{action.name}.</span>
        {/* Attack bonus — clickable to roll */}
        {action.attackBonus != null && (
          <button
            onClick={handleAttack}
            className="px-1.5 py-0.5 rounded text-xs font-mono bg-red-100 text-red-700 shrink-0 hover:bg-red-200 active:scale-95 transition-all cursor-pointer"
            title="Cliquer pour lancer le jet d'attaque (d20)"
          >
            🎲 +{action.attackBonus}
          </button>
        )}
        {/* Damage dice — clickable to roll */}
        {action.damageDice && (
          <button
            onClick={handleDamage}
            className="px-1.5 py-0.5 rounded text-xs font-mono bg-orange-100 text-orange-700 shrink-0 hover:bg-orange-200 active:scale-95 transition-all cursor-pointer"
            title="Cliquer pour lancer les dégâts"
          >
            🎲 {action.damageDice}{action.damageType ? ` ${action.damageType}` : ''}
          </button>
        )}
      </div>

      {/* Roll results */}
      {(attackResult || damageResult) && (
        <div className="mt-1 flex flex-wrap gap-2 items-center">
          {/* Attack result */}
          {attackResult && (
            <span className={`px-2 py-1 rounded-lg text-sm font-bold font-mono ${
              isCrit ? 'bg-green-200 text-green-800'
              : isFumble ? 'bg-red-200 text-red-800'
              : 'bg-red-50 text-red-700'
            }`}>
              {isCrit && '🎯 Critique ! '}
              {isFumble && '💥 Échec ! '}
              {attackResult.total} à l'attaque
              <span className="text-xs font-normal ml-1 opacity-70">(d20: {attackResult.natural})</span>
            </span>
          )}
          {/* Damage result */}
          {damageResult && (
            <span className="px-2 py-1 rounded-lg text-sm font-bold font-mono bg-orange-200 text-orange-800">
              {damageResult.total} dégâts{action.damageType ? ` ${action.damageType}` : ''}
              <span className="text-xs font-normal ml-1 opacity-70">({damageResult.rolls.join('+')})</span>
            </span>
          )}
          {/* Clear button */}
          <button
            onClick={() => { setAttackResult(null); setDamageResult(null); }}
            className="text-xs text-ink-400 hover:text-ink-700"
          >
            ✕
          </button>
        </div>
      )}

      {action.desc && (
        <p className="text-ink-600 mt-0.5">{action.desc}</p>
      )}
    </div>
  );
}
