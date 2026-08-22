/**
 * Onglet Description — champs « Historique » (backstory libre, distinct de
 * l’« Historique » 5e de l’identité) et « Alliés et organisations » : saisie,
 * commit au blur (PATCH), persistance API puis survie au rechargement.
 *
 * Un champ par test : la fiche partage une base avec les autres specs, on
 * reste indépendant de l’ordre et des retries (chaque test réécrit sa valeur).
 */
import { expect } from 'playwright/test';
import { fetchCharacter, openTab, playerTest, seed, sheetUrl } from './fixtures';

const BACKSTORY = 'Née dans un village de pêcheurs, elle quitta tout lorsque la flotte mourut.';
const ALLIES = 'La Confrérie du Givre, Harshnag le géant.';

playerTest.describe('Description (historique & alliés)', () => {
  playerTest.beforeEach(async ({ page }) => {
    await page.goto(sheetUrl(seed().guerrier.id));
    await openTab(page, 'Description');
  });

  playerTest(
    'les sections Historique et Alliés et organisations sont rendues',
    async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Historique' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Alliés et organisations' })).toBeVisible();
      await expect(page.getByLabel('Histoire du personnage')).toBeVisible();
      await expect(page.getByLabel('Alliés, mentors, guildes et factions')).toBeVisible();
    },
  );

  playerTest('l’historique saisie persiste après rechargement', async ({ page }) => {
    const charId = seed().guerrier.id;
    const backstory = page.getByLabel('Histoire du personnage');

    await backstory.fill(BACKSTORY);
    // Le blur déclenche le commit (PATCH) du champ.
    await backstory.blur();

    // …le PATCH atteint le serveur : on poll l’API directement, pour ne pas
    // courir après la persistance avant de recharger.
    await expect
      .poll(() => fetchCharacter(charId), { timeout: 10_000 })
      .toMatchObject({ backstory: BACKSTORY });

    await page.reload();
    await openTab(page, 'Description');
    await expect(backstory).toHaveValue(BACKSTORY);
  });

  playerTest(
    'les alliés et organisations saisis persistent après rechargement',
    async ({ page }) => {
      const charId = seed().guerrier.id;
      const allies = page.getByLabel('Alliés, mentors, guildes et factions');

      await allies.fill(ALLIES);
      await allies.blur();

      await expect
        .poll(() => fetchCharacter(charId), { timeout: 10_000 })
        .toMatchObject({ alliesOrganizations: ALLIES });

      await page.reload();
      await openTab(page, 'Description');
      await expect(allies).toHaveValue(ALLIES);
    },
  );
});
