/**
 * Description tab — physical description, portrait, and personality traits.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api';
import type { Character, PatchCharacterPayload } from '@dnd-inventory/shared';

interface Props {
  character: Character;
  charId: number;
  onSaved: () => Promise<void>;
  onError: (msg: string) => void;
}

// Fields that are simple text inputs
const PHYSICAL_FIELDS: Array<{ key: keyof Character; label: string; placeholder?: string }> = [
  { key: 'alignment', label: 'Alignement', placeholder: 'Loyal Bon' },
  { key: 'sex', label: 'Sexe', placeholder: 'M / F' },
  { key: 'age', label: 'Âge', placeholder: '125 ans' },
  { key: 'height', label: 'Taille', placeholder: '1,80 m' },
  { key: 'weight', label: 'Poids', placeholder: '80 kg' },
  { key: 'skin', label: 'Peau', placeholder: 'Pâle' },
  { key: 'eyes', label: 'Yeux', placeholder: 'Bleus' },
  { key: 'hair', label: 'Cheveux', placeholder: 'Noirs, courts' },
];

const PERSONALITY_FIELDS: Array<{ key: keyof Character; label: string; placeholder: string }> = [
  { key: 'personalityTraits', label: 'Traits de personnalité', placeholder: "Je suis animé d'une curiosité insatiable…" },
  { key: 'ideals', label: 'Idéaux', placeholder: 'Le savoir est la plus grande richesse.' },
  { key: 'bonds', label: 'Liens', placeholder: 'Je cherche mon maître disparu.' },
  { key: 'flaws', label: 'Défauts', placeholder: 'Je suis incapable de résister à un mystère.' },
];

export default function CharacterDescriptionTab({ character, charId, onSaved, onError }: Props) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const d: Record<string, string> = {};
    for (const f of PHYSICAL_FIELDS) d[f.key] = (character[f.key] as string) ?? '';
    for (const f of PERSONALITY_FIELDS) d[f.key] = (character[f.key] as string) ?? '';
    d.appearance = character.appearance ?? '';
    setDrafts(d);
  }, [character]);

  const patchCharacter = useCallback(async (payload: PatchCharacterPayload, errMsg: string) => {
    try {
      await api.patch(`/api/characters/${charId}`, payload);
      await onSaved();
    } catch {
      onError(errMsg);
    }
  }, [charId, onSaved, onError]);

  const commitField = (key: string) => {
    const draftVal = drafts[key];
    const currentVal = (character[key as keyof Character] as string) ?? '';
    if (draftVal === undefined || draftVal === currentVal) return;
    patchCharacter({ [key]: draftVal.trim() || null }, 'Erreur de mise à jour');
  };

  const handlePortraitUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Read, resize to max 256x256 via canvas, then encode as base64
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxSize = 256;
        let { width, height } = img;
        if (width > height && width > maxSize) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else if (height > maxSize) {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        patchCharacter({ portraitUrl: dataUrl }, 'Erreur lors du téléversement');
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const removePortrait = () => {
    patchCharacter({ portraitUrl: null }, 'Erreur de mise à jour');
  };

  return (
    <div className="space-y-4">
      {/* Portrait + physical attributes */}
      <section className="card p-4 sm:p-5 space-y-3">
        <h2 className="font-display text-lg font-semibold">Apparence</h2>

        {/* Portrait */}
        <div className="flex items-center gap-4">
          <div className="shrink-0">
            {character.portraitUrl ? (
              <img
                src={character.portraitUrl}
                alt={character.name}
                className="w-24 h-24 rounded-full object-cover border-2 border-parchment-300 shadow-sm"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-parchment-200 flex items-center justify-center text-3xl text-ink-400 border-2 border-parchment-300">
                👤
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePortraitUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="btn-primary text-sm px-3 py-1.5"
            >
              📷 {character.portraitUrl ? 'Changer' : 'Téléverser'}
            </button>
            {character.portraitUrl && (
              <button
                onClick={removePortrait}
                className="text-xs text-red-500 hover:text-red-700"
              >
                Supprimer
              </button>
            )}
          </div>
        </div>

        {/* Physical attributes grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {PHYSICAL_FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="label">{f.label}</span>
              <input
                type="text"
                className="input"
                value={drafts[f.key] ?? ''}
                placeholder={f.placeholder}
                onChange={(e) => setDrafts((d) => ({ ...d, [f.key]: e.target.value }))}
                onBlur={() => commitField(f.key)}
              />
            </label>
          ))}
        </div>

        {/* Appearance textarea */}
        <label className="block">
          <span className="label">Description physique</span>
          <textarea
            className="input min-h-[80px] resize-y"
            value={drafts.appearance ?? ''}
            placeholder="Un elfe élancé portant une robe d'érudit usée…"
            onChange={(e) => setDrafts((d) => ({ ...d, appearance: e.target.value }))}
            onBlur={() => commitField('appearance')}
          />
        </label>
      </section>

      {/* Personality */}
      <section className="card p-4 sm:p-5 space-y-3">
        <h2 className="font-display text-lg font-semibold">Personnalité</h2>
        <div className="space-y-3">
          {PERSONALITY_FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="label">{f.label}</span>
              <textarea
                className="input min-h-[60px] resize-y"
                value={drafts[f.key] ?? ''}
                placeholder={f.placeholder}
                onChange={(e) => setDrafts((d) => ({ ...d, [f.key]: e.target.value }))}
                onBlur={() => commitField(f.key)}
              />
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
