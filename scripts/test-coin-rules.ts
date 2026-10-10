/**
 * Sanity checks for the coin engine: coinsTotalCp / formatCoinCp / gainCoins /
 * spendCoins (minimal-breakage change-making).
 * Run: npx tsx scripts/test-coin-rules.ts
 */
import {
  type CoinAmounts,
  coinsTotalCp,
  formatCoinCp,
  gainCoins,
  spendCoins,
} from '@table-sync/shared';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures++;
    console.error(
      `✗ ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
    );
  } else {
    console.log(`✓ ${label}`);
  }
}

const purse = (cp: number, sp: number, ep: number, gp: number, pp: number): CoinAmounts => ({
  cp,
  sp,
  ep,
  gp,
  pp,
});

// ---------- coinsTotalCp / formatCoinCp ----------

check(
  'total en PC — cinq dénominations',
  coinsTotalCp(purse(3, 4, 5, 6, 7)),
  3 + 40 + 250 + 600 + 7000,
);
check('format — total nul', formatCoinCp(0), []);
check('format — 3050 PC → 3 PP · 1 PE (greedy canonique)', formatCoinCp(3050), [
  { qty: 3, unit: 'pp' },
  { qty: 1, unit: 'ep' },
]);
check('format — 123456 PC → 123 PP · 4 PO · 1 PE · 6 PC', formatCoinCp(123456), [
  { qty: 123, unit: 'pp' },
  { qty: 4, unit: 'gp' },
  { qty: 1, unit: 'ep' },
  { qty: 6, unit: 'cp' },
]);

// ---------- gainCoins ----------

check(
  'encaisser — ajout tel quel, sans regroupement',
  gainCoins(purse(5, 0, 0, 2, 0), purse(0, 15, 0, 0, 0)),
  purse(5, 15, 0, 2, 0),
);

// ---------- spendCoins : paiement exact ----------

check(
  'dépense exacte — bourse amputée, aucune casse',
  spendCoins(purse(3, 0, 0, 5, 0), purse(0, 0, 0, 2, 0)),
  {
    ok: true,
    purse: purse(3, 0, 0, 3, 0),
    breaks: [],
  },
);

check(
  'dépense mixte — 1 PO cassée en 10 PA pour couvrir les PA manquants',
  spendCoins(purse(0, 10, 0, 3, 0), purse(0, 15, 0, 2, 0)),
  {
    ok: true,
    purse: purse(0, 5, 0, 0, 0),
    breaks: [{ unit: 'gp', count: 1 }],
  },
);

// ---------- spendCoins : rendu de monnaie ----------

check(
  'rendu — 1 PO cassée en 10 PA, 5 payées, 5 rendues',
  spendCoins(purse(0, 0, 0, 1, 0), purse(0, 5, 0, 0, 0)),
  {
    ok: true,
    purse: purse(0, 5, 0, 0, 0),
    breaks: [{ unit: 'gp', count: 1 }],
  },
);

check(
  'rendu — 1 PP cassé en 10 PO, 3 payées, 7 rendues',
  spendCoins(purse(0, 0, 0, 0, 1), purse(0, 0, 0, 3, 0)),
  {
    ok: true,
    purse: purse(0, 0, 0, 7, 0),
    breaks: [{ unit: 'pp', count: 1 }],
  },
);

check(
  'cascade — 1 PE cassée en 5 PA puis 1 PA cassée en 10 PC pour payer 7 PC',
  spendCoins(purse(0, 0, 1, 0, 0), purse(7, 0, 0, 0, 0)),
  {
    ok: true,
    purse: purse(3, 4, 0, 0, 0),
    breaks: [
      { unit: 'ep', count: 1 },
      { unit: 'sp', count: 1 },
    ],
  },
);

check(
  'menue monnaie d’abord — les 5 PC partent, puis 1 PO et 1 PA sont cassées',
  spendCoins(purse(5, 0, 0, 1, 0), purse(0, 3, 0, 0, 0)),
  {
    ok: true,
    purse: purse(5, 7, 0, 0, 0),
    breaks: [
      { unit: 'gp', count: 1 },
      { unit: 'sp', count: 1 },
    ],
  },
);

check(
  'pièce forte en paiement direct — 1 PO + 2 PA valent exactement 12 PA, rien n’est cassé',
  spendCoins(purse(0, 2, 0, 1, 0), purse(0, 12, 0, 0, 0)),
  { ok: true, purse: purse(0, 0, 0, 0, 0), breaks: [] },
);

// ---------- spendCoins : fonds insuffisants ----------

check(
  'fonds insuffisants — manque 100 PC',
  spendCoins(purse(0, 0, 0, 1, 0), purse(0, 0, 0, 2, 0)),
  {
    ok: false,
    shortfallCp: 100,
  },
);
check(
  'fonds insuffisants — dette partielle après prise exacte',
  spendCoins(purse(0, 5, 0, 0, 0), purse(0, 8, 0, 0, 0)),
  { ok: false, shortfallCp: 30 },
);

// ---------- invariants ----------

const before = purse(17, 3, 2, 11, 1);
const pay = purse(9, 14, 1, 4, 0);
const result = spendCoins(before, pay);
if (result.ok) {
  check(
    'invariant — valeur conservée (avant − dépense = après)',
    coinsTotalCp(result.purse),
    coinsTotalCp(before) - coinsTotalCp(pay),
  );
  check(
    'invariant — aucune dénomination négative',
    Object.values(result.purse).every((n) => n >= 0),
    true,
  );
} else {
  failures++;
  console.error('✗ invariant — le scénario devait aboutir');
}

// ---------- transfert entre personnages : composition spend → gain ----------

// Le contrat du transfert (#160) : le donneur paie `amounts` via spendCoins
// (casse minimale depuis SA bourse), le receveur encaisse `amounts` tel quel
// via gainCoins. La composition doit être ÉQUILIBRÉE en valeur.
{
  const giver = purse(15, 2, 0, 3, 1);
  const receiver = purse(0, 0, 0, 0, 0);
  const sent = purse(7, 5, 0, 1, 0); // 7 PC + 5 PA + 1 PO = 187 PC
  const pay = spendCoins(giver, sent);
  check('transfert — le donneur peut payer', pay.ok, true);
  if (pay.ok) {
    check(
      'transfert — valeur débitée = valeur demandée',
      coinsTotalCp(giver) - coinsTotalCp(pay.purse),
      coinsTotalCp(sent),
    );
    const got = gainCoins(receiver, sent);
    check(
      'transfert — composition équilibrée (perte donneur = gain receveur)',
      coinsTotalCp(got) - coinsTotalCp(receiver),
      coinsTotalCp(giver) - coinsTotalCp(pay.purse),
    );
    check(
      'transfert — receveur encaisse la répartition demandée, sans regroupement',
      got,
      purse(7, 5, 0, 1, 0),
    );
  }
}

// Transfert avec casse : payer 8 PA depuis une bourse sans PA casse 1 PO en
// 10 PA — le donneur rend la monnaie, le receveur encaisse les 8 PA demandées.
{
  const giver = purse(0, 0, 0, 1, 0);
  const sent = purse(0, 8, 0, 0, 0);
  const pay = spendCoins(giver, sent);
  check('transfert avec casse — payable', pay.ok, true);
  if (pay.ok) {
    check(
      'transfert avec casse — le donneur finit avec la monnaie rendue (2 PA)',
      pay.purse,
      purse(0, 2, 0, 0, 0),
    );
    check(
      'transfert avec casse — valeur conservée de part et d’autre',
      coinsTotalCp(giver) - coinsTotalCp(sent),
      coinsTotalCp(pay.purse),
    );
  }
}

// Transfert refusé : bourse insuffisante → rien ne bouge.
{
  const giver = purse(0, 0, 0, 1, 0);
  const sent = purse(0, 0, 0, 3, 0);
  const pay = spendCoins(giver, sent);
  check('transfert refusé — fonds insuffisants (manque 200 PC)', pay, {
    ok: false,
    shortfallCp: 200,
  });
}

if (failures > 0) {
  console.error(`\n${failures} échec(s)`);
  process.exit(1);
}
console.log('\nTous les contrôles de bourse passent.');
