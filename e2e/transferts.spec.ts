/**
 * Transferts entre personnages (#160, #161) : la bourse « Donner à… » et le
 * conteneur « Transférer à… ».
 *
 * Autonome par rapport au seed (idiome item-annotations.spec.ts) : la spec
 * crée SON personnage (Osric) avec sa bourse et son coffre au runtime — la
 * bourse de Kael (31 PO, contrat des specs inventory) reste intacte.
 */

import { expect } from 'playwright/test';
import { API_BASE } from './env';
import { openTab, playerTest, seed, sheetUrl } from './fixtures';

// ---------------------------------------------------------------------------
// Campagne dédiée (lazy, une fois par worker) : Osric + coffre + une potion
// ---------------------------------------------------------------------------

let campaign: { osricId: number; containerId: number } | null = null;

async function api(
  method: string,
  p: string,
  { body }: { body?: unknown } = {},
): Promise<Response> {
  return fetch(`${API_BASE}${p}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      authorization: `Bearer ${seed().player.token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
}

async function setupCampaign(): Promise<{ osricId: number; containerId: number }> {
  if (campaign) return campaign;
  const { partyId } = seed();

  const charRes = await api('POST', `/api/parties/${partyId}/characters`, {
    body: { name: 'Osric Fine-Lame', characterClass: 'Roublard', level: 3, race: 'Halfelin' },
  });
  expect(charRes.ok, `création Osric → ${charRes.status}`).toBe(true);
  const osricId = (await charRes.json()).character.id;
  // Bourse : 12 PO · 5 PA — de quoi donner 3 PO sans casse.
  await api('PATCH', `/api/characters/${osricId}`, { body: { gold: 12, silver: 5 } });

  // Coffre de guerre (conteneur) avec une potion dedans.
  const locRes = await api('POST', `/api/characters/${osricId}/locations`, {
    body: { name: 'Coffre de guerre', type: 'container', capacityKg: 25, ownWeightKg: 2 },
  });
  expect(locRes.ok, `création coffre → ${locRes.status}`).toBe(true);
  const containerId = (await locRes.json()).location.id;

  const search = await api(
    'GET',
    `/api/items?search=${encodeURIComponent('Potion de soin')}&limit=25`,
  );
  const items = (await search.json()).items as { id: number; name: string }[];
  const potion = items.find((i) => i.name === 'Potion de soin');
  expect(potion, '« Potion de soin » dans le catalogue').toBeTruthy();
  const invRes = await api('POST', `/api/characters/${osricId}/inventory`, {
    body: { itemId: potion!.id, quantity: 1, storageLocationId: containerId },
  });
  expect(invRes.ok, `potion dans le coffre → ${invRes.status}`).toBe(true);

  campaign = { osricId, containerId };
  return campaign;
}

playerTest.describe('Transferts (#160, #161)', () => {
  playerTest.beforeEach(async ({ page }) => {
    const { osricId } = await setupCampaign();
    await page.goto(sheetUrl(osricId));
    await expect(page.getByText('Osric Fine-Lame').first()).toBeVisible();
    await openTab(page, 'Inventaire');
    await expect(page.getByRole('button', { name: /Bourse/ })).toBeVisible();
  });

  playerTest('la bourse donne des pièces à un personnage du groupe', async ({ page }) => {
    const { osricId } = await setupCampaign();
    const { clerc } = seed();
    const bourseCard = page.locator('[data-tuto="inv-bourse"]');
    const modal = page.getByRole('dialog');

    await bourseCard.getByRole('button', { name: /Bourse \(/ }).click();
    await bourseCard.getByRole('button', { name: /↗ Donner à…/ }).click();

    // Le grand livre montre avant → après SANS casse : 12 PO · 5 PA → 9 PO · 5 PA
    await modal.getByLabel('Destinataire').selectOption({ label: 'Mira Aubedouce (Lyra)' });
    await modal.getByLabel('Quantité de PO').fill('3');
    await expect(modal.getByText('9 PO · 5 PA')).toBeVisible();
    await modal.getByRole('button', { name: 'Donner 3 PO' }).click();

    // Toast + bourse locale à jour (9 PO · 5 PA = 950 pc).
    await expect(page.getByText('Pièces transférées')).toBeVisible();
    await expect(page.getByRole('button', { name: /Bourse \(9 PO/ })).toBeVisible();

    // Mira a bien encaissé 3 PO (17 → 20) côté serveur.
    const mira = await api('GET', `/api/characters/${clerc.id}`);
    expect(mira.ok).toBe(true);
    expect(((await mira.json()).character as { gold: number }).gold).toBe(20);
    // Osric n'a plus que 9 PO — le transfert a bien débité le donneur.
    const osric = await api('GET', `/api/characters/${osricId}`);
    expect(((await osric.json()).character as { gold: number }).gold).toBe(9);
  });

  playerTest('un conteneur se transfère avec son contenu', async ({ page }) => {
    const { containerId } = await setupCampaign();

    // L'onglet du coffre actif porte le bouton « Transférer à… » (↗).
    await page.getByRole('button', { name: /Coffre de guerre/ }).click();
    const giveBtn = page.getByRole('button', {
      name: 'Transférer Coffre de guerre à un autre personnage',
    });
    await expect(giveBtn).toBeVisible();
    await giveBtn.click();

    const modal = page.getByRole('dialog');
    await expect(modal.getByText('Transférer le conteneur — Coffre de guerre')).toBeVisible();
    // Le contenu part avec le coffre — l'annonce le dit avant l'engagement.
    await expect(modal.getByText(/1 objet à l’intérieur/)).toBeVisible();
    await modal.getByLabel('Destinataire').selectOption({ label: 'Mira Aubedouce (Lyra)' });
    await modal.getByRole('button', { name: 'Transférer', exact: true }).click();

    await expect(page.getByText('Coffre de guerre transféré')).toBeVisible();
    // L'onglet du coffre disparaît de la rangée — retour au sac à dos porté.
    await expect(page.getByRole('button', { name: /Coffre de guerre/ })).toHaveCount(0);

    // Côté serveur : le lieu appartient désormais à Mira.
    const miraLocs = await api('GET', `/api/characters/${seed().clerc.id}/locations`);
    expect(miraLocs.ok).toBe(true);
    const locs = ((await miraLocs.json()).locations as { id: number }[]).map((l) => l.id);
    expect(locs).toContain(containerId);
  });
});
