/**
 * Auth + parties: register/login/me/logout, party CRUD, join/remove/ban/unban.
 * Covers every .prepare site in routes/auth.ts and routes/parties.ts.
 */
import {
  api,
  eq,
  type Fixtures,
  mintToken,
  ok,
  registerUser,
  type ServerHandle,
} from './harness.ts';

export async function run(base: string, fx: Fixtures, srv: ServerHandle): Promise<void> {
  // ---------- auth ----------
  const eve = await registerUser(base, 'eve');

  let r = await api(base, 'POST', '/api/auth/register', {
    body: { username: 'eve', password: 'password123', displayName: 'EVE' },
  });
  eq(r.status, 409, 'duplicate register → 409');

  r = await api(base, 'POST', '/api/auth/register', { body: { username: 'x' } });
  eq(r.status, 400, 'register missing fields → 400');

  r = await api(base, 'POST', '/api/auth/login', {
    body: { username: 'eve', password: 'password123' },
  });
  eq(r.status, 200, 'login ok');
  ok(r.data.token, 'login returns a token');

  r = await api(base, 'POST', '/api/auth/login', { body: { username: 'eve', password: 'wrong!' } });
  eq(r.status, 401, 'login wrong password → 401');

  r = await api(base, 'POST', '/api/auth/login', {
    body: { username: 'ghost', password: 'nope1' },
  });
  eq(r.status, 401, 'login unknown user → 401');

  r = await api(base, 'GET', '/api/auth/me', { token: eve.token });
  eq(r.status, 200, 'me ok');
  eq(r.data.user.username, 'eve', 'me returns the user');

  r = await api(base, 'GET', '/api/auth/me', { token: mintToken(999_999) });
  eq(r.status, 404, 'me with forged token for deleted user → 404');

  r = await api(base, 'GET', '/api/auth/me', {});
  eq(r.status, 401, 'me without token → 401');

  r = await api(base, 'POST', '/api/auth/logout', { token: eve.token });
  eq(r.status, 204, 'logout → 204');

  // ---------- parties: list / create / detail ----------
  r = await api(base, 'GET', '/api/parties', { token: fx.gm.token });
  eq(r.status, 200, 'list parties (GM)');
  const mine = r.data.parties.filter((p: any) => p.id === fx.partyId);
  eq(mine.length, 1, 'GM sees the test party');
  ok(mine[0].inviteCode, 'party carries invite code');
  eq(
    mine[0].inviteCode.length,
    6,
    'invite code is exactly 6 chars (matches the join input maxLength)',
  );
  // Hidden Ombre: GM sees it in characterNames
  ok(mine[0].characterNames.includes('Ombre'), 'GM sees hidden character name');

  r = await api(base, 'GET', '/api/parties', { token: fx.player.token });
  const bobParty = r.data.parties.find((p: any) => p.id === fx.partyId);
  ok(bobParty, 'bob sees the party');
  ok(!bobParty.characterNames.includes('Ombre'), "hidden character filtered from bob's roster");

  r = await api(base, 'POST', '/api/parties', { token: fx.gm.token, body: { name: '' } });
  eq(r.status, 400, 'create party empty name → 400');

  r = await api(base, 'POST', '/api/parties', {
    token: fx.gm.token,
    body: { name: 'Second', encumbranceMode: 'bogus' },
  });
  eq(r.status, 201, 'create second party (invalid mode falls back)');
  eq(r.data.party.encumbranceMode, 'variant', 'invalid encumbranceMode falls back to variant');

  r = await api(base, 'GET', `/api/parties/${fx.partyId}`, { token: fx.gm.token });
  eq(r.status, 200, 'party detail (GM)');
  eq(r.data.members.length, 2, 'alice + bob are members');
  ok(
    r.data.characters.some((c: any) => c.name === 'Ombre'),
    'GM detail shows hidden char',
  );

  r = await api(base, 'GET', `/api/parties/${fx.partyId}`, { token: fx.player.token });
  ok(!r.data.characters.some((c: any) => c.name === 'Ombre'), 'player detail hides hidden char');

  r = await api(base, 'GET', `/api/parties/${fx.partyId}`, { token: fx.outsider.token });
  eq(r.status, 403, 'party detail non-member → 403');

  r = await api(base, 'GET', '/api/parties/999999', { token: fx.gm.token });
  eq(r.status, 403, 'party detail unknown party → 403 (member check first)');

  // ---------- join ----------
  r = await api(base, 'POST', '/api/parties/join', {
    token: fx.player.token,
    body: { inviteCode: 'ZZZZZZ' },
  });
  eq(r.status, 404, 'join invalid code → 404');

  r = await api(base, 'POST', '/api/parties/join', {
    token: fx.player.token,
    body: { inviteCode: fx.inviteCode },
  });
  eq(r.status, 409, 'rejoin while member → 409');

  r = await api(base, 'POST', '/api/parties/join', {
    token: fx.player2.token,
    body: { inviteCode: fx.inviteCode.toLowerCase() },
  });
  eq(r.status, 201, 'carol joins (lowercase code normalized)');
  eq(r.data.partyId, fx.partyId, 'join returns party id');

  // ---------- remove member ----------
  r = await api(base, 'DELETE', `/api/parties/${fx.partyId}/members/${fx.player2.userId}`, {
    token: fx.player.token,
  });
  eq(r.status, 403, 'remove member by non-GM → 403');

  r = await api(base, 'DELETE', `/api/parties/${fx.partyId}/members/${fx.gm.userId}`, {
    token: fx.gm.token,
  });
  eq(r.status, 403, 'cannot remove the GM');

  r = await api(base, 'DELETE', `/api/parties/${fx.partyId}/members/999999`, {
    token: fx.gm.token,
  });
  eq(r.status, 404, 'remove unknown member → 404');

  r = await api(base, 'DELETE', `/api/parties/${fx.partyId}/members/${fx.player2.userId}`, {
    token: fx.gm.token,
  });
  eq(r.status, 200, 'GM removes carol');

  // ---------- bans ----------
  r = await api(base, 'POST', `/api/parties/${fx.partyId}/bans`, {
    token: fx.gm.token,
    body: { userId: 999999 },
  });
  eq(r.status, 404, 'ban non-member → 404');

  r = await api(base, 'POST', `/api/parties/${fx.partyId}/bans`, {
    token: fx.gm.token,
    body: { userId: fx.gm.userId },
  });
  eq(r.status, 403, 'cannot ban the GM');

  r = await api(base, 'POST', `/api/parties/${fx.partyId}/bans`, {
    token: fx.player.token,
    body: { userId: eve.userId },
  });
  eq(r.status, 403, 'ban by non-GM → 403');

  r = await api(base, 'POST', `/api/parties/${fx.partyId}/bans`, {
    token: fx.gm.token,
    body: { userId: eve.userId },
  });
  eq(r.status, 404, 'ban a non-member (eve not joined yet) → 404');

  // eve joins, then gets banned
  r = await api(base, 'POST', '/api/parties/join', {
    token: eve.token,
    body: { inviteCode: fx.inviteCode },
  });
  eq(r.status, 201, 'eve joins');
  r = await api(base, 'POST', `/api/parties/${fx.partyId}/bans`, {
    token: fx.gm.token,
    body: { userId: eve.userId },
  });
  eq(r.status, 201, 'GM bans eve');
  const banRow = srv.query(
    'SELECT * FROM party_bans WHERE party_id = ? AND user_id = ?',
    fx.partyId,
    eve.userId,
  );
  ok(banRow, 'party_bans row exists');

  r = await api(base, 'GET', `/api/parties/${fx.partyId}`, { token: fx.gm.token });
  eq(r.data.banned.length, 1, 'party detail lists bans');

  r = await api(base, 'POST', '/api/parties/join', {
    token: eve.token,
    body: { inviteCode: fx.inviteCode },
  });
  eq(r.status, 403, 'banned eve cannot rejoin');

  r = await api(base, 'DELETE', `/api/parties/${fx.partyId}/bans/${eve.userId}`, {
    token: fx.gm.token,
  });
  eq(r.status, 200, 'GM unbans eve');

  r = await api(base, 'DELETE', `/api/parties/${fx.partyId}/bans/${eve.userId}`, {
    token: fx.gm.token,
  });
  eq(r.status, 404, 'unban not-banned → 404');

  r = await api(base, 'POST', '/api/parties/join', {
    token: eve.token,
    body: { inviteCode: fx.inviteCode },
  });
  eq(r.status, 201, 'eve rejoins after unban');

  // eve cleanup: remove again so later modules see alice+bob+eve… keep eve, harmless.

  // ---------- patch party ----------
  r = await api(base, 'PATCH', `/api/parties/${fx.partyId}`, {
    token: fx.player.token,
    body: { name: 'Nope' },
  });
  eq(r.status, 403, 'patch party by non-GM → 403');

  r = await api(base, 'PATCH', `/api/parties/${fx.partyId}`, {
    token: fx.gm.token,
    body: { name: ' ' },
  });
  eq(r.status, 400, 'patch party empty name → 400');

  r = await api(base, 'PATCH', `/api/parties/${fx.partyId}`, {
    token: fx.gm.token,
    body: { encumbranceMode: 'pouet' },
  });
  eq(r.status, 400, 'patch party invalid mode → 400');

  r = await api(base, 'PATCH', `/api/parties/${fx.partyId}`, {
    token: fx.gm.token,
    body: { name: 'Compagnie Renommée', encumbranceMode: 'standard' },
  });
  eq(r.status, 200, 'patch party name + mode');
  eq(r.data.party.name, 'Compagnie Renommée', 'name updated');
  eq(r.data.party.encumbranceMode, 'standard', 'mode updated');
}
