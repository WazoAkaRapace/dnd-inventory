/**
 * Traits tab — free-form character features (class/racial/background/feat/custom)
 * with a {{template}} system that injects computed values from the character's stats.
 */
import { useState, useEffect, useCallback } from 'react';
import api from '../api';
import { Modal, EmptyState } from '../components/ui';
import { useSyncEvent } from '../sync';
import {
  type Character,
  type CharacterFeature,
  type FeatureCategory,
  FEATURE_CATEGORY_LABELS_FR,
  TEMPLATE_VARIABLES,
  renderFeatureTemplate,
} from '@dnd-inventory/shared';

interface Props {
  character: Character;
  charId: number;
  partyId?: string;
  onSaved: () => Promise<void>;
  onError: (msg: string) => void;
}

const CATEGORY_COLORS: Record<FeatureCategory, string> = {
  class: 'bg-blood-50 text-blood-700 border-blood-200',
  racial: 'bg-green-50 text-green-700 border-green-200',
  background: 'bg-blue-50 text-blue-700 border-blue-200',
  feat: 'bg-purple-50 text-purple-700 border-purple-200',
  custom: 'bg-parchment-100 text-ink-600 border-parchment-300',
};

export default function CharacterFeaturesTab({ character, charId, partyId, onSaved, onError }: Props) {
  const [features, setFeatures] = useState<CharacterFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CharacterFeature | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [showTemplateHelp, setShowTemplateHelp] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<FeatureCategory>('class');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/api/characters/${charId}/features`);
      const data = res.data?.features ?? res.data ?? [];
      setFeatures(Array.isArray(data) ? data : []);
    } catch {
      setFeatures([]);
    } finally {
      setLoading(false);
    }
  }, [charId]);

  useEffect(() => { load(); }, [load]);

  // Real-time sync
  const currentPartyId = partyId ? Number(partyId) : undefined;
  useSyncEvent((event) => {
    if (event.type === 'character:change' && event.characterId === charId) {
      load();
    }
  }, [charId, currentPartyId]);

  const openCreate = () => {
    setEditing(null);
    setTitle('');
    setCategory('class');
    setDescription('');
    setShowTemplateHelp(false);
    setShowModal(true);
  };

  const openEdit = (feature: CharacterFeature) => {
    setEditing(feature);
    setTitle(feature.title);
    setCategory(feature.category);
    setDescription(feature.description ?? '');
    setShowTemplateHelp(false);
    setShowModal(true);
  };

  const save = async () => {
    if (!title.trim()) {
      onError('Le titre est requis');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/api/character-features/${editing.id}`, {
          title: title.trim(),
          category,
          description: description.trim() || null,
        });
      } else {
        await api.post(`/api/characters/${charId}/features`, {
          title: title.trim(),
          category,
          description: description.trim() || undefined,
        });
      }
      setShowModal(false);
      await load();
      await onSaved();
    } catch {
      onError('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await api.delete(`/api/character-features/${id}`);
      setConfirmDelete(null);
      await load();
      await onSaved();
    } catch {
      onError('Erreur lors de la suppression');
    }
  };

  // Group features by category
  const categories = Object.keys(FEATURE_CATEGORY_LABELS_FR) as FeatureCategory[];
  const grouped = categories
    .map((cat) => ({
      category: cat,
      items: features.filter((f) => f.category === cat),
    }))
    .filter((g) => g.items.length > 0);

  if (loading) {
    return <p className="text-sm text-ink-400 animate-pulse">Chargement…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">
          Traits <span className="text-ink-400 text-sm font-normal">({features.length})</span>
        </h2>
        <button onClick={openCreate} className="btn-primary text-sm px-3 py-1.5">
          + Ajouter
        </button>
      </div>

      {features.length === 0 ? (
        <div className="card p-8">
          <EmptyState
            icon="📋"
            title="Aucun trait"
            message="Ajoutez vos capacités de classe, traits raciaux, dons, ou toute autre caractéristique de votre personnage."
          />
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map((group) => (
            <div key={group.category}>
              <div className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2">
                {FEATURE_CATEGORY_LABELS_FR[group.category]} ({group.items.length})
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {group.items.map((feature) => {
                  const rendered = feature.description
                    ? renderFeatureTemplate(feature.description, character)
                    : null;
                  return (
                    <div key={feature.id} className="card p-4 flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-display font-semibold text-ink-800">{feature.title}</h3>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => openEdit(feature)}
                            className="text-ink-400 hover:text-blood-600 text-sm p-1"
                            aria-label={`Modifier ${feature.title}`}
                          >
                            ✎
                          </button>
                          <button
                            onClick={() => setConfirmDelete(feature.id)}
                            className="text-ink-400 hover:text-red-500 text-sm p-1"
                            aria-label={`Supprimer ${feature.title}`}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                      {rendered && (
                        <p className="text-sm text-ink-600 whitespace-pre-line">{rendered}</p>
                      )}
                      <span className={`inline-block self-start text-[10px] px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[feature.category]}`}>
                        {FEATURE_CATEGORY_LABELS_FR[feature.category]}
                      </span>

                      {/* Delete confirmation */}
                      {confirmDelete === feature.id && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-red-600">Supprimer ?</span>
                          <button
                            onClick={() => remove(feature.id)}
                            className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                          >
                            Oui
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="text-xs px-2 py-1 rounded bg-parchment-200 hover:bg-parchment-300"
                          >
                            Non
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'Modifier le trait' : 'Nouveau trait'}
      >
        <div className="space-y-3">
          <label className="block">
            <span className="label">Titre *</span>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Récupération arcanique"
              autoFocus
            />
          </label>

          <label className="block">
            <span className="label">Catégorie</span>
            <select
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value as FeatureCategory)}
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>{FEATURE_CATEGORY_LABELS_FR[cat]}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="label">Description</span>
            <textarea
              className="input min-h-[120px] resize-y"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Une fois par jour lors d'un repos court, récupérez {{level}} emplacements de sort. DD de sort : {{save_dc}}."
            />
          </label>

          {/* Live preview */}
          {description.trim() && (
            <div className="bg-parchment-100 rounded-lg p-3">
              <span className="text-xs font-medium text-ink-400 block mb-1">Aperçu</span>
              <p className="text-sm text-ink-700 whitespace-pre-line">
                {renderFeatureTemplate(description, character)}
              </p>
            </div>
          )}

          {/* Template help */}
          <button
            onClick={() => setShowTemplateHelp((s) => !s)}
            className="text-xs text-blood-600 hover:underline"
          >
            {showTemplateHelp ? '▼' : '▶'} Variables de modèle
          </button>
          {showTemplateHelp && (
            <div className="bg-parchment-50 rounded-lg p-3 border border-parchment-200">
              <p className="text-xs text-ink-500 mb-2">
                Utilisez <code className="bg-parchment-200 px-1 rounded">{'{{variable}}'}</code> pour
                insérer une valeur calculée depuis votre fiche :
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {TEMPLATE_VARIABLES.map((v) => (
                  <div key={v.syntax} className="flex items-center gap-2 text-xs">
                    <code className="bg-parchment-200 px-1.5 py-0.5 rounded text-blood-700 font-mono shrink-0">
                      {v.syntax}
                    </code>
                    <span className="text-ink-500">{v.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={save}
              disabled={saving || !title.trim()}
              className="btn-primary flex-1 disabled:opacity-50"
            >
              {saving ? '…' : editing ? 'Enregistrer' : 'Créer'}
            </button>
            <button
              onClick={() => setShowModal(false)}
              className="btn-ghost text-ink-700"
            >
              Annuler
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
