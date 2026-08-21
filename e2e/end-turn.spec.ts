/**
 * « J'ai fini mon tour » — le joueur clôt SON tour depuis sa fiche (carte
 * combat du dock) et depuis la vue combat (pied de scène joueur). L'état
 * d'entrée — Kael titulaire du tour — est amené par API au nom du MD ; la
 * spec ne pilote que le geste joueur côté UI.
 *
 * Les boutons portent l'aria-label « Terminer mon tour — … » (il prime sur
 * le texte visible pour les locateurs par rôle).
 */
import { expect } from 'playwright/test';
import { API_BASE } from './env';
import { playerTest, seed, sheetUrl } from './fixtures';

/** Bouton de fin de tour — aria-label complet partagé par les trois surfaces. */
const END_TURN = 'Terminer mon tour — passer au combattant suivant';

async function gm<T>(method: string, p: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${p}`, {
    method,
    headers: {
      // Sans corps, content-type: application/json ferait rejeter la requête
      // par Fastify (FST_ERR_CTP_EMPTY_JSON_BODY).
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      authorization: `Bearer ${seed().gm.token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`E2E (MD) : ${method} ${p} → ${res.status}`);
  return (res.status === 204 ? undefined : res.json()) as T;
}

interface EncDetail {
  encounter: {
    status: string;
    turnIndex: number;
    combatants: { id: number; name: string; type: string; groupId: number | null }[];
  };
}

const encId = () => seed().encounterId;
const kaelCombatantId = () => seed().guerrier.combatantId;

async function detail(): Promise<EncDetail> {
  return gm<EncDetail>('GET', `/api/encounters/${encId()}`);
}

/** Nom du combattant courant (vérité API pour les assertions de tour). */
async function currentName(): Promise<string> {
  const d = await detail();
  return d.encounter.combatants[d.encounter.turnIndex]?.name ?? '';
}

/**
 * Amène le tour sur Kael : initiatives déterministes si la rencontre est
 * encore en préparation (Kael 20, groupe gobelin 5 — un PATCH règle tout le
 * groupe), démarrage, puis Tour suivant MD jusqu'à ce que Kael tienne le tour
 * (la spec combat a pu laisser la rencontre active à n'importe quel point).
 */
export async function ensureKaelTurn(): Promise<void> {
  let d = await detail();
  if (d.encounter.status === 'setup') {
    const gob = d.encounter.combatants.find((c) => c.type === 'monster');
    if (gob) {
      await gm('PATCH', `/api/encounters/${encId()}/combatants/${gob.id}/initiative`, {
        initiative: 5,
      });
    }
    await gm('PATCH', `/api/encounters/${encId()}/combatants/${kaelCombatantId()}/initiative`, {
      initiative: 20,
    });
    await gm('POST', `/api/encounters/${encId()}/next-turn`); // setup → actif
    d = await detail();
  }
  expect(d.encounter.status).toBe('active');
  for (let i = 0; i < 6; i++) {
    const cur = d.encounter.combatants[d.encounter.turnIndex];
    if (cur?.id === kaelCombatantId()) return;
    await gm('POST', `/api/encounters/${encId()}/next-turn`);
    d = await detail();
  }
  throw new Error("E2E : le tour n'atteint pas Kael");
}

playerTest.describe('Fin de tour joueur', () => {
  playerTest('la carte combat de la fiche clôt le tour', async ({ page }) => {
    await ensureKaelTurn();
    await page.goto(sheetUrl(seed().guerrier.id));

    // Votre tour : la carte annonciatrice devient carte d'action.
    const end = page.getByRole('button', { name: END_TURN });
    await expect(end).toBeVisible();
    await end.click();

    // La carte retombe à l'état calme (bouton parti) et le tour rendu au
    // gobelin — vérifié dans l'API ET sur la carte de statut.
    await expect(end).toBeHidden();
    await expect.poll(currentName, { timeout: 10_000 }).not.toBe(seed().guerrier.name);
    await expect(
      page.locator('a[aria-label="Combat en cours — ouvrir le traqueur"]'),
    ).toContainText('Gobelin');
  });

  playerTest('le pied de scène de la vue combat clôt le tour', async ({ page }) => {
    await ensureKaelTurn();
    await page.goto(`/party/${seed().partyId}/combat?enc=${encId()}`);

    const end = page.getByRole('button', { name: END_TURN });
    await expect(end).toBeVisible();
    await end.click();

    // Le pied joueur disparaît avec le tour ; la scène passe au gobelin.
    await expect(end).toBeHidden();
    await expect.poll(currentName, { timeout: 10_000 }).not.toBe(seed().guerrier.name);
  });
});
