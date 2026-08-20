/**
 * API data-query test suite + query-site coverage gate.
 * Run: npm run test-api
 *
 * Boots a throwaway API server (fresh SQLite in a temp dir), runs the
 * domain modules sequentially, then verifies that every .prepare(...) site
 * in apps/api/src/routes/** and src/sync/** executed at least once
 * (DB_SQL_TRACE trace) — the safety net for a future file-by-file migration
 * of raw SQL to the Drizzle query builder. Exit non-zero on any failure.
 */
import { computeCoverage } from './api-tests/coverage.ts';
import {
  buildFixtures,
  type Fixtures,
  type ServerHandle,
  startServer,
} from './api-tests/harness.ts';
import { run as authParties } from './api-tests/mod-auth-parties.ts';
import { run as characters } from './api-tests/mod-characters.ts';
import { run as combat } from './api-tests/mod-combat.ts';
import { run as featuresNotes } from './api-tests/mod-features-notes.ts';
import { run as inventory } from './api-tests/mod-inventory.ts';
import { run as items } from './api-tests/mod-items.ts';
import { run as npcsMonsters } from './api-tests/mod-npcs-monsters.ts';
import { run as spells } from './api-tests/mod-spells.ts';
import { run as syncWs } from './api-tests/mod-sync-ws.ts';
import { run as wildshapeRest } from './api-tests/mod-wildshape-rest.ts';

const MODULES: Array<{
  name: string;
  run: (base: string, fx: Fixtures, srv: ServerHandle) => Promise<void>;
}> = [
  { name: 'auth + parties', run: authParties },
  { name: 'characters', run: characters },
  { name: 'items', run: items },
  { name: 'inventory + locations', run: inventory },
  { name: 'spells', run: spells },
  { name: 'features + notes', run: featuresNotes },
  { name: 'npcs + monsters', run: npcsMonsters },
  { name: 'combat', run: combat },
  { name: 'wild shape + rests', run: wildshapeRest },
  { name: 'websocket sync', run: syncWs },
];

async function main(): Promise<void> {
  console.log('[test-api] booting throwaway API server…');
  const srv = await startServer();
  let exitCode = 0;
  try {
    console.log('[test-api] building fixtures…');
    const fx = await buildFixtures(srv.base);

    for (const mod of MODULES) {
      const started = Date.now();
      try {
        await mod.run(srv.base, fx, srv);
        console.log(`  ✓ ${mod.name} (${Date.now() - started} ms)`);
      } catch (err) {
        exitCode = 1;
        console.log(`  ✗ ${mod.name} — ${(err as Error).message}`);
      }
    }

    // Coverage BEFORE stop() — the harness deletes the temp dir (trace) on stop.
    const cov = computeCoverage(srv.tracePath);
    const pct = cov.totalSites > 0 ? Math.round((cov.covered / cov.totalSites) * 100) : 100;
    console.log(`\n[test-api] query-site coverage: ${cov.covered}/${cov.totalSites} (${pct}%)`);
    if (cov.uncovered.length > 0) {
      console.log('  uncovered sites:');
      for (const { site } of cov.uncovered) {
        console.log(`    - ${site.file}:${site.line} [${site.kind}] "${site.sql.slice(0, 70)}"`);
      }
      exitCode = 1;
    }
  } finally {
    await srv.stop();
  }

  console.log(exitCode === 0 ? '\n[test-api] ALL GREEN' : '\n[test-api] FAILURES — see above');
  process.exit(exitCode);
}

main();
