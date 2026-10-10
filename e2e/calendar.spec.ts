/**
 * Calendrier partagé (#159) — le chip « Jour N » de l'en-tête, l'onglet
 * Calendrier de la fiche (jour courant or, feuilletage, journal de table
 * persistant, avance du jour) et la zone MD du carnet (météo + note MD).
 *
 * L'horloge du seed démarre au jour 1 (aucune écriture carnet au seed) ; les
 * specs qui avancent ou corrigent le jour le remettent en état par l'API pour
 * rester indépendantes (workers: 1, mais l'ordre ne doit rien devoir au hasard).
 */
import { expect } from 'playwright/test';
import { API_BASE, WEB_BASE } from './env';
import { gmTest, openTab, playerTest, seed, sheetUrl } from './fixtures';

/** Remet l'horloge du groupe au jour demandé (correction MD — sans archivage). */
async function setDay(day: number) {
  const res = await fetch(`${API_BASE}/api/parties/${seed().partyId}/campaign`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${seed().gm.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ day }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`E2E : correction du jour → ${res.status}`);
}

/** La rangée (li) d'un jour — l'or (bord + fond) vit sur le conteneur. */
function dayRow(page: import('playwright/test').Page, day: number) {
  return page.getByRole('listitem').filter({
    has: page.getByRole('button', { name: `Jour ${day} — détails et notes` }),
  });
}

/** Ouvre la fiche de la clerc puis son onglet Calendrier (hub mobile). */
async function openCalendar(page: import('playwright/test').Page) {
  await page.goto(sheetUrl(seed().clerc.id));
  await expect(page.getByText(seed().clerc.name).first()).toBeVisible();
  await openTab(page, 'Calendrier');
  // La carte semaine annonce la semaine du jour courant.
  await expect(page.getByText('Semaine 1').first()).toBeVisible();
}

playerTest.describe('Calendrier partagé (#159)', () => {
  playerTest.beforeEach(async ({ page }) => {
    await setDay(1);
    await openCalendar(page);
  });

  playerTest("le chip « Jour N » de l'en-tête mène à la fiche", async ({ page }) => {
    const chip = page.getByRole('link', { name: 'Calendrier de campagne — jour 1' });
    await expect(chip).toBeVisible();
    // Le chip vit à DROITE du titre de la page (fiche : « Personnage ») —
    // retour UI 2026-10-10 (il était à gauche au premier jet).
    const title = page.getByText('Personnage', { exact: true }).first();
    const chipBox = await chip.boundingBox();
    const titleBox = await title.boundingBox();
    expect(chipBox).not.toBeNull();
    expect(titleBox).not.toBeNull();
    expect(chipBox!.x).toBeGreaterThan(titleBox!.x);
  });

  playerTest('le jour courant porte l’or, le feuilletage ±7 fonctionne', async ({ page }) => {
    // Jour 1 courant : bord or (rangée gold-50) + libellé Jour 1.
    const currentRow = dayRow(page, 1);
    await expect(currentRow).toBeVisible();
    await expect(currentRow).toHaveClass(/border-gold-400/);
    await expect(currentRow).toHaveClass(/bg-gold-50/);
    // Un autre jour de la semaine reste parchemin.
    await expect(dayRow(page, 3)).toHaveClass(/border-parchment-200/);

    // Semaine suivante : les jours 8–14 remplacent 1–7, l'or disparaît.
    await page.getByRole('button', { name: 'Semaine suivante' }).click();
    await expect(dayRow(page, 8)).toBeVisible();
    await expect(page.getByText('Semaine 2').first()).toBeVisible();
    // Retour : la semaine 1 réaffiche le jour courant doré.
    await page.getByRole('button', { name: 'Semaine précédente' }).click();
    await expect(currentRow).toHaveClass(/border-gold-400/);
  });

  playerTest('les jours sont listés du dernier au premier (chrono inversée)', async ({ page }) => {
    // Retour UI 2026-10-10 : le DERNIER jour de la semaine en haut.
    const d7 = dayRow(page, 7);
    const d1 = dayRow(page, 1);
    const d7Box = await d7.boundingBox();
    const d1Box = await d1.boundingBox();
    expect(d7Box).not.toBeNull();
    expect(d1Box).not.toBeNull();
    expect(d7Box!.y).toBeLessThan(d1Box!.y);
  });

  playerTest('le journal de table écrit par un joueur survit au rechargement', async ({ page }) => {
    const currentRow = page.getByRole('button', { name: 'Jour 1 — détails et notes' });
    await currentRow.click();
    const journal = page.getByLabel('Journal de table');
    await expect(journal).toBeVisible();
    await journal.fill('Nous avons survécu à une embuscade gobeline.');
    await journal.blur();
    await expect(page.getByText('Journal de table enregistré.')).toBeVisible();

    // Rechargement : le résumé de la rangée porte l'extrait du journal.
    await page.reload();
    await openTab(page, 'Calendrier');
    await expect(
      page.getByText('Nous avons survécu à une embuscade gobeline.').first(),
    ).toBeVisible();
  });

  playerTest('« Jour suivant » avance l’horloge pour toute la table', async ({ page }) => {
    await page.getByRole('button', { name: 'Jour suivant' }).click();
    // Le nouveau jour courant est le 2 : la rangée Jour 2 prend l'or.
    await expect(dayRow(page, 2)).toHaveClass(/border-gold-400/);
    // Le chip d'en-tête suit (même page, requête invalidée par le refetch).
    await expect(page.getByRole('link', { name: 'Calendrier de campagne — jour 2' })).toBeVisible();
  });

  playerTest('la note privée « Ma note » reste au personnage', async ({ page }) => {
    const currentRow = page.getByRole('button', { name: 'Jour 1 — détails et notes' });
    await currentRow.click();
    const mine = page.getByLabel('Ma note');
    await expect(mine).toBeVisible();
    await mine.fill('Ne PAS faire confiance au marchand.');
    await mine.blur();
    await expect(page.getByText('Ma note enregistrée.')).toBeVisible();

    // L'autre fiche (guerrier, même joueuse mais AUTRE personnage) ne la voit
    // pas : la note est par personnage.
    await page.goto(sheetUrl(seed().guerrier.id));
    await openTab(page, 'Calendrier');
    await page.getByRole('button', { name: 'Jour 1 — détails et notes' }).click();
    const otherMine = page.getByLabel('Ma note');
    await expect(otherMine).toHaveValue('');
  });

  gmTest('zone MD : météo et note MD depuis le carnet reconstruit', async ({ page }) => {
    await setDay(1);
    await page.goto(`${WEB_BASE}/party/${seed().partyId}/carnet?tab=calendar`);
    // Le carnet reconstruit porte la vue semaine partagée + les échéances.
    await expect(page.getByText('Semaine 1').first()).toBeVisible();
    await expect(page.getByText('Comptes à rebours')).toBeVisible();

    // Dépliage du jour courant : la zone MD (météo + note MD) y vit.
    await page.getByRole('button', { name: 'Jour 1 — détails et notes' }).click();
    const weather = page.getByLabel('Météo du jour', { exact: true });
    await expect(weather).toBeVisible();
    await weather.fill('☀️ Dégagé');
    await weather.blur();

    const dmNote = page.getByLabel('Note du MD');
    await dmNote.fill('Embuscade préparée au col.');
    await dmNote.blur();

    // La météo se relit après rechargement (rangée + champ).
    await page.reload();
    await expect(page.getByText('Comptes à rebours')).toBeVisible();
    await page.getByRole('button', { name: 'Jour 1 — détails et notes' }).click();
    await expect(page.getByLabel('Météo du jour', { exact: true })).toHaveValue('☀️ Dégagé');
    await expect(page.getByLabel('Note du MD')).toHaveValue('Embuscade préparée au col.');
  });
});
