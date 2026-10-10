import type { CharacterSummary, PartyDetail } from '@table-sync/shared';
import { coinsTotalCp, EMPTY_COINS, spendCoins, type CoinAmounts } from '@table-sync/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api';
import { EmptyState, LoadingSpinner, Modal, NumberField } from '../../components/ui';
import { coinLabel } from '../../i18n/labels';
import { COIN_FIELDS } from './CoinPurse';
import { apiError, type CoinsState } from './types';

// ---------- Donner à… (transfert de bourse entre personnages) ----------
// Quatrième verbe de la bourse : la main tendue. Le destinataire vient du
// groupe (même source que TransferModal), les montants par dénomination des
// steppers du changeur (CoinTransactionModal). La conversion — casse minimale
// depuis la bourse du DONNEUR — est faite par le SERVEUR (transfer-coins) ;
// le grand livre ci-dessous rejoue le même moteur partagé (spendCoins) pour
// afficher avant → après AVANT tout engagement.

function amountsOf(coins: CoinsState): CoinAmounts {
  return {
    cp: coins.copper,
    sp: coins.silver,
    ep: coins.electrum,
    gp: coins.gold,
    pp: coins.platinum,
  };
}

/** Les dénominations de la bourse, plus grandes d'abord, zéros sautés. */
function formatPurse(amounts: CoinAmounts): string {
  const parts = COIN_FIELDS.map(({ unit }) => ({ unit, qty: amounts[unit] }))
    .reverse()
    .filter((p) => p.qty > 0)
    .map((p) => `${p.qty} ${coinLabel(p.unit)}`);
  return parts.length > 0 ? parts.join(' · ') : '0';
}

/** Un manque en cuivre, en pièces courantes seulement (PO · PA · PC). */
function formatPlainCp(totalCp: number): string {
  const gp = Math.floor(totalCp / 100);
  const sp = Math.floor((totalCp % 100) / 10);
  const cp = totalCp % 10;
  const parts: string[] = [];
  if (gp > 0) parts.push(`${gp} ${coinLabel('gp')}`);
  if (sp > 0) parts.push(`${sp} ${coinLabel('sp')}`);
  if (cp > 0 || parts.length === 0) parts.push(`${cp} ${coinLabel('cp')}`);
  return parts.join(' · ');
}

interface CoinGiveModalProps {
  open: boolean;
  charId: number;
  /** Character-level route guard — viewer sheets never open this door. */
  partyId?: string;
  /** Purse snapshot, taken when the door opens (same contract as the changeur). */
  coins: CoinsState;
  onClose: () => void;
  /** Host refreshes the sheet + closes on resolve; errors come via onError. */
  onTransferred: () => void | Promise<void>;
  onError: (msg: string) => void;
}

export function CoinGiveModal({
  open,
  charId,
  partyId,
  coins,
  onClose,
  onTransferred,
  onError,
}: CoinGiveModalProps) {
  const { t } = useTranslation();
  const [party, setParty] = useState<PartyDetail | null>(null);
  const [loadingParty, setLoadingParty] = useState(false);
  const [targetId, setTargetId] = useState<number | null>(null);
  const [amounts, setAmounts] = useState<CoinAmounts>({ ...EMPTY_COINS });
  const [submitting, setSubmitting] = useState(false);

  // Même source que TransferModal : le groupe porte les destinataires.
  useEffect(() => {
    if (!open || !partyId) return;
    let cancelled = false;
    setLoadingParty(true);
    api
      .get<PartyDetail>(`/api/parties/${partyId}`)
      .then((res) => {
        if (!cancelled) setParty(res.data);
      })
      .catch((err: unknown) => {
        if (!cancelled) onError(apiError(err, t('transfert.groupe.introuvable')));
      })
      .finally(() => {
        if (!cancelled) setLoadingParty(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, partyId, onError, t]);

  // Brouillon vierge à chaque ouverture — la bourse est figée à l'ouverture
  // de la porte (un rafraîchi WS en pleine saisie n'écrase pas le brouillon).
  useEffect(() => {
    if (open) {
      setAmounts({ ...EMPTY_COINS });
      setTargetId(null);
    }
  }, [open]);

  const others: CharacterSummary[] = party ? party.characters.filter((c) => c.id !== charId) : [];

  const step = (unit: keyof CoinAmounts, delta: number) => {
    setAmounts((a) => ({ ...a, [unit]: Math.max(0, a[unit] + delta) }));
  };

  // Aperçu pur du moteur partagé — le serveur rejouera la même conversion
  // (spendCoins, casse minimale) au moment du transfert.
  const purse = amountsOf(coins);
  const totalEntered = coinsTotalCp(amounts);
  const spend = totalEntered > 0 ? spendCoins(purse, amounts) : null;
  const shortfallCp = spend && !spend.ok ? spend.shortfallCp : null;
  const result = spend?.ok ? spend.purse : null;
  const canSubmit = !submitting && !!targetId && result !== null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !targetId) return;
    setSubmitting(true);
    try {
      await api.post(`/api/characters/${charId}/transfer-coins`, {
        toCharacterId: targetId,
        amounts,
      });
      await onTransferred();
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { error?: string; shortfallCp?: number } } };
      const short = e2.response?.data?.shortfallCp;
      onError(
        typeof short === 'number'
          ? t('bourse.manque', { amount: formatPlainCp(short) })
          : apiError(err, t('transfert.echec.du.transfert')),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('bourse.donner.titre')}>
      {loadingParty ? (
        <LoadingSpinner label={t('transfert.chargement.du.groupe')} />
      ) : others.length === 0 ? (
        <EmptyState
          icon="👤"
          title={t('transfert.aucun.autre.personnage')}
          hint={t('transfert.aucun.destinataire.dans.ce.groupe')}
        />
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label" htmlFor="give-coins-target">
              {t('transfert.destinataire')}
            </label>
            <select
              id="give-coins-target"
              className="input"
              value={targetId ?? ''}
              onChange={(e) => setTargetId(e.target.value === '' ? null : Number(e.target.value))}
              required
            >
              <option value="">— {t('transfert.choisir')} —</option>
              {others.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.ownerName})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            {COIN_FIELDS.map(({ key, unit, color }) => (
              <div key={key} className="flex items-center gap-3">
                <label
                  className="label flex items-center gap-1.5 w-16 shrink-0"
                  htmlFor={`give-coin-amt-${unit}`}
                >
                  <span
                    className="inline-block w-3 h-3 rounded-full border border-parchment-300 shrink-0"
                    style={{ backgroundColor: color }}
                    aria-hidden="true"
                  />
                  {coinLabel(unit)}
                </label>
                <div className="flex-1 flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => step(unit, -1)}
                    className="w-11 h-11 rounded-lg bg-parchment-200 hover:bg-parchment-300 text-lg font-medium flex items-center justify-center transition-colors"
                    aria-label={t('rangee.diminuer.itemname', { itemName: coinLabel(unit) })}
                  >
                    −
                  </button>
                  <NumberField
                    id={`give-coin-amt-${unit}`}
                    min={0}
                    className="input w-20 text-center font-mono"
                    value={amounts[unit]}
                    zeroAsEmpty
                    emptyAsZero // une dénomination vidée compte pour 0 (#107)
                    inputMode="numeric"
                    onChange={(n) =>
                      setAmounts((a) => ({ ...a, [unit]: Math.max(0, Math.floor(n)) }))
                    }
                    aria-label={t('bourse.quantite.de.coinlabel.unit', {
                      coinLabel_unit: coinLabel(unit),
                    })}
                  />
                  <button
                    type="button"
                    onClick={() => step(unit, 1)}
                    className="w-11 h-11 rounded-lg bg-parchment-200 hover:bg-parchment-300 text-lg font-medium flex items-center justify-center transition-colors"
                    aria-label={t('rangee.augmenter.itemname', { itemName: coinLabel(unit) })}
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Grand livre — avant → après, encre imprimée ; le seul retour live */}
          <div className="pt-3 border-t border-parchment-200 space-y-1" aria-live="polite">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-ink-400">{t('bourse.ledger.avant')}</span>
              <span className="font-mono text-sm text-ink-500">{formatPurse(purse)}</span>
            </div>
            {shortfallCp !== null ? (
              <p className="text-sm font-medium text-ink-900 pt-1">
                {t('bourse.manque', { amount: formatPlainCp(shortfallCp) })}
              </p>
            ) : (
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-ink-400">{t('bourse.ledger.apres')}</span>
                <span className="font-mono text-sm font-semibold text-ink-900">
                  {formatPurse(result ?? purse)}
                </span>
              </div>
            )}
          </div>

          <button type="submit" disabled={!canSubmit} className="btn-primary w-full">
            {submitting
              ? t('transfert.transfert')
              : totalEntered > 0
                ? `${t('bourse.donner.cta')} ${formatPurse(amounts)}`
                : t('bourse.donner.cta')}
          </button>
        </form>
      )}
    </Modal>
  );
}
