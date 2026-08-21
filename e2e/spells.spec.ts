/**
 * Sorts de la clerc (Mira, niv. 5) — rail d'emplacements, sorts connus et
 * flow de lancement : la feuille de sort dépense un emplacement de niveau 1
 * (PATCH spellSlotsUsed) et le rail reflète le décompte.
 */
import { expect } from 'playwright/test';
import { openTab, playerTest, seed, sheetUrl } from './fixtures';

playerTest.describe('Sorts (clerc)', () => {
  playerTest.beforeEach(async ({ page }) => {
    await page.goto(sheetUrl(seed().clerc.id));
    await expect(page.getByText(seed().clerc.name).first()).toBeVisible();
    // Sorts est un onglet primaire du dock pour les lanceurs de sorts.
    await openTab(page, 'Sorts');
    await expect(page.getByRole('heading', { name: 'Emplacements de sort' })).toBeVisible();
  });

  playerTest('le rail d’emplacements rend les 4 emplacements de niveau 1', async ({ page }) => {
    // Clerc niv. 5 : 4 emplacements de niveau 1 (table SRD pleine lanceuse).
    await expect(
      page.getByRole('button', {
        name: 'Niveau 1 : 4 emplacements disponibles sur 4 — corriger',
      }),
    ).toBeVisible();
  });

  playerTest('un sort connu est listé avec ses tours de magie', async ({ page }) => {
    await expect(page.getByText('Tours de magie').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Flamme sacrée/ }).first()).toBeVisible();
    await expect(page.getByText('Mot de guérison').first()).toBeVisible();
  });

  playerTest('lancer Mot de guérison dépense un emplacement de niveau 1', async ({ page }) => {
    await page.getByRole('button', { name: 'Lancer Mot de guérison' }).click();

    // La feuille de lancement (portale) présélectionne l'emplacement de
    // niveau 1 (premier castable) — le bouton de lancement l'affiche.
    const castSheet = page.getByRole('dialog', { name: 'Lancer Mot de guérison' });
    await expect(castSheet).toBeVisible();

    // …et le lancer consomme l'emplacement : 4 → 3 dans le rail.
    await castSheet.getByRole('button', { name: '🪄 Lancer au niveau 1' }).click();
    await expect(
      page.getByRole('button', {
        name: 'Niveau 1 : 3 emplacements disponibles sur 4 — corriger',
      }),
    ).toBeVisible();
  });
});
