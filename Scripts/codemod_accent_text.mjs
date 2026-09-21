#!/usr/bin/env node
/**
 * Plan 065 Phase 3 — accent-as-text codemod.
 *
 * Rewrites, in qualia-shell/src/**:
 *   CSS  `color: var(--accent)`            -> `color: var(--accent-text)`
 *   CSS  `color: var(--accent, <fallback>)` -> `color: var(--accent-text, <fallback>)`
 *   TSX  `color: 'var(--accent)'` / `"..."` -> same quote style with `var(--accent-text)` (+ fallback form)
 *
 * Property must be exactly `color` — background-color, border-color, outline-color, caret-color,
 * accent-color, -webkit-text-fill-color, custom properties (--x: var(--accent)), and --accent-hover /
 * --accent-subtle / --accent-text itself are all left untouched (see the two regexes below).
 *
 * Usage (run from repo root):
 *   node Scripts/codemod_accent_text.mjs [--write] [--only <pathPrefix>]... [--except <pathPrefix>]...
 *   node Scripts/codemod_accent_text.mjs --self-test
 *
 * Dry-run by default. <pathPrefix> is relative to qualia-shell/src (e.g. components/StrataDashboard).
 * ponytail: plain Node fs/path, no deps — this is a mechanical, reviewable sweep, not a real CSS/TSX parser.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const SRC_ROOT = join(REPO_ROOT, 'qualia-shell', 'src');

// One level of balanced parens — enough for fallback shapes seen in this repo: rgba(...), var(...).
const FALLBACK = String.raw`(?:[^()]|\([^()]*\))*`;

// Shape (a)+(b): CSS declaration whose property is exactly `color`.
// Boundary: preceded by start-of-text, whitespace, `{` or `;` — never a word char or `-`, so
// background-color / border-color / outline-color / caret-color / accent-color / -webkit-text-fill-color
// / --custom-color never match (the literal "color" in them is preceded by `-`).
const CSS_RE = new RegExp(
  String.raw`(^|[\s{;])color(\s*:\s*)var\(--accent(-hover)?(,\s*${FALLBACK})?\)(\s*!important)?`,
  'g',
);

// Shape (c): TSX inline-style object key `color: 'var(--accent)'`.
// Boundary: preceded by whitespace, `{` or `,`. camelCase keys (backgroundColor, borderColor) never
// match by construction — they contain "Color" (capital C), never the lowercase literal "color".
const TSX_RE = new RegExp(
  String.raw`([\s{,])color(\s*:\s*)(['"])var\(--accent(-hover)?(,\s*${FALLBACK})?\)\3`,
  'g',
);

function transformCss(content) {
  const samples = { cssPlain: [], cssFallback: [] };
  const counts = { cssPlain: 0, cssFallback: 0 };
  const out = content.replace(CSS_RE, (match, pre, colon, hover, fb, important) => {
    const after = `${pre}color${colon}var(--accent-text${hover || ''}${fb || ''})${important || ''}`;
    const key = fb ? 'cssFallback' : 'cssPlain';
    counts[key]++;
    if (samples[key].length < 3) samples[key].push([match, after]);
    return after;
  });
  return { out, counts, samples };
}

function transformTsx(content) {
  const samples = { tsxPlain: [], tsxFallback: [] };
  const counts = { tsxPlain: 0, tsxFallback: 0 };
  const out = content.replace(TSX_RE, (match, pre, colon, quote, hover, fb) => {
    const after = `${pre}color${colon}${quote}var(--accent-text${hover || ''}${fb || ''})${quote}`;
    const key = fb ? 'tsxFallback' : 'tsxPlain';
    counts[key]++;
    if (samples[key].length < 3) samples[key].push([match, after]);
    return after;
  });
  return { out, counts, samples };
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'build') continue;
    const full = join(dir, entry);
    if (full === join(SRC_ROOT, 'test')) continue; // skip src/test
    const st = statSync(full);
    if (st.isDirectory()) walk(full, files);
    else if (/\.(css|tsx)$/.test(entry)) files.push(full);
  }
  return files;
}

function relSrc(full) {
  return relative(SRC_ROOT, full).split(sep).join('/');
}

// ---- self-test -------------------------------------------------------------

const SELF_TEST_CASES = [
  // MUST NOT touch — non-`color` properties
  { label: 'background-color untouched', kind: 'css',
    input: 'background-color: var(--accent);', expected: 'background-color: var(--accent);' },
  { label: 'border-color untouched (no space)', kind: 'css',
    input: 'border-color:var(--accent);', expected: 'border-color:var(--accent);' },
  { label: '-webkit-text-fill-color untouched', kind: 'css',
    input: '-webkit-text-fill-color: var(--accent);', expected: '-webkit-text-fill-color: var(--accent);' },
  { label: 'custom property --chip-color untouched', kind: 'css',
    input: '--chip-color: var(--accent);', expected: '--chip-color: var(--accent);' },
  { label: 'outline-color untouched', kind: 'css',
    input: 'outline-color: var(--accent);', expected: 'outline-color: var(--accent);' },
  { label: 'caret-color untouched', kind: 'css',
    input: 'caret-color: var(--accent);', expected: 'caret-color: var(--accent);' },
  { label: 'accent-color untouched', kind: 'css',
    input: 'accent-color: var(--accent);', expected: 'accent-color: var(--accent);' },
  { label: '--accent-hover as TEXT -> --accent-text-hover (it fails AA on 4 themes)', kind: 'css',
    input: 'color: var(--accent-hover);', expected: 'color: var(--accent-text-hover);' },
  { label: '--accent-hover as a fill untouched', kind: 'css',
    input: 'background: var(--accent-hover); border-color: var(--accent-hover);', expected: 'background: var(--accent-hover); border-color: var(--accent-hover);' },
  { label: '--accent-subtle untouched', kind: 'css',
    input: 'color: var(--accent-subtle);', expected: 'color: var(--accent-subtle);' },
  { label: 'TSX --accent-hover as text', kind: 'tsx',
    input: "{ color: 'var(--accent-hover)' }", expected: "{ color: 'var(--accent-text-hover)' }" },
  { label: '--accent-text-hover idempotent', kind: 'css',
    input: 'color: var(--accent-text-hover);', expected: 'color: var(--accent-text-hover);' },
  // MUST touch — plain color, various forms
  { label: 'plain color declaration', kind: 'css',
    input: 'color: var(--accent);', expected: 'color: var(--accent-text);' },
  { label: 'color with !important', kind: 'css',
    input: 'color:var(--accent)!important;', expected: 'color:var(--accent-text)!important;' },
  { label: 'minified one-liner, color + background on one line', kind: 'css',
    input: 'a{color:var(--accent);background:var(--accent)}',
    expected: 'a{color:var(--accent-text);background:var(--accent)}' },
  { label: 'fallback form with nested rgba()', kind: 'css',
    input: 'color: var(--accent, rgba(1,2,3,.5));', expected: 'color: var(--accent-text, rgba(1,2,3,.5));' },
  { label: 'fallback form with nested var()', kind: 'css',
    input: 'color: var(--accent, var(--accent));', expected: 'color: var(--accent-text, var(--accent));' },
  { label: 'idempotent — already-converted CSS input unchanged', kind: 'css',
    input: 'color: var(--accent-text);', expected: 'color: var(--accent-text);' },
  // TSX
  { label: 'TSX single-quote color, sibling borderColor untouched', kind: 'tsx',
    input: "{ color: 'var(--accent)', borderColor: 'var(--accent)' }",
    expected: "{ color: 'var(--accent-text)', borderColor: 'var(--accent)' }" },
  { label: 'TSX backgroundColor untouched', kind: 'tsx',
    input: "backgroundColor: 'var(--accent)'", expected: "backgroundColor: 'var(--accent)'" },
  { label: 'TSX double-quote color', kind: 'tsx',
    input: '{ color: "var(--accent)" }', expected: '{ color: "var(--accent-text)" }' },
  { label: 'TSX fallback form', kind: 'tsx',
    input: "{ color: 'var(--accent, #3B82F6)' }", expected: "{ color: 'var(--accent-text, #3B82F6)' }" },
  { label: 'TSX idempotent — already-converted input unchanged', kind: 'tsx',
    input: "{ color: 'var(--accent-text)' }", expected: "{ color: 'var(--accent-text)' }" },
];

function runSelfTest() {
  let failures = 0;
  for (const c of SELF_TEST_CASES) {
    const { out } = c.kind === 'css' ? transformCss(c.input) : transformTsx(c.input);
    const pass = out === c.expected;
    if (!pass) failures++;
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${c.label}`);
    if (!pass) {
      console.log(`    input:    ${c.input}`);
      console.log(`    expected: ${c.expected}`);
      console.log(`    actual:   ${out}`);
    }
  }
  console.log(`\n${SELF_TEST_CASES.length - failures}/${SELF_TEST_CASES.length} passed`);
  process.exit(failures ? 1 : 0);
}

// ---- main --------------------------------------------------------------

function main({ write, only, except }) {
  const files = walk(SRC_ROOT)
    .filter((f) => {
      const rel = relSrc(f);
      if (only.length && !only.some((p) => rel.startsWith(p))) return false;
      if (except.some((p) => rel.startsWith(p))) return false;
      return true;
    })
    .sort();

  const totals = { cssPlain: 0, cssFallback: 0, tsxPlain: 0, tsxFallback: 0 };
  const sampleBank = { cssPlain: [], cssFallback: [], tsxPlain: [], tsxFallback: [] };
  let filesChanged = 0;

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const isTsx = file.endsWith('.tsx');
    const result = isTsx ? transformTsx(content) : transformCss(content);
    const fileTotal = Object.values(result.counts).reduce((a, b) => a + b, 0);
    if (fileTotal === 0) continue;

    filesChanged++;
    console.log(`${relSrc(file)}: ${fileTotal}`);
    for (const k of Object.keys(totals)) totals[k] += result.counts[k] || 0;
    for (const k of Object.keys(sampleBank)) {
      for (const s of result.samples[k] || []) {
        if (sampleBank[k].length < 3) sampleBank[k].push({ file: relSrc(file), before: s[0], after: s[1] });
      }
    }
    if (write) writeFileSync(file, result.out, 'utf8');
  }

  const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0);
  console.log('---');
  console.log(`files scanned: ${files.length}, files with matches: ${filesChanged}`);
  console.log(`CSS  color: var(--accent)              : ${totals.cssPlain}`);
  console.log(`CSS  color: var(--accent, fallback)    : ${totals.cssFallback}`);
  console.log(`TSX  color: 'var(--accent)'             : ${totals.tsxPlain}`);
  console.log(`TSX  color: 'var(--accent, fallback)'   : ${totals.tsxFallback}`);
  console.log(`TOTAL: ${grandTotal}`);

  if (write) {
    console.log(`\nWrote changes to ${filesChanged} file(s).`);
  } else {
    console.log('\n--- samples (dry run, up to 3 per shape) ---');
    for (const [shape, samples] of Object.entries(sampleBank)) {
      if (!samples.length) continue;
      console.log(`\n[${shape}]`);
      for (const s of samples) {
        console.log(`  ${s.file}`);
        console.log(`    before: ${s.before}`);
        console.log(`    after:  ${s.after}`);
      }
    }
  }
}

// ---- cli -----------------------------------------------------------------

const argv = process.argv.slice(2);
if (argv.includes('--self-test')) {
  runSelfTest();
} else {
  const only = [];
  const except = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--only') only.push(argv[++i]);
    if (argv[i] === '--except') except.push(argv[++i]);
  }
  main({ write: argv.includes('--write'), only, except });
  process.exit(0);
}
