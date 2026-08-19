/**
 * Description tab — identity & class, physical description, portrait, and
 * personality traits.
 */

import {
  type Character,
  CLASS_SUBCLASSES,
  DIVINE_DOMAINS,
  DND_CLASSES,
  findClass,
  LAND_CIRCLES,
  type PatchCharacterPayload,
  SACRED_OATHS,
} from '@dnd-inventory/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api';
import { useAuth } from '../auth';
import { BottomSheet } from '../components/ui';

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
  {
    key: 'personalityTraits',
    label: 'Traits de personnalité',
    placeholder: "Je suis animé d'une curiosité insatiable…",
  },
  { key: 'ideals', label: 'Idéaux', placeholder: 'Le savoir est la plus grande richesse.' },
  { key: 'bonds', label: 'Liens', placeholder: 'Je cherche mon maître disparu.' },
  { key: 'flaws', label: 'Défauts', placeholder: 'Je suis incapable de résister à un mystère.' },
];

/** Classes using the generic `subclass` column, with their French picker label.
 *  Clerc/Druide/Paladin keep their dedicated columns (domaine/cercle/serment). */
const GENERIC_SUBCLASS_LABELS: Record<string, string> = {
  Barbare: 'Voie primordiale',
  Barde: 'Collège bardique',
  Ensorceleur: 'Origine de sorcellerie',
  Guerrier: 'Archétype martial',
  Magicien: 'École de magie',
  Moine: 'Tradition monastique',
  Occultiste: 'Patron surnaturel',
  Rôdeur: 'Archétype de rôdeur',
  Roublard: 'Archétype roublard',
};

/** Niveau RAW d'acquisition des sous-classes à colonne dédiée. */
const DEDICATED_SUBCLASS_LEVELS: Record<string, number> = {
  cercle: 2, // Druide — Cercle druidique
  terrain: 2, // Druide — Terrain du cercle (cercle de la Terre)
  serment: 3, // Paladin — Serment sacré
};

export default function CharacterDescriptionTab({ character, charId, onSaved, onError }: Props) {
  const { user } = useAuth();
  const isOwner = user?.id === character.ownerId;
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Identité & classe — brouillons committés au blur, et à la fermeture de la
  // feuille (fermer par le scrim ne déclenche pas le blur)
  const [classDraft, setClassDraft] = useState(character.characterClass ?? '');
  const [raceDraft, setRaceDraft] = useState(character.race ?? '');
  const [bgDraft, setBgDraft] = useState(character.background ?? '');
  const [levelDraft, setLevelDraft] = useState(String(character.level ?? 1));
  const [identityOpen, setIdentityOpen] = useState(false);

  useEffect(() => {
    const d: Record<string, string> = {};
    for (const f of PHYSICAL_FIELDS) d[f.key] = (character[f.key] as string) ?? '';
    for (const f of PERSONALITY_FIELDS) d[f.key] = (character[f.key] as string) ?? '';
    d.appearance = character.appearance ?? '';
    setDrafts(d);
    setClassDraft(character.characterClass ?? '');
    setRaceDraft(character.race ?? '');
    setBgDraft(character.background ?? '');
    setLevelDraft(String(character.level ?? 1));
  }, [character]);

  const patchCharacter = useCallback(
    async (payload: PatchCharacterPayload, errMsg: string) => {
      try {
        await api.patch(`/api/characters/${charId}`, payload);
        await onSaved();
      } catch {
        onError(errMsg);
      }
    },
    [charId, onSaved, onError],
  );

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

  const commitClass = () => {
    if (classDraft === (character.characterClass ?? '')) return;
    patchCharacter({ characterClass: classDraft.trim() || null }, 'Erreur de mise à jour');
  };

  const commitRace = () => {
    if (raceDraft === (character.race ?? '')) return;
    patchCharacter({ race: raceDraft.trim() || null }, 'Erreur de mise à jour');
  };

  const commitBackground = () => {
    if (bgDraft === (character.background ?? '')) return;
    patchCharacter({ background: bgDraft.trim() || null }, 'Erreur de mise à jour');
  };

  const commitLevel = () => {
    const val = Number(levelDraft);
    const current = character.level ?? 1;
    if (!Number.isFinite(val) || val === current) {
      setLevelDraft(String(current));
      return;
    }
    const clamped = Math.max(1, Math.min(20, Math.round(val)));
    patchCharacter({ level: clamped }, 'Erreur de mise à jour');
  };

  const closeIdentity = () => {
    commitClass();
    commitLevel();
    commitRace();
    commitBackground();
    setIdentityOpen(false);
  };

  // Sous-classes choisies, pour la ligne résumé de la carte identité
  const level = character.level ?? 1;
  const clsName = findClass(character.characterClass)?.name ?? '';
  const subclassLines: string[] = [];
  if (clsName === 'Clerc' && character.divineDomain) {
    const label = DIVINE_DOMAINS.find((d) => d.key === character.divineDomain)?.label;
    if (label) subclassLines.push(label);
  }
  if (clsName === 'Druide' && character.druidCircle) {
    subclassLines.push(
      character.druidCircle === 'terre' ? 'Cercle de la Terre' : 'Cercle de la Lune',
    );
    if (character.druidCircle === 'terre' && character.landCircle) {
      const label = LAND_CIRCLES.find((t) => t.key === character.landCircle)?.label;
      if (label) subclassLines.push(label);
    }
  }
  if (clsName === 'Paladin' && character.sacredOath) {
    const label = SACRED_OATHS.find((o) => o.key === character.sacredOath)?.label;
    if (label) subclassLines.push(label);
  }
  if (character.subclass && CLASS_SUBCLASSES[clsName]) {
    const label = CLASS_SUBCLASSES[clsName].find((s) => s.key === character.subclass)?.label;
    if (label) subclassLines.push(label);
  }
  const hasSubclassPicker =
    clsName === 'Clerc' ||
    clsName === 'Druide' ||
    clsName === 'Paladin' ||
    Boolean(GENERIC_SUBCLASS_LABELS[clsName]);

  return (
    <div className="space-y-4">
      {/* Identity & class — summary card, full editor in bottom sheet */}
      <section className="card p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="section-title">Identité & classe</h2>
          <button
            type="button"
            onClick={() => setIdentityOpen(true)}
            className="btn-secondary text-sm px-3 py-2"
          >
            ✎ Modifier
          </button>
        </div>
        <div className="space-y-1">
          <p className="font-display text-lg font-semibold text-ink-800">
            {character.characterClass
              ? `${character.characterClass} · niv. ${level}`
              : `Niveau ${level} · classe non définie`}
          </p>
          {subclassLines.length > 0 && (
            <p className="text-sm text-ink-700">{subclassLines.join(' · ')}</p>
          )}
          <p className="text-sm text-ink-500">
            {[character.race, character.background].filter(Boolean).join(' · ') ||
              'Race et historique non définies'}
          </p>
        </div>
      </section>

      {/* Identity editor sheet */}
      <BottomSheet
        open={identityOpen}
        onClose={closeIdentity}
        title="Identité & classe"
        mobileOnly={false}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">Classe</span>
              <input
                type="text"
                list="dnd-classes"
                className="input"
                value={classDraft}
                onChange={(e) => setClassDraft(e.target.value)}
                onBlur={commitClass}
                placeholder="Magicien"
              />
              <datalist id="dnd-classes">
                {DND_CLASSES.map((c) => (
                  <option key={c.name} value={c.name} />
                ))}
              </datalist>
            </label>
            <label className="block">
              <span className="label">Niveau</span>
              <input
                type="number"
                min={1}
                max={20}
                className="input"
                value={levelDraft}
                onChange={(e) => setLevelDraft(e.target.value)}
                onBlur={commitLevel}
              />
            </label>
            <label className="block">
              <span className="label">Race</span>
              <input
                type="text"
                className="input"
                value={raceDraft}
                onChange={(e) => setRaceDraft(e.target.value)}
                onBlur={commitRace}
                placeholder="Haut-elfe"
              />
            </label>
            <label className="block">
              <span className="label">Historique</span>
              <input
                type="text"
                className="input"
                value={bgDraft}
                onChange={(e) => setBgDraft(e.target.value)}
                onBlur={commitBackground}
                placeholder="Sage"
              />
            </label>
          </div>
          {hasSubclassPicker && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide">
                Voie de classe
              </p>
              {clsName === 'Clerc' && (
                <label className="flex items-center justify-between gap-3">
                  <span className="label mb-0">Domaine divin</span>
                  <select
                    className="input py-1.5 text-sm w-auto max-w-[60%]"
                    value={character.divineDomain ?? ''}
                    onChange={(e) =>
                      patchCharacter(
                        { divineDomain: e.target.value === '' ? null : e.target.value },
                        'Erreur de mise à jour',
                      )
                    }
                    aria-label="Domaine divin"
                  >
                    <option value="">—</option>
                    {DIVINE_DOMAINS.map((d) => (
                      <option key={d.key} value={d.key}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {clsName === 'Druide' && (
                <label className="flex items-center justify-between gap-3">
                  <span className="label mb-0">
                    Cercle druidique
                    {level < DEDICATED_SUBCLASS_LEVELS.cercle && (
                      <span className="text-ink-400 font-normal">
                        {' '}
                        (niv. {DEDICATED_SUBCLASS_LEVELS.cercle})
                      </span>
                    )}
                  </span>
                  <select
                    className="input py-1.5 text-sm w-auto max-w-[60%]"
                    value={character.druidCircle ?? ''}
                    disabled={level < DEDICATED_SUBCLASS_LEVELS.cercle}
                    onChange={(e) =>
                      patchCharacter(
                        { druidCircle: e.target.value === '' ? null : e.target.value },
                        'Erreur de mise à jour',
                      )
                    }
                    aria-label="Cercle druidique"
                  >
                    <option value="">—</option>
                    <option value="terre">Cercle de la Terre</option>
                    <option value="lune">Cercle de la Lune</option>
                  </select>
                </label>
              )}
              {clsName === 'Druide' && character.druidCircle === 'terre' && (
                <label className="flex items-center justify-between gap-3">
                  <span className="label mb-0">
                    Terrain du cercle
                    {level < DEDICATED_SUBCLASS_LEVELS.terrain && (
                      <span className="text-ink-400 font-normal">
                        {' '}
                        (niv. {DEDICATED_SUBCLASS_LEVELS.terrain})
                      </span>
                    )}
                  </span>
                  <select
                    className="input py-1.5 text-sm w-auto max-w-[60%]"
                    value={character.landCircle ?? ''}
                    disabled={level < DEDICATED_SUBCLASS_LEVELS.terrain}
                    onChange={(e) =>
                      patchCharacter(
                        { landCircle: e.target.value === '' ? null : e.target.value },
                        'Erreur de mise à jour',
                      )
                    }
                    aria-label="Terrain du cercle"
                  >
                    <option value="">—</option>
                    {LAND_CIRCLES.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {clsName === 'Paladin' && (
                <label className="flex items-center justify-between gap-3">
                  <span className="label mb-0">
                    Serment sacré
                    {level < DEDICATED_SUBCLASS_LEVELS.serment && (
                      <span className="text-ink-400 font-normal">
                        {' '}
                        (niv. {DEDICATED_SUBCLASS_LEVELS.serment})
                      </span>
                    )}
                  </span>
                  <select
                    className="input py-1.5 text-sm w-auto max-w-[60%]"
                    value={character.sacredOath ?? ''}
                    disabled={level < DEDICATED_SUBCLASS_LEVELS.serment}
                    onChange={(e) =>
                      patchCharacter(
                        { sacredOath: e.target.value === '' ? null : e.target.value },
                        'Erreur de mise à jour',
                      )
                    }
                    aria-label="Serment sacré"
                  >
                    <option value="">—</option>
                    {SACRED_OATHS.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {(() => {
                // Sous-classe générique (SRD 5.1) — remplit la colonne `subclass`.
                // Verrouillé tant que le niveau d'acquisition de la classe n'est pas
                // atteint (1 : Ensorceleur/Occultiste — 2 : Magicien — 3 : le reste).
                const label = GENERIC_SUBCLASS_LABELS[clsName];
                const options = CLASS_SUBCLASSES[clsName];
                if (!label || !options) return null;
                const unlockLevel = Math.min(...options.map((s) => s.level));
                const locked = level < unlockLevel;
                return (
                  <label className="flex items-center justify-between gap-3">
                    <span className="label mb-0">
                      {label}
                      {locked && (
                        <span className="text-ink-400 font-normal"> (niv. {unlockLevel})</span>
                      )}
                    </span>
                    <select
                      className="input py-1.5 text-sm w-auto max-w-[60%]"
                      value={character.subclass ?? ''}
                      disabled={locked}
                      onChange={(e) =>
                        patchCharacter(
                          { subclass: e.target.value === '' ? null : e.target.value },
                          'Erreur de mise à jour',
                        )
                      }
                      aria-label={label}
                    >
                      <option value="">—</option>
                      {options.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })()}
            </div>
          )}
        </div>
      </BottomSheet>

      {/* Portrait + physical attributes */}
      <section className="card p-4 sm:p-5 space-y-3">
        <h2 className="section-title">Apparence</h2>

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
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn-primary text-sm px-3 py-1.5"
            >
              📷 {character.portraitUrl ? 'Changer' : 'Téléverser'}
            </button>
            {character.portraitUrl && (
              <button
                type="button"
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
        <h2 className="section-title">Personnalité</h2>
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

      {/* Visibility — the owner's call alone (secret prep) */}
      {isOwner && (
        <section className="card p-4 sm:p-5 space-y-3">
          <h2 className="section-title">Visibilité</h2>
          <p className="text-sm text-ink-500">
            {character.hidden ? (
              <>
                🙈 Ce personnage est <strong>caché</strong> : les autres joueurs ne le voient nulle
                part et il ne peut pas rejoindre les combats. Toi et le MD y avez toujours accès.
              </>
            ) : (
              <>
                Ce personnage est visible de toute la table. Cache-le pour préparer une surprise —
                il disparaît des listes des autres joueurs, quitte les combats en cours, et «{' '}
                <em>Ma fiche</em> » pointe sur ton personnage actif.
              </>
            )}
          </p>
          <div>
            <button
              type="button"
              className={character.hidden ? 'btn-primary' : 'btn-secondary'}
              onClick={() =>
                patchCharacter({ hidden: !character.hidden }, 'Impossible de changer la visibilité')
              }
            >
              {character.hidden ? '👁 Révéler à la table' : '🙈 Cacher des autres joueurs'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
