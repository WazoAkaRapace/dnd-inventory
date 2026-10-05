/**
 * Effets de sort sur la CA (v1) — contrat client des routes spell-effects.
 *
 * GET  /api/characters/:id/spell-effects → lignes ACTIVES jointes au nom du sort
 * POST /api/characters/:id/spell-effects { spellId }
 * DELETE /api/spell-effects/:id
 *
 * Le fetch est SILENCIEUX en échec (route absente = aucune puce, aucune
 * erreur : la fiche reste utilisable tant que le serveur n'a pas la
 * fonctionnalité). Persistance d'affichage : une requête, cache état local
 * côté page — pas de react-query, cohérent avec le reste du bandeau.
 */

import { applyAcEffects, type ActiveAcEffect } from '@table-sync/shared';
import api from './api';

/** Une ligne d'effet actif, telle que servie par le JOIN du GET. */
export interface SpellEffectRow {
  id: number;
  spellId: number;
  spellName: string;
  effectKind: string;
  acValue: number;
  tiedToConcentration: boolean;
}

/** Colonnes admises côté client (camelCase attendu, snake_case toléré). */
interface RawSpellEffectRow {
  id?: unknown;
  spellId?: unknown;
  spell_id?: unknown;
  spellName?: unknown;
  spell_name?: unknown;
  nameFr?: unknown;
  name?: unknown;
  effectKind?: unknown;
  effect_kind?: unknown;
  acValue?: unknown;
  ac_value?: unknown;
  tiedToConcentration?: unknown;
  tied_to_concentration?: unknown;
  spell?: unknown;
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeRow(raw: RawSpellEffectRow): SpellEffectRow | null {
  const id = num(raw.id, NaN);
  if (!Number.isFinite(id)) return null;
  // Contrat réel (mapSpellEffect côté API) : le nom vit dans l'objet `spell`
  // imbriqué ({ name, nameFr, srdIndex }) ; les formes plates restent tolérées.
  const nested = raw.spell as { name?: unknown; nameFr?: unknown } | undefined;
  const spellName =
    (typeof raw.spellName === 'string' && raw.spellName) ||
    (typeof raw.spell_name === 'string' && raw.spell_name) ||
    (typeof nested?.name === 'string' && nested.name) ||
    (typeof nested?.nameFr === 'string' && nested.nameFr) ||
    (typeof raw.nameFr === 'string' && raw.nameFr) ||
    (typeof raw.name === 'string' && raw.name) ||
    '';
  return {
    id,
    spellId: num(raw.spellId ?? raw.spell_id, 0),
    spellName,
    effectKind: String(raw.effectKind ?? raw.effect_kind ?? 'ac_bonus'),
    acValue: num(raw.acValue ?? raw.ac_value),
    tiedToConcentration: !!(raw.tiedToConcentration ?? raw.tied_to_concentration ?? false),
  };
}

/** Lignes d'effets actifs du personnage — [] en cas d'erreur/route absente. */
export async function fetchSpellEffects(characterId: number): Promise<SpellEffectRow[]> {
  try {
    const res = await api.get(`/api/characters/${characterId}/spell-effects`);
    const data = res.data?.effects ?? res.data;
    if (!Array.isArray(data)) return [];
    return data
      .map((raw: RawSpellEffectRow) => normalizeRow(raw))
      .filter((r: SpellEffectRow | null): r is SpellEffectRow => r !== null);
  } catch {
    return [];
  }
}

/** Réduction au moteur : ce que computeAC/applyAcEffects consomment. */
export function toActiveAcEffects(rows: SpellEffectRow[]): ActiveAcEffect[] {
  return rows.map((r) => ({ effectKind: r.effectKind, acValue: r.acValue }));
}

/** Libellé court de la contribution : « +2 », « ≥ 16 », « 13 + DEX ». */
export function effectModLabel(effect: { effectKind: string; acValue: number }): string {
  if (effect.effectKind === 'ac_floor') return `≥ ${effect.acValue}`;
  if (effect.effectKind === 'ac_set_formula') return `${effect.acValue} + DEX`;
  return `${effect.acValue >= 0 ? '+' : ''}${effect.acValue}`;
}

/** CA après application d'UN effet (annonce de lancement — pure). */
export function previewAc(
  currentAc: number,
  dexMod: number,
  effect: { effectKind: string; acValue: number },
): number {
  return applyAcEffects(
    currentAc,
    [{ effectKind: effect.effectKind, acValue: effect.acValue }],
    dexMod,
  );
}

/** Ligne de SPELL_AC_EFFECTS (kind/value) → forme du moteur (effectKind/acValue). */
export function defToEffect(def: { kind: string; value: number }): {
  effectKind: string;
  acValue: number;
} {
  return { effectKind: def.kind, acValue: def.value };
}
