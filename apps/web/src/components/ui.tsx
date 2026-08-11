import React from 'react';
import type {
  ItemCategory,
  Rarity,
  CostUnit,
  EncumbranceState,
} from '@dnd-inventory/shared';
import {
  CATEGORY_LABELS_FR,
  RARITY_LABELS_FR,
  COIN_LABELS_FR,
  ENCUMBRANCE_LABELS_FR,
} from '@dnd-inventory/shared';

export function RarityBadge({ rarity }: { rarity: Rarity }) {
  const cls = `rarity-${rarity}`;
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>
      {RARITY_LABELS_FR[rarity]}
    </span>
  );
}

export function CategoryBadge({ category }: { category: ItemCategory }) {
  return (
    <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-parchment-100 text-ink-500 font-medium">
      {CATEGORY_LABELS_FR[category]}
    </span>
  );
}

export function WeightBadge({ weightKg }: { weightKg: number | null }) {
  if (weightKg === null) return <span className="text-xs text-ink-400">—</span>;
  return <span className="text-xs text-ink-500">{weightKg} kg</span>;
}

export function CostBadge({ qty, unit }: { qty: number | null; unit: CostUnit | null }) {
  if (!qty || !unit) return null;
  return (
    <span className="text-xs text-ink-500">
      {qty} {COIN_LABELS_FR[unit]}
    </span>
  );
}

export function EncumbranceBar({ encumbrance }: { encumbrance: EncumbranceState }) {
  const { totalWeightKg, encumberedKg, heavilyEncumberedKg, maxCarryKg, tier, pct } = encumbrance;
  const barColor = `bar-${tier}`;
  // Position markers for encumbered and heavily thresholds
  const encPos = Math.min(100, (encumberedKg / maxCarryKg) * 100);
  const heavyPos = Math.min(100, (heavilyEncumberedKg / maxCarryKg) * 100);

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="font-display text-sm font-semibold text-ink-900">
          {totalWeightKg.toFixed(2)} / {maxCarryKg} kg
        </span>
        <span className={`text-xs font-medium ${tierColor(tier)}`}>{ENCUMBRANCE_LABELS_FR[tier]}</span>
      </div>
      <div className="relative h-3 bg-parchment-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} transition-all duration-300 rounded-full`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
        {/* Threshold markers */}
        {encPos > 0 && encPos < 100 && (
          <div className="absolute top-0 h-full w-0.5 bg-yellow-700/40" style={{ left: `${encPos}%` }} />
        )}
        {heavyPos > 0 && heavyPos < 100 && (
          <div className="absolute top-0 h-full w-0.5 bg-orange-700/40" style={{ left: `${heavyPos}%` }} />
        )}
      </div>
      <div className="flex justify-between text-xs text-ink-400">
        <span>Encombré: {encumberedKg} kg</span>
        <span>Lourd: {heavilyEncumberedKg} kg</span>
        <span>Max: {maxCarryKg} kg</span>
      </div>
    </div>
  );
}

function tierColor(tier: EncumbranceState['tier']): string {
  switch (tier) {
    case 'unencumbered': return 'text-green-700';
    case 'encumbered': return 'text-yellow-700';
    case 'heavilyEncumbered': return 'text-orange-700';
    case 'overburdened': return 'text-red-700 font-semibold';
  }
}

export function LoadingSpinner({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="text-ink-400 animate-pulse">{label}</div>
    </div>
  );
}

export function ErrorMsg({ message }: { message: string }) {
  return (
    <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">
      {message}
    </div>
  );
}

export function EmptyState({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return (
    <div className="text-center py-12 px-4">
      <div className="text-4xl mb-2">{icon}</div>
      <p className="text-ink-500 font-medium">{title}</p>
      {hint && <p className="text-ink-400 text-sm mt-1">{hint}</p>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="card w-full sm:max-w-md max-h-[85vh] overflow-y-auto rounded-b-none sm:rounded-b-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="btn-ghost p-1">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
