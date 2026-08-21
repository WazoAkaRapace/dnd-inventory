/**
 * Sync temps réel — le joyau de la migration react-query : le MD blesse le
 * combattant PJ depuis le traqueur, la fiche OUVERTE CHEZ LA JOUEUSE doit
 * refléter les PV SANS rechargement. Chemin complet : PATCH combattant →
 * miroir personnage → événement WS character:change (proxy vite /ws) →
 * invalidation react-query → refetch → UI.
 */
import { expect } from 'playwright/test';
import { gmTest, seed, sheetUrl } from './fixtures';

gmTest(
  'les PV du traqueur du MD se propagent à la fiche joueur en direct',
  async ({ page: gmPage, browser }) => {
    // — Page joueuse : fiche de Kael, onglet Survie (défaut), aucune interaction —
    const playerCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: 'fr-FR',
    });
    await playerCtx.addInitScript(
      ({ token, user }) => {
        localStorage.setItem('dnd-inv-token', token);
        localStorage.setItem('dnd-inv-user', JSON.stringify(user));
        localStorage.setItem('dnd-inv-tour-seen', '1');
      },
      { token: seed().player.token, user: seed().player.user },
    );
    const playerPage = await playerCtx.newPage();
    await playerPage.goto(sheetUrl(seed().guerrier.id));
    const hpInput = playerPage.getByLabel('Points de vie actuels');
    await expect(hpInput).toBeVisible();
    // PV de départ lus dans l'UI (une autre spec a pu entamer Kael).
    const before = Number(await hpInput.inputValue());
    // La WebSocket joueuse doit être connectée AVANT que le MD frappe
    // (l'indicateur d'en-tête passe à « Synchronisé »).
    await playerPage.getByLabel('Synchronisé').first().waitFor({ timeout: 10_000 });

    // — Page MD : traqueur, focus sur le combattant PJ, feuille de dégâts —
    await gmPage.goto(`/party/${seed().partyId}/combat?enc=${seed().encounterId}`);
    const rail = gmPage.getByRole('navigation', { name: "Ordre d'initiative" });
    await rail.getByRole('button', { name: seed().guerrier.name }).click();
    await expect(
      gmPage.getByRole('heading', { name: seed().guerrier.name, exact: true }),
    ).toBeVisible();

    await gmPage.getByRole('button', { name: '⚔ Dégâts' }).click();
    const sheet = gmPage.getByRole('dialog');
    await sheet.getByLabel('Montant (dégâts ou soins)').fill('5');
    await sheet.getByRole('button', { name: '⚔ Dégâts' }).click();

    // — La fiche joueur reçoit le coup sans rechargement (WS → invalidation) —
    await expect.poll(() => hpInput.inputValue(), { timeout: 10_000 }).toBe(String(before - 5));

    await playerCtx.close();
  },
);
