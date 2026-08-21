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
 *
 * Scraping is whole-file (not line-based): multi-line template literals
 * (`.prepare(` + newline + SQL) and literals starting on the line after
 * `.prepare(` are enforced exactly like their single-line twins.
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

/**
 * Scan a source file for `.prepare(<arg>)` occurrences.
 *
 * Handles the three argument shapes the route code uses, including forms the
 * old line-based regex missed: a backtick template whose SQL starts on the
 * line AFTER `.prepare(\``, a template spanning several lines, and a quoted
 * literal indented on the following line. Interpolation nesting (`${` … `}`)
 * is tracked so a backtick inside an interpolation can't terminate the scan.
 */
function scanPrepareSites(src: string): Array<Omit<Site, 'file'>> {
  const out: Array<Omit<Site, 'file'>> = [];
  const needle = '.prepare';
  let i = 0;
  while (true) {
    const at = src.indexOf(needle, i);
    if (at === -1) break;
    i = at + needle.length;
    // require the '(' (skipping spaces) so `.prepareX(` etc. can't match
    let j = i;
    while (j < src.length && /\s/.test(src[j])) j++;
    if (src[j] !== '(') continue;
    j++;
    while (j < src.length && /\s/.test(src[j])) j++;
    const line = src.slice(0, at).split('\n').length;
    const c = src[j];

    if (c === "'" || c === '"') {
      // JS string literals cannot span raw newlines — read to the closing quote
      let k = j + 1;
      let text = '';
      let closed = false;
      while (k < src.length && src[k] !== '\n') {
        if (src[k] === '\\' && k + 1 < src.length) {
          text += src.slice(k, k + 2);
          k += 2;
          continue;
        }
        if (src[k] === c) {
          closed = true;
          break;
        }
        text += src[k];
        k++;
      }
      if (!closed) continue;
      out.push({ line, kind: 'static', sql: norm(text) });
      i = k + 1;
      continue;
    }

    if (c === '`') {
      // template literal — read until an unescaped backtick outside ${…}
      let k = j + 1;
      let depth = 0;
      let text = '';
      let closed = false;
      while (k < src.length) {
        const ch = src[k];
        if (ch === '\\' && k + 1 < src.length) {
          text += src.slice(k, k + 2);
          k += 2;
          continue;
        }
        if (depth === 0 && ch === '`') {
          closed = true;
          break;
        }
        if (ch === '$' && src[k + 1] === '{') {
          depth++;
          text += '${';
          k += 2;
          continue;
        }
        if (depth > 0 && ch === '}') {
          depth--;
          text += '}';
          k += 1;
          continue;
        }
        text += ch;
        k++;
      }
      if (!closed) continue;
      const beforeInterp = text.split('${')[0];
      out.push({ line, kind: 'template', sql: norm(beforeInterp) });
      i = k + 1;
      continue;
    }

    if (c !== undefined && /[A-Za-z_$]/.test(c)) {
      out.push({ line, kind: 'variable', sql: '' });
      i = j + 1;
    }
  }
  return out;
}

export function scrapeSites(): Site[] {
  const sites: Site[] = [];
  const roots = ['routes', 'sync'].map((r) => join(REPO_ROOT, 'apps', 'api', 'src', r));
  for (const root of roots) {
    for (const file of listFiles(root)) {
      const rel = file.slice(join(REPO_ROOT, 'apps', 'api').length + 1).replace(/\\/g, '/');
      for (const hit of scanPrepareSites(readFileSync(file, 'utf8'))) {
        sites.push({ file: rel, ...hit });
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
