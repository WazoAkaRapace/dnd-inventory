/**
 * Query-site coverage gate for npm run test-api.
 *
 * db/index.ts (DB_SQL_TRACE) recorded every prepared statement with its
 * callsite during the run. This module:
 *   1. scrapes every `.prepare(...)` site from apps/api/src/routes/** and
 *      apps/api/src/sync/** (the app's data-query surface; db/seed.ts runs
 *      at boot and db/index.ts is the migration layer — both out of scope),
 *   2. matches each site against the trace, and
 *   3. fails unless every site executed at least once (minus the documented
 *      allowlist below — target: empty).
 *
 * Matching rules:
 *   - static string literal → normalized SQL equality, same file
 *   - template literal      → the stable prefix before the first `${` must
 *                             start an executed statement from that file
 *   - variable argument (.prepare(sql)) → requires an executed statement
 *                             from the exact file:line
 * Line numbers are trusted for variable-arg sites only (they pin the one
 * dynamic builder); string matching alone carries the rest, keeping the
 * gate robust against column drift in stack traces.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './harness.ts';

/**
 * Documented exceptions — a site the suite genuinely cannot reach.
 * Keep this EMPTY if at all possible; each entry needs a reason.
 */
const ALLOWLIST: Array<{ site: string; reason: string }> = [];

interface Site {
  file: string; // e.g. src/routes/auth.ts
  line: number;
  kind: 'static' | 'template' | 'variable';
  sql: string; // full literal (static) / prefix before ${ (template) / '' (variable)
}

function listFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) listFiles(full, out);
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

function norm(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

export function scrapeSites(): Site[] {
  const sites: Site[] = [];
  const roots = ['routes', 'sync'].map((r) => join(REPO_ROOT, 'apps', 'api', 'src', r));
  for (const root of roots) {
    for (const file of listFiles(root)) {
      const rel = file.slice(join(REPO_ROOT, 'apps/api').length + 1).replace(/\\/g, '/');
      const lines = readFileSync(file, 'utf8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const m = line.match(/\.prepare\(\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`|([A-Za-z_$][\w$]*))/);
        if (!m) continue;
        const lineNo = i + 1;
        if (m[1] !== undefined || m[2] !== undefined) {
          sites.push({ file: rel, line: lineNo, kind: 'static', sql: norm(m[1] ?? m[2] ?? '') });
        } else if (m[3] !== undefined) {
          const beforeInterp = m[3].split('${')[0];
          sites.push({
            file: rel,
            line: lineNo,
            kind: 'template',
            sql: norm(beforeInterp),
          });
        } else {
          sites.push({ file: rel, line: lineNo, kind: 'variable', sql: '' });
        }
      }
    }
  }
  return sites;
}

interface TraceEntry {
  file: string;
  line: number;
  sql: string;
}

export function readTrace(tracePath: string): TraceEntry[] {
  let raw: string;
  try {
    raw = readFileSync(tracePath, 'utf8');
  } catch {
    return [];
  }
  const entries: TraceEntry[] = [];
  for (const row of raw.split('\n')) {
    if (!row) continue;
    const [callsite, sql] = row.split('\u0001');
    if (!callsite || sql === undefined) continue;
    const m = callsite.match(/(src\/[\w/-]+\.ts):(\d+):(\d+)/);
    if (!m) continue;
    entries.push({ file: m[1], line: Number(m[2]), sql: norm(sql) });
  }
  return entries;
}

export interface CoverageReport {
  totalSites: number;
  covered: number;
  uncovered: Array<{ site: Site; reason: string }>;
}

export function computeCoverage(tracePath: string): CoverageReport {
  const sites = scrapeSites();
  const trace = readTrace(tracePath);

  const uncovered: Array<{ site: Site; reason: string }> = [];
  let covered = 0;
  for (const site of sites) {
    const allow = ALLOWLIST.find((a) => `${a.site}` === `${site.file}:${site.line}`);
    let hit = false;
    if (site.kind === 'static') {
      hit = trace.some((t) => t.file === site.file && t.sql === site.sql);
    } else if (site.kind === 'template') {
      // A template with no interpolation is effectively static
      hit = trace.some(
        (t) => t.file === site.file && (site.sql === '' ? true : t.sql.startsWith(site.sql)),
      );
    } else {
      hit = trace.some((t) => t.file === site.file && t.line === site.line);
    }
    if (hit) covered++;
    else uncovered.push({ site, reason: allow?.reason ?? 'not executed' });
  }
  return { totalSites: sites.length, covered, uncovered };
}
