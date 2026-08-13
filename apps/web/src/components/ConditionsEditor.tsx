/**
 * Bottom sheet for editing conditions on a combatant.
 * Uses the 16 SRD conditions (DND_CONDITIONS_FR) with optional durations.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { DND_CONDITIONS_FR } from '@dnd-inventory/shared';
import type { CombatantCondition } from '@dnd-inventory/shared';

interface Props {
  open: boolean;
  onClose: () => void;
  conditions: CombatantCondition[];
  onSave: (conditions: CombatantCondition[]) => void;
  combatantName: string;
}

const CONDITION_ICONS: Record<string, string> = {
  'Aveuglé': '🙈',
  'Assourdi': '🔇',
  'Charmé': '💕',
  'Effrayé': '😱',
  'Empoisonné': '☠️',
  'En feu': '🔥',
  'Entravé': '🪢',
  'Étourdi': '💫',
  'Inconscient': '😴',
  'Invisible': '👻',
  'Agrippé': '🤝',
  'À terre': '🔽',
  'Paralysé': '🧊',
  'Pétrifié': '🗿',
  'Possédé': '👁',
  'Neutralisé': '✖️',
};

export default function ConditionsEditor({ open, onClose, conditions, onSave, combatantName }: Props) {
  const [draft, setDraft] = useState<CombatantCondition[]>(conditions);

  // Reset draft when modal opens
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) {
    setDraft(conditions);
    setLastOpen(true);
  }
  if (!open && lastOpen) setLastOpen(false);

  const toggle = (name: string) => {
    const existing = draft.find((c) => c.name === name);
    if (existing) {
      setDraft(draft.filter((c) => c.name !== name));
    } else {
      setDraft([...draft, { name, duration: null }]); // null = until dispelled
    }
  };

  const setDuration = (name: string, duration: number | null) => {
    setDraft(draft.map((c) => (c.name === name ? { ...c, duration } : c)));
  };

  const activeSet = new Set(draft.map((c) => c.name));

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
        <div className="flex items-center justify-between p-4 border-b border-parchment-200 shrink-0">
          <h2 className="font-display text-lg font-semibold">Conditions — {combatantName}</h2>
          <button onClick={onClose} className="btn-ghost text-ink-500 p-1" aria-label="Fermer">✕</button>
        </div>
        <div className="overflow-y-auto p-4 flex-1 space-y-2">
          {DND_CONDITIONS_FR.map((cond) => {
            const active = activeSet.has(cond);
            const entry = draft.find((c) => c.name === cond);
            return (
              <div
                key={cond}
                className={`flex items-center gap-3 p-2 rounded-lg border transition-colors ${
                  active ? 'border-blood-300 bg-blood-50' : 'border-parchment-200'
                }`}
              >
                <button
                  onClick={() => toggle(cond)}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0 transition-colors ${
                    active ? 'bg-blood-100' : 'bg-parchment-100 hover:bg-parchment-200'
                  }`}
                  aria-label={cond}
                >
                  {CONDITION_ICONS[cond] ?? '❓'}
                </button>
                <span className="flex-1 text-sm font-medium">{cond}</span>
                {active && (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={entry?.duration ?? ''}
                      placeholder="∞"
                      onChange={(e) => {
                        const v = e.target.value;
                        setDuration(cond, v === '' ? null : Math.max(1, parseInt(v, 10)));
                      }}
                      className="input w-14 text-center text-sm"
                      title="Durée en tours (vide = jusqu'à dissipation)"
                    />
                    <span className="text-xs text-ink-400 w-12">
                      {entry?.duration == null ? 'tours ∞' : 'tours'}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 p-4 border-t border-parchment-200 shrink-0">
          <button onClick={onClose} className="btn-secondary flex-1">
            Annuler
          </button>
          <button
            onClick={() => {
              onSave(draft);
              onClose();
            }}
            className="btn-primary flex-1"
          >
            Appliquer
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
