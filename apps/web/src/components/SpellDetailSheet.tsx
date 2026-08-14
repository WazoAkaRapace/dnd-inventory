/**
 * Bottom sheet showing a full spell description.
 * Fetches the spell by id on open and renders name, level, school,
 * casting time, range, components, duration, and the French description.
 */
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import api from '../api';
import { SPELL_SCHOOL_LABELS_FR } from '@dnd-inventory/shared';
import type { Spell, SpellSchool } from '@dnd-inventory/shared';

interface Props {
  open: boolean;
  spellId: number | null;
  onClose: () => void;
}

export default function SpellDetailSheet({ open, spellId, onClose }: Props) {
  const [spell, setSpell] = useState<Spell | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !spellId) return;
    setLoading(true);
    setSpell(null);
    api
      .get(`/api/spells/${spellId}`)
      .then((res) => setSpell(res.data.spell))
      .catch(() => setSpell(null))
      .finally(() => setLoading(false));
  }, [open, spellId]);

  if (!open) return null;

  const levelLabel = spell
    ? spell.level === 0
      ? 'Tour de magie'
      : `Sort de niveau ${spell.level}`
    : '';

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={(e) => { e.stopPropagation(); onClose(); }}
    >
      <div
        className="card w-full max-w-md rounded-b-none flex flex-col sheet-enter bg-white"
        style={{ maxHeight: '88vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-parchment-200 shrink-0">
          <h2 className="font-display text-lg font-semibold">
            {spell?.nameFr ?? (loading ? 'Chargement…' : 'Sort')}
          </h2>
          <button onClick={onClose} className="btn-ghost text-ink-500 p-1" aria-label="Fermer">✕</button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-4 flex-1">
          {loading && <p className="text-sm text-ink-400 text-center py-8">Chargement du sort…</p>}
          {!loading && !spell && <p className="text-sm text-ink-400 text-center py-8">Sort introuvable.</p>}
          {spell && (
            <div className="space-y-3">
              {/* Level + school */}
              <p className="text-sm italic text-ink-500">
                {levelLabel}
                {spell.school && ` de ${SPELL_SCHOOL_LABELS_FR[spell.school as SpellSchool] ?? spell.school}`}
              </p>

              {/* Badges */}
              <div className="flex flex-wrap gap-1.5 text-xs">
                {spell.concentration && (
                  <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">Concentration</span>
                )}
                {spell.ritual && (
                  <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">Rituel</span>
                )}
              </div>

              {/* Properties */}
              <div className="space-y-1 text-sm border-y border-parchment-200 py-2">
                {spell.castingTime && (
                  <div>
                    <span className="font-semibold">Temps d'incantation</span>
                    <span className="text-ink-600 ml-2">{spell.castingTime}</span>
                  </div>
                )}
                {spell.rangeText && (
                  <div>
                    <span className="font-semibold">Portée</span>
                    <span className="text-ink-600 ml-2">{spell.rangeText}</span>
                  </div>
                )}
                <div>
                  <span className="font-semibold">Composantes</span>
                  <span className="text-ink-600 ml-2">
                    {spell.components.join(', ') || '—'}
                    {spell.material && <span className="text-ink-400"> ({spell.material})</span>}
                  </span>
                </div>
                {spell.duration && (
                  <div>
                    <span className="font-semibold">Durée</span>
                    <span className="text-ink-600 ml-2">{spell.duration}</span>
                  </div>
                )}
              </div>

              {/* Description */}
              {spell.descriptionFr && (
                <p className="text-sm text-ink-700 whitespace-pre-line">{spell.descriptionFr}</p>
              )}
              {!spell.descriptionFr && spell.description && (
                <p className="text-sm text-ink-700 whitespace-pre-line">{spell.description}</p>
              )}

              {/* At higher levels */}
              {(spell.higherLevelFr || spell.higherLevel) && (
                <div className="text-sm">
                  <span className="font-semibold">Aux niveaux supérieurs.</span>{' '}
                  <span className="text-ink-600">{spell.higherLevelFr || spell.higherLevel}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
