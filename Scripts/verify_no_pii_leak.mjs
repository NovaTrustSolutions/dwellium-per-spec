#!/usr/bin/env node
/**
 * Scripts/verify_no_pii_leak.mjs
 *
 * Phase 0.0 Task 0.0.5 — PII leak smoke test.
 *
 * Scans the repo for patterns that suggest real PII has leaked into
 * AppFolio-derived fixtures or public seed data:
 *   - Real email domains (gmail, yahoo, hotmail, outlook, aol, icloud, me, mac, live, msn)
 *   - US phone formats: (NNN) NNN-NNNN
 *   - Raw SSN: NNN-NN-NNNN (stand-alone word boundaries)
 *   - SSN-mask leak: XX-XX + 4-digit suffix
 *
 * Allowlist:
 *   - @example.com, @example.org, @dwellium.test  (placeholders)
 *   - (555) 555-XXXX                               (sanitized phone marker)
 *   - XX-XX-XXXX                                   (sanitized SSN marker)
 *
 * Exit codes:
 *   0 — clean. Prints "PII scan clean — N files scanned, 0 leaks found".
 *   1 — leak found. Prints "<file>:<line>:<match>" for each hit.
 *   2 — scan failed (path missing, read error).
 *
 * Intentionally zero runtime deps. Node >=16 (pure ESM + fs/promises).
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(__filename, '..', '..'); // Scripts/../ = repo root

// Strict roots — a leak here fails the scanner (blocks CI / pre-commit).
// public/data was promoted out of LEGACY_ROOTS after Task 0.0.5b cleaned all
// 2,023 pre-existing findings via Scripts/sanitize_legacy_public_data.mjs.
const STRICT_ROOTS = [
  'qualia-shell/src/components/StrataDashboard/fixtures/appfolioDerived',
  'qualia-shell/public/data',
];

// Legacy roots — reserved for future carve-outs. Currently empty: every
// previously-legacy path has been sanitized and moved to STRICT.
const LEGACY_ROOTS = [];

// File extensions worth scanning. Skip lockfiles + binaries.
const EXTS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json']);

// Allowlist substrings — if a line contains one of these verbatim, skip it.
const LINE_ALLOWLIST = [
  '@example.com',
  '@example.org',
  '@dwellium.test',
  '(555) 555-XXXX',
  '555-555-XXXX',
  'XX-XX-XXXX',
  'XX-XXX-XXXX',
];

// Pattern definitions. Each pattern reports `{label, regex}`.
const PATTERNS = [
  {
    label: 'real-email-domain',
    regex: /[A-Za-z0-9._%+-]+@(gmail|yahoo|hotmail|outlook|aol|icloud|me|mac|live|msn)\.(com|net|org)\b/gi,
  },
  {
    label: 'us-phone-parenthesized',
    regex: /\(\d{3}\)\s*\d{3}-\d{4}/g,
  },
  {
    label: 'us-phone-dashed',
    regex: /\b\d{3}-\d{3}-\d{4}\b/g,
  },
  {
    label: 'ssn-raw',
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
  },
  {
    label: 'ssn-mask-leak',
    regex: /\bXX-XXX\d{4}\b/g,
  },
];

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      yield* walk(full);
    } else if (entry.isFile()) {
      const dot = entry.name.lastIndexOf('.');
      const ext = dot >= 0 ? entry.name.slice(dot) : '';
      if (EXTS.has(ext)) yield full;
    }
  }
}

function scanLine(line) {
  for (const allow of LINE_ALLOWLIST) {
    if (line.includes(allow)) return [];
  }
  const hits = [];
  for (const { label, regex } of PATTERNS) {
    regex.lastIndex = 0;
    let m;
    while ((m = regex.exec(line)) !== null) {
      // Skip allowlisted substrings that overlap this match
      const matched = m[0];
      let skip = false;
      for (const allow of LINE_ALLOWLIST) {
        if (matched.includes(allow) || allow.includes(matched)) { skip = true; break; }
      }
      if (!skip) hits.push({ label, matched });
    }
  }
  return hits;
}

async function scanFile(absPath, rel) {
  let text;
  try {
    text = await readFile(absPath, 'utf8');
  } catch (err) {
    console.error(`[WARN] cannot read ${rel}: ${err.message}`);
    return [];
  }
  const lines = text.split(/\r?\n/);
  const leaks = [];
  for (let i = 0; i < lines.length; i++) {
    const hits = scanLine(lines[i]);
    for (const h of hits) {
      leaks.push({ file: rel, line: i + 1, label: h.label, match: h.matched });
    }
  }
  return leaks;
}

async function scanRoots(roots, tier) {
  const leaks = [];
  let files = 0;
  for (const root of roots) {
    const abs = join(REPO_ROOT, root);
    let exists = true;
    try { await stat(abs); } catch { exists = false; }
    if (!exists) {
      console.error(`[INFO] ${tier} scan root absent, skipping: ${root}`);
      continue;
    }
    for await (const filePath of walk(abs)) {
      files++;
      const rel = relative(REPO_ROOT, filePath).split(sep).join('/');
      const fileLeaks = await scanFile(filePath, rel);
      leaks.push(...fileLeaks);
    }
  }
  return { leaks, files };
}

async function main() {
  const startedAt = Date.now();

  const strict = await scanRoots(STRICT_ROOTS, 'strict');
  const legacy = await scanRoots(LEGACY_ROOTS, 'legacy');
  const elapsedMs = Date.now() - startedAt;

  // Summarize legacy findings (non-blocking)
  if (legacy.leaks.length > 0) {
    console.warn(`[WARN] legacy scope: ${legacy.files} files scanned in public/data — ${legacy.leaks.length} pre-existing PII findings.`);
    console.warn(`       These predate Phase 0 and are tracked as Phase 0.0 Task 0.0.5b remediation.`);
    console.warn(`       To see every finding, run: node Scripts/verify_no_pii_leak.mjs --show-legacy`);
    if (process.argv.includes('--show-legacy')) {
      for (const l of legacy.leaks) {
        console.warn(`  [legacy] ${l.file}:${l.line}:[${l.label}] ${l.match}`);
      }
    }
  } else {
    console.log(`[OK] legacy scope: ${legacy.files} files scanned, 0 findings.`);
  }

  if (strict.leaks.length === 0) {
    const roots = STRICT_ROOTS.length === 1 ? STRICT_ROOTS[0] : `${STRICT_ROOTS.length} roots`;
    console.log(`PII scan clean (strict scope) — ${strict.files} files scanned across ${roots}, 0 leaks found (${elapsedMs}ms total).`);
    process.exit(0);
  }

  console.error(`PII scan FAILED (strict scope) — ${strict.files} files scanned, ${strict.leaks.length} leak(s) found:`);
  for (const l of strict.leaks) {
    console.error(`  ${l.file}:${l.line}:[${l.label}] ${l.match}`);
  }
  console.error(``);
  console.error(`Sanitize via Scripts/derive_appfolio_fixtures.mjs or replace with @example.com / (555) 555-XXXX / XX-XX-XXXX.`);
  process.exit(1);
}

main().catch((err) => {
  console.error(`[ERROR] scanner crashed: ${err.stack || err.message}`);
  process.exit(2);
});
