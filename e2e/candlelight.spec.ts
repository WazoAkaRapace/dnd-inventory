/*
 * Mode bougie — le thème sombre « le même grimoire, à la lueur de la
 * bougie ». Contrat : la classe ts-dark (posée par le script inline
 * d'index.html AVANT la première peinture — zéro flash) retourne les
 * ramps sémantiques via des variables CSS ; la rampe night (header,
 * surfaces volontiers sombres) ne bouge pas ; le choix persiste dans
 * localStorage['ts-theme'] et Mon compte porte les pastilles.
 */
import { expect } from 'playwright/test';
import { WEB_BASE } from './env';
import { gmTest, seed } from './fixtures';

gmTest('Mode bougie : bascule, persistance et ramps retournées', async ({ page }) => {
  const s = seed();

  // 1. Système sombre simulé → classe posée avant le premier rendu (pas de flash).
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(`${WEB_BASE}/parties`);
  await expect(page.locator('html')).toHaveClass(/ts-dark/);

  // 2. La page de registre rend sur fond sombre : le fond du body est le
  //    cuir (variable retournée), pas le parchemin clair.
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(['rgb(26, 21, 18)', 'rgba(26, 21, 18, 1)']).toContain(bg);

  // 3. Le bandeau applicatif reste sur la rampe night CONSTANTE (encre
  //    profonde, la même valeur qu'en mode clair).
  const header = page.locator('header').first();
  const headerBg = await header.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(headerBg).toBe('rgb(42, 31, 20)'); // #2a1f14 — night-900

  // 4. Choix manuel Parchemin via Mon compte → classe retirée, préférence posée.
  await page.goto(`${WEB_BASE}/compte`);
  await page.getByRole('button', { name: 'Parchemin' }).click();
  await expect(page.locator('html')).not.toHaveClass(/ts-dark/);
  const pref = await page.evaluate(() => localStorage.getItem('ts-theme'));
  expect(pref).toBe('light');

  // 5. Bougie explicite → persiste au rechargement même en système clair.
  await page.getByRole('button', { name: 'Bougie' }).click();
  await expect(page.locator('html')).toHaveClass(/ts-dark/);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/ts-dark/);

  // 6. Nettoyage : rendre le système au joueur (pas de préférence posée).
  await page.evaluate(() => localStorage.removeItem('ts-theme'));
  expect(s.partyId).toBeGreaterThan(0);
});
