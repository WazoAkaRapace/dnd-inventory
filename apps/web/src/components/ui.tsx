import React, { useEffect, useRef, useCallback } from 'react';
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
  if (weightKg === null) return <span className="text-xs text-ink-400">poids ?</span>;
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
  const encPos = Math.min(100, (encumberedKg / maxCarryKg) * 100);
  const heavyPos = Math.min(100, (heavilyEncumberedKg / maxCarryKg) * 100);

  return (
    <div
      className="space-y-1.5"
      role="progressbar"
      aria-valuenow={Math.round(totalWeightKg * 100) / 100}
      aria-valuemin={0}
      aria-valuemax={maxCarryKg}
      aria-valuetext={`${totalWeightKg.toFixed(1)} kg sur ${maxCarryKg} kg, ${ENCUMBRANCE_LABELS_FR[tier]}`}
    >
      <div className="flex items-baseline justify-between">
        <span className="font-display text-sm font-semibold text-ink-900">
          {totalWeightKg.toFixed(1)} / {maxCarryKg} kg
        </span>
        <span className={`text-xs font-medium ${tierColor(tier)}`}>{ENCUMBRANCE_LABELS_FR[tier]}</span>
      </div>
      <div className="relative h-3 bg-parchment-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} transition-all duration-300 rounded-full`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
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
    <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm" role="alert">
      {message}
    </div>
  );
}

export function EmptyState({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return (
    <div className="text-center py-12 px-4">
      <div className="text-4xl mb-2" aria-hidden="true">{icon}</div>
      <p className="text-ink-700 font-medium">{title}</p>
      {hint && <p className="text-ink-400 text-sm mt-1">{hint}</p>}
    </div>
  );
}

// ---------- Toast system ----------

export interface Toast {
  id: number;
  message: string;
  kind: 'success' | 'error';
}

export function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center pointer-events-none"
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast-enter pointer-events-auto px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium max-w-sm ${
            t.kind === 'success'
              ? 'bg-green-600 text-white'
              : 'bg-red-600 text-white'
          }`}
          onClick={() => onDismiss(t.id)}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

// ---------- Modal with focus trap ----------

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
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  // Move focus into modal and trap it
  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement;

    const modal = modalRef.current;
    if (modal) {
      const focusable = modal.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      focusable?.focus();
    }

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Tab' && modalRef.current) {
        const focusables = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
      previousFocus.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="card w-full sm:max-w-md max-h-[85vh] overflow-y-auto rounded-b-none sm:rounded-b-2xl p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="btn-ghost p-1" aria-label="Fermer">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------- Bottom sheet (mobile catalog) ----------

export function BottomSheet({
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
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 lg:hidden"
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        className="sheet-enter card w-full max-w-6xl max-h-[88vh] rounded-b-none flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between p-4 border-b border-parchment-200 shrink-0">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="btn-ghost p-1" aria-label="Fermer">✕</button>
        </div>
        <div className="overflow-y-auto p-4 flex-1">{children}</div>
      </div>
    </div>
  );
}
