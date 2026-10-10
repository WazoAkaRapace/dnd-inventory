/**
 * Coin transfer between characters (issue #160 / « Wero »):
 * POST /characters/:id/transfer-coins — giver debited via spendCoins
 * (minimal change from HIS purse), receiver credited the requested
 * breakdown via gainCoins, two character:change action 'coins' events.
 */
import { api, createParty, eq, type Fixtures, ok, type ServerHandle } from './harness.ts';

interface WsClient {
  userId: number;
  messages: any[];
  close: () => void;
}

function wsUrl(base: string, token: string): string {
  return `${base.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(token)}`;
}

async function connect(base: string, token: string, userId: number): Promise<WsClient> {
  const ws = new WebSocket(wsUrl(base, token));
  const messages: any[] = [];
  const opened = new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve());
    ws.addEventListener('error', (e) => reject(new Error(`ws error: ${JSON.stringify(e)}`)));
  });
  ws.addEventListener('message', (ev: MessageEvent) => {
    try {
      messages.push(JSON.parse(String(ev.data)));
    } catch {
      /* ignore */
    }
  });
  await opened;
  await waitMsg(messages, (m) => m.type === 'connected', 5000);
  return { userId, messages, close: () => ws.close() };
}

function waitMsg(
  messages: any[],
  pred: (m: any, i: number) => boolean,
  timeoutMs: number,
): Promise<any> {
  const existing = messages.find(pred);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const hit = messages.find(pred);
      if (hit) {
        clearInterval(timer);
        resolve(hit);
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(
          new Error(
            `ws message not received within ${timeoutMs}ms — have: ${JSON.stringify(messages.slice(-5))}`,
          ),
        );
      }
    }, 25);
  });
}

function purseRow(srv: ServerHandle, charId: number) {
  const row = srv.query(
    'SELECT copper, silver, electrum, gold, platinum FROM characters WHERE id = ?',
    charId,
  );
  return [row.copper, row.silver, row.electrum, row.gold, row.platinum];
}

export async function run(base: string, fx: Fixtures, srv: ServerHandle): Promise<void> {
  const A = fx.charAlya.id; // alice (GM) — donneur
  const B = fx.charBran.id; // bob (joueur) — receveur

  // ---------- fixtures : bourses connues ----------
  const setPurse = async (charId: number, token: string, coins: Record<string, number>) => {
    const res = await api(base, 'PATCH', `/api/characters/${charId}`, { token, body: coins });
    eq(res.status, 200, `set purse on ${charId}`);
  };
  await setPurse(A, fx.gm.token, { copper: 15, silver: 2, electrum: 0, gold: 3, platinum: 1 });
  await setPurse(B, fx.player.token, { copper: 0, silver: 0, electrum: 0, gold: 0, platinum: 0 });

  // ---------- écoute WS avant le geste ----------
  const alice = await connect(base, fx.gm.token, fx.gm.userId);
  const bob = await connect(base, fx.player.token, fx.player.userId);
  try {
    // Le PATCH de fixture a émis son propre character:change 'coins' — on
    // consomme tout ce qui précède le transfert (repère temporel).
    const beforeAlice = alice.messages.length;
    const beforeBob = bob.messages.length;

    // ---------- chemin nominal (GM transfère depuis SA fiche) ----------
    let r = await api(base, 'POST', `/api/characters/${A}/transfer-coins`, {
      token: fx.gm.token,
      body: { toCharacterId: B, amounts: { cp: 7, sp: 5, gp: 1 } },
    });
    eq(r.status, 200, 'happy path — transfert accepté');
    // spendCoins(purse(15,2,0,3,1), purse(7,5,0,1,0)):
    //   exact: 7 PC, 2 PA, 1 PO pris ; dette 3 PA → 1 PO cassée → +10 PA,
    //   3 payées, 7 rendues. Bourse finale : 8 PC · 7 PA · 0 PE · 1 PO · 1 PP.
    eq(
      JSON.stringify(purseRow(srv, A)),
      JSON.stringify([8, 7, 0, 1, 1]),
      'donneur débité — bourse finale 8 PC · 7 PA · 1 PO · 1 PP',
    );
    eq(
      JSON.stringify(purseRow(srv, B)),
      JSON.stringify([7, 5, 0, 1, 0]),
      'receveur crédité de la répartition demandée (7 PC · 5 PA · 1 PO)',
    );
    eq(
      r.data.breaks.length,
      2,
      'réponse : deux casses (1 PO pour les 3 PA manquants, puis 1 PA en 10 PC pour payer les 2 PC restants)',
    );

    // Les deux événements character:change action 'coins' sont émis, un par
    // personnage (character:change est echo-exempt : l'acteur les voit aussi).
    // Les PATCH de fixture ont émis leurs propres 'coins' — les prédicats sont
    // bornés à l'index d'avant-le-geste sur le tableau VIVANT (la livraison
    // WS peut dépasser la réponse HTTP).
    const coinEventFrom = (fromIdx: number, charId: number) => (_m: any, i: number) =>
      i >= fromIdx &&
      _m.type === 'character:change' &&
      _m.characterId === charId &&
      _m.action === 'coins';
    await waitMsg(alice.messages, coinEventFrom(beforeAlice, A), 5000);
    await waitMsg(alice.messages, coinEventFrom(beforeAlice, B), 5000);
    await waitMsg(bob.messages, coinEventFrom(beforeBob, B), 5000);
    ok(
      !bob.messages
        .slice(beforeBob)
        .some((m) => m.type === 'character:change' && m.characterId === A && m.action !== 'coins'),
      'pas d’événement parasite sur le donneur',
    );

    // ---------- bourse insuffisante → 400 + shortfall ----------
    r = await api(base, 'POST', `/api/characters/${A}/transfer-coins`, {
      token: fx.gm.token,
      body: { toCharacterId: B, amounts: { pp: 5 } },
    });
    eq(r.status, 400, 'bourse insuffisante → 400');
    eq(r.data.shortfallCp, 3822, 'shortfall en PC (5 PP demandés − 1178 PC de bourse)');
    eq(
      JSON.stringify(purseRow(srv, A)),
      JSON.stringify([8, 7, 0, 1, 1]),
      'donneur inchangé après refus',
    );

    // ---------- montants invalides → 400 ----------
    r = await api(base, 'POST', `/api/characters/${A}/transfer-coins`, {
      token: fx.gm.token,
      body: { toCharacterId: B, amounts: { gold: -1 } },
    });
    eq(r.status, 400, 'montant négatif → 400');
    r = await api(base, 'POST', `/api/characters/${A}/transfer-coins`, {
      token: fx.gm.token,
      body: { toCharacterId: B, amounts: { gold: 0, cp: 0 } },
    });
    eq(r.status, 400, 'total nul → 400');
    r = await api(base, 'POST', `/api/characters/${A}/transfer-coins`, {
      token: fx.gm.token,
      body: { toCharacterId: B, amounts: { gold: 1.5 } },
    });
    eq(r.status, 400, 'montant non entier → 400');
    eq(
      JSON.stringify(purseRow(srv, B)),
      JSON.stringify([7, 5, 0, 1, 0]),
      'receveur inchangé après les refus',
    );

    // ---------- cross-party → 400 ----------
    const oParty = await createParty(base, fx.outsider.token, 'Wero Lointain');
    const oChar = await api(base, 'POST', `/api/parties/${oParty.id}/characters`, {
      token: fx.outsider.token,
      body: { name: 'Ailleurs', maxHp: 10 },
    });
    r = await api(base, 'POST', `/api/characters/${A}/transfer-coins`, {
      token: fx.gm.token,
      body: { toCharacterId: oChar.data.character.id, amounts: { cp: 1 } },
    });
    eq(r.status, 400, 'transfert inter-groupe → 400');

    // ---------- non-owner → 403 ----------
    r = await api(base, 'POST', `/api/characters/${A}/transfer-coins`, {
      token: fx.player2.token,
      body: { toCharacterId: B, amounts: { cp: 1 } },
    });
    eq(r.status, 403, 'non-propriétaire → 403');

    // ---------- le joueur (propriétaire) peut transférer depuis sa fiche ----------
    r = await api(base, 'POST', `/api/characters/${B}/transfer-coins`, {
      token: fx.player.token,
      body: { toCharacterId: A, amounts: { sp: 5 } },
    });
    eq(r.status, 200, 'propriétaire transfère — accepté');
    eq(
      JSON.stringify(purseRow(srv, B)),
      JSON.stringify([7, 0, 0, 1, 0]),
      'donneur joueur débité des 5 PA exactes',
    );
    eq(
      JSON.stringify(purseRow(srv, A)),
      JSON.stringify([8, 12, 0, 1, 1]),
      'receveur GM crédité des 5 PA (7+5)',
    );

    // ---------- inconnus → 404 ----------
    r = await api(base, 'POST', '/api/characters/999999/transfer-coins', {
      token: fx.gm.token,
      body: { toCharacterId: B, amounts: { cp: 1 } },
    });
    eq(r.status, 404, 'donneur inconnu → 404');
    r = await api(base, 'POST', `/api/characters/${A}/transfer-coins`, {
      token: fx.gm.token,
      body: { toCharacterId: 999999, amounts: { cp: 1 } },
    });
    eq(r.status, 404, 'receveur inconnu → 404');
  } finally {
    alice.close();
    bob.close();
  }
}
