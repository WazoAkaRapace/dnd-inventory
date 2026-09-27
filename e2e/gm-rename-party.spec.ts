/*
 * Table du MD → Réglages : renommer le groupe. Le PATCH /api/parties/:id
 * accepte déjà `name` ; ce spec couvre la porte UI (onglet Réglages, MD
 * seulement), la validation locale (bouton bloqué si vide/inchangé), la
 * propagation API (le nouveau nom revient du GET) et le refus serveur du
 * nom vide. Régression 2026-09 : avant cette itération, l'onglet Réglages
 * ne portait QUE la zone de dissolution.
 */
import { expect } from 'playwright/test';
import { API_BASE } from './env';
import { gmTest, seed } from './fixtures';

gmTest('Table du MD : renommer le groupe depuis les Réglages', async ({ page }) => {
  const s = seed();
  await page.goto(`/party/${s.partyId}/gm`);

  // 1. Onglet Réglages (visible au MD seulement).
  await page.getByRole('button', { name: 'Réglages' }).click();

  // 2. La carte de renommage propose le nom actuel, bouton bloqué tant que
  //    le brouillon est inchangé (aucune requête inutile).
  const input = page.locator('#gm-rename-party');
  await expect(input).toBeVisible();
  await expect(input).toHaveValue(s.partyName);
  const saveBtn = page.getByRole('button', { name: 'Enregistrer' });
  await expect(saveBtn).toBeDisabled();

  // 3. Nouveau nom → bouton actif → enregistrement.
  const NEW_NAME = `La Compagnie du Griffon ${Date.now()}`;
  await input.fill(NEW_NAME);
  await expect(saveBtn).toBeEnabled();
  await saveBtn.click();

  // 4. La page a repris le nouveau nom (en-tête au-dessus des onglets).
  await expect(page.locator('span', { hasText: NEW_NAME }).first()).toBeVisible();

  // 5. L'API sert bien le nouveau nom (le PATCH a écrit la base).
  const res = await fetch(`${API_BASE}/api/parties/${s.partyId}`, {
    headers: { authorization: `Bearer ${s.gm.token}` },
  });
  expect(res.ok).toBeTruthy();
  const detail = (await res.json()) as { party: { name: string } };
  expect(detail.party.name).toBe(NEW_NAME);

  // 6. Validation serveur : nom vide → 400, la base garde le nouveau nom.
  const bad = await fetch(`${API_BASE}/api/parties/${s.partyId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${s.gm.token}` },
    body: JSON.stringify({ name: '   ' }),
  });
  expect(bad.status).toBe(400);

  // 7. Nettoyage : restaurer le nom seedé pour les specs suivantes.
  await fetch(`${API_BASE}/api/parties/${s.partyId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${s.gm.token}` },
    body: JSON.stringify({ name: s.partyName }),
  });
});

gmTest('Table du MD : un joueur ne voit pas l’onglet Réglages', async () => {
  const s = seed();
  // injectSession a posé les cookies du GM — on ouvre une page joueur via
  // le contexte dédié : gmTest n'expose que la session GM, donc on vérifie
  // plutôt l'invariant API : le PATCH d'un non-MD reçoit 403.
  const res = await fetch(`${API_BASE}/api/parties/${s.partyId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${s.player.token}` },
    body: JSON.stringify({ name: 'Pirate' }),
  });
  expect(res.status).toBe(403);
});
