/**
 * Item catalog: search filters (accent-insensitive normalize(), category,
 * rarity, source, party scoping, pagination), custom item CRUD.
 * Covers every .prepare site in routes/items.ts.
 */
import { api, eq, type Fixtures, ok, registerUser, type ServerHandle } from './harness.ts';

export async function run(base: string, fx: Fixtures, srv: ServerHandle): Promise<void> {
  const P = fx.partyId;

  // ---------- search ----------
  let r = await api(base, 'GET', '/api/items', { token: fx.gm.token });
  eq(r.status, 200, 'list items');
  ok(r.data.items.length > 0, 'seeded items returned');
  ok(r.data.total >= r.data.items.length, 'total present');

  r = await api(base, 'GET', '/api/items?search=longue', { token: fx.gm.token });
  ok(r.data.total > 0, "search 'longue' finds the longsword");

  // accent-insensitive: 'épée' (with diacritics) must match via normalize()
  r = await api(base, 'GET', `/api/items?search=${encodeURIComponent('épée')}`, {
    token: fx.gm.token,
  });
  ok(r.data.total > 0, "accented search 'épée' matches");

  // dashes in the query are treated as spaces
  const firstSword = srv.queryAll("SELECT name FROM items WHERE name LIKE '%sword%' LIMIT 1")[0];
  if (firstSword) {
    r = await api(
      base,
      'GET',
      `/api/items?search=${encodeURIComponent(firstSword.name.replace(' ', '-'))}`,
      {
        token: fx.gm.token,
      },
    );
    ok(r.data.total > 0, `dash search '${firstSword.name.replace(' ', '-')}' matches`);
  }

  const cat = srv.query(
    'SELECT category, COUNT(*) AS n FROM items GROUP BY category ORDER BY n DESC LIMIT 1',
  );
  r = await api(base, 'GET', `/api/items?category=${encodeURIComponent(cat.category)}`, {
    token: fx.gm.token,
  });
  eq(r.status, 200, 'category filter');
  ok(
    r.data.items.every((i: any) => i.category === cat.category),
    'category filter consistent',
  );
  eq(r.data.total, cat.n, 'category count matches DB');

  const rare = srv.query(
    "SELECT rarity, COUNT(*) AS n FROM items WHERE rarity != 'none' GROUP BY rarity LIMIT 1",
  );
  r = await api(base, 'GET', `/api/items?rarity=${encodeURIComponent(rare.rarity)}`, {
    token: fx.gm.token,
  });
  eq(r.data.total, rare.n, 'rarity filter (none excluded)');

  r = await api(base, 'GET', '/api/items?source=srd', { token: fx.gm.token });
  ok(
    r.data.items.every((i: any) => i.source === 'srd'),
    'source filter',
  );

  r = await api(base, 'GET', '/api/items?limit=5&offset=0', { token: fx.gm.token });
  eq(r.data.items.length, 5, 'limit respected');

  // user with no parties sees only global SRD items (IS NULL branch)
  const frank = await registerUser(base, 'frank');
  r = await api(base, 'GET', '/api/items', { token: frank.token });
  eq(r.status, 200, 'no-party user lists items');
  ok(
    r.data.items.every((i: any) => i.partyId === null),
    'no-party user sees only SRD items',
  );

  // ---------- custom items ----------
  r = await api(base, 'POST', `/api/parties/${P}/items`, {
    token: fx.player.token,
    body: { name: 'Lame de test' },
  });
  eq(r.status, 403, 'create custom item non-GM → 403');

  r = await api(base, 'POST', `/api/parties/${P}/items`, { token: fx.gm.token, body: {} });
  eq(r.status, 400, 'create custom item no name → 400');

  r = await api(base, 'POST', `/api/parties/${P}/items`, {
    token: fx.gm.token,
    body: {
      name: 'Lame de test',
      category: 'weapon',
      rarity: 'rare',
      weightKg: 1.5,
      costQty: 100,
      costUnit: 'po',
      description: 'Une lame',
    },
  });
  eq(r.status, 201, 'create custom item');
  const custom = r.data.item;
  eq(custom.source, 'custom', 'custom source');
  eq(custom.partyId, P, 'attached to party');

  // party-scoped listing: only that party's custom items
  r = await api(base, 'GET', `/api/items?partyId=${P}`, { token: fx.gm.token });
  eq(r.data.total, 1, 'party filter returns only custom items');
  r = await api(base, 'GET', `/api/items?partyId=${P}`, { token: fx.outsider.token });
  eq(r.status, 403, 'party filter non-member → 403');

  // single item: srd + custom + foreign custom
  const someItem = srv.query('SELECT id FROM items ORDER BY id LIMIT 1');
  r = await api(base, 'GET', `/api/items/${someItem.id}`, { token: fx.gm.token });
  eq(r.status, 200, 'get srd item');
  r = await api(base, 'GET', `/api/items/${custom.id}`, { token: fx.player.token });
  eq(r.status, 200, 'custom item visible to party member');
  r = await api(base, 'GET', `/api/items/${custom.id}`, { token: frank.token });
  eq(r.status, 403, 'custom item hidden from non-members');
  r = await api(base, 'GET', '/api/items/999999', { token: fx.gm.token });
  eq(r.status, 404, 'item 404');

  // ---------- update ----------
  r = await api(base, 'PATCH', `/api/items/${someItem.id}`, {
    token: fx.gm.token,
    body: { name: 'x' },
  });
  eq(r.status, 403, 'cannot modify srd item');

  r = await api(base, 'PATCH', `/api/items/${custom.id}`, {
    token: fx.player.token,
    body: { name: 'x' },
  });
  eq(r.status, 403, 'only GM modifies custom item');

  r = await api(base, 'PATCH', `/api/items/${custom.id}`, { token: fx.gm.token, body: {} });
  eq(r.status, 400, 'patch item no fields → 400');

  r = await api(base, 'PATCH', `/api/items/${custom.id}`, {
    token: fx.gm.token,
    body: {
      name: 'Lame renommée',
      category: 'weapon',
      rarity: 'very-rare',
      weightKg: 2,
      costQty: 200,
      costUnit: 'po',
      description: 'Mieux',
    },
  });
  eq(r.status, 200, 'patch custom item');
  eq(r.data.item.name, 'Lame renommée', 'item renamed');
  r = await api(base, 'PATCH', '/api/items/999999', { token: fx.gm.token, body: { name: 'x' } });
  eq(r.status, 404, 'patch item 404');

  // ---------- delete ----------
  r = await api(base, 'DELETE', `/api/items/${someItem.id}`, { token: fx.gm.token });
  eq(r.status, 403, 'cannot delete srd item');
  r = await api(base, 'DELETE', `/api/items/${custom.id}`, { token: fx.player.token });
  eq(r.status, 403, 'only GM deletes custom item');
  r = await api(base, 'DELETE', '/api/items/999999', { token: fx.gm.token });
  eq(r.status, 404, 'delete item 404');
  r = await api(base, 'DELETE', `/api/items/${custom.id}`, { token: fx.gm.token });
  eq(r.status, 204, 'delete custom item');
}
