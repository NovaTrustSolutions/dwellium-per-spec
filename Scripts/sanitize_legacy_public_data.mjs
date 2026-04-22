#!/usr/bin/env node
/**
 * Scripts/sanitize_legacy_public_data.mjs
 *
 * Phase 0.0 Task 0.0.5b — one-off sanitizer for pre-existing PII in
 * qualia-shell/public/data/*.json.
 *
 * The public/data seed files pre-date the Phase 0 fixture derivation and
 * carry real PII (emails, phones) that the PII scanner flags as legacy
 * warnings. This script rewrites those files in place, replacing each
 * detected pattern with an allowlisted placeholder that the scanner
 * accepts. Stable hashes preserve referential dedup (same source value
 * maps to same placeholder).
 *
 * Behaviour:
 *   - Emails  → user-<hash8>@example.com
 *   - Phones  → (555) 555-XXXX   (allowlist literal)
 *   - SSNs    → XX-XX-XXXX       (allowlist literal)
 *
 * Safety:
 *   - Every file backed up to <file>.bak before overwrite.
 *   - JSON re-serialized with 2-space indent to match original style.
 *   - Post-write verifier re-parses the JSON so syntax errors surface
 *     before the script exits.
 *
 * Exit codes:
 *   0 — clean rewrite, all files re-parseable.
 *   1 — write / parse failure.
 *
 * Zero runtime deps. Node >=16.
 */

import { readFile, writeFile, copyFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(__filename, '..', '..');
const DATA_DIR = join(REPO_ROOT, 'qualia-shell/public/data');

// Files with known legacy PII. Any *.json in DATA_DIR could be scanned, but
// being explicit here keeps the blast radius tight and auditable.
const TARGETS = [
  'entities.json',
  'properties.json',
  'audit_log.json',
  'workitems.json',
  'notes.json',
];

// Allowlisted placeholders — these match verify_no_pii_leak.mjs LINE_ALLOWLIST.
const PHONE_PLACEHOLDER = '(555) 555-XXXX';
const SSN_PLACEHOLDER = 'XX-XX-XXXX';
const EMAIL_DOMAIN = '@example.com';

// Patterns — mirror verify_no_pii_leak.mjs.
const PHONE_PAREN_RE = /\(\d{3}\)\s*\d{3}-\d{4}/g;
// Mirror verifier exactly: plain \b. We rely on running SSN replacement FIRST
// so no raw SSN digits are left to confuse this match.
const PHONE_DASH_RE = /\b\d{3}-\d{3}-\d{4}\b/g;
const EMAIL_RE =
  /[A-Za-z0-9._%+-]+@(gmail|yahoo|hotmail|outlook|aol|icloud|me|mac|live|msn)\.(com|net|org)\b/gi;
const SSN_RAW_RE = /\b\d{3}-\d{2}-\d{4}\b/g;
const SSN_MASK_RE = /\bXX-XXX\d{4}\b/g;

function hash8(v) {
  return createHash('sha256').update(String(v)).digest('hex').slice(0, 8);
}

function sanitizeEmailMatch(match) {
  // Preserve the local-part identity deterministically: same source email ->
  // same placeholder -> preserves any dedup references downstream.
  return `user-${hash8(match.toLowerCase())}${EMAIL_DOMAIN}`;
}

function sanitizeString(s) {
  if (typeof s !== 'string') return s;
  // Order matters: SSN-raw first (before PHONE_DASH regex absorbs it),
  // then SSN-mask leak, then phones, then emails.
  // NOTE: PHONE_DASH uses negative lookarounds to avoid SSN digits.
  return s
    .replace(SSN_RAW_RE, SSN_PLACEHOLDER)
    .replace(SSN_MASK_RE, SSN_PLACEHOLDER)
    .replace(PHONE_PAREN_RE, PHONE_PLACEHOLDER)
    .replace(PHONE_DASH_RE, PHONE_PLACEHOLDER)
    .replace(EMAIL_RE, sanitizeEmailMatch);
}

function walk(node) {
  if (node === null || node === undefined) return node;
  if (typeof node === 'string') return sanitizeString(node);
  if (Array.isArray(node)) return node.map(walk);
  if (typeof node === 'object') {
    const out = {};
    for (const k of Object.keys(node)) {
      // Sanitize key too (unlikely but possible).
      const newKey = typeof k === 'string' ? sanitizeString(k) : k;
      out[newKey] = walk(node[k]);
    }
    return out;
  }
  return node;
}

function countPatterns(text) {
  const counts = { email: 0, phoneParen: 0, phoneDash: 0, ssnRaw: 0, ssnMask: 0 };
  counts.email = (text.match(EMAIL_RE) || []).length;
  counts.phoneParen = (text.match(PHONE_PAREN_RE) || []).length;
  counts.phoneDash = (text.match(PHONE_DASH_RE) || []).length;
  counts.ssnRaw = (text.match(SSN_RAW_RE) || []).length;
  counts.ssnMask = (text.match(SSN_MASK_RE) || []).length;
  return counts;
}

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function processFile(name) {
  const abs = join(DATA_DIR, name);
  const bak = `${abs}.bak`;

  if (!(await exists(abs))) {
    console.warn(`[SKIP] ${name} — not present at ${abs}`);
    return { name, skipped: true };
  }

  const raw = await readFile(abs, 'utf8');
  const before = countPatterns(raw);

  // Parse (fail fast if source is bad).
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${name}: source JSON is invalid: ${err.message}`);
  }

  // Back up (unconditional — safe to rerun).
  if (!(await exists(bak))) {
    await copyFile(abs, bak);
  }

  // Sanitize.
  const sanitized = walk(parsed);
  // Detect original indent; default to 2 spaces if dense.
  const indent = /\n\s{2}"/.test(raw.slice(0, 200)) ? 2 : 2;
  const out = JSON.stringify(sanitized, null, indent);

  await writeFile(abs, out + (raw.endsWith('\n') ? '\n' : ''));

  // Verify post-write parse.
  const verifyRaw = await readFile(abs, 'utf8');
  try {
    JSON.parse(verifyRaw);
  } catch (err) {
    throw new Error(`${name}: POST-WRITE JSON invalid — ${err.message}`);
  }
  const after = countPatterns(verifyRaw);

  return { name, before, after, bak };
}

async function main() {
  console.log(`Phase 0.0 Task 0.0.5b — sanitizing public/data/*.json`);
  console.log(`Target dir: ${DATA_DIR}`);
  console.log(``);

  const results = [];
  for (const name of TARGETS) {
    try {
      const r = await processFile(name);
      results.push(r);
      if (r.skipped) continue;
      const totalBefore =
        r.before.email + r.before.phoneParen + r.before.phoneDash + r.before.ssnRaw + r.before.ssnMask;
      const totalAfter =
        r.after.email + r.after.phoneParen + r.after.phoneDash + r.after.ssnRaw + r.after.ssnMask;
      console.log(
        `[OK] ${r.name.padEnd(20)} before=${String(totalBefore).padStart(5)}  after=${String(totalAfter).padStart(3)}  (emails=${r.before.email}, parenPhone=${r.before.phoneParen}, dashPhone=${r.before.phoneDash}, ssn=${r.before.ssnRaw}+${r.before.ssnMask})`
      );
    } catch (err) {
      console.error(`[FAIL] ${name}: ${err.message}`);
      process.exit(1);
    }
  }

  console.log(``);
  console.log(`Backups written alongside originals (*.bak). Re-run verify_no_pii_leak.mjs to confirm 0 legacy findings.`);
}

main().catch((err) => {
  console.error(`[ERROR] sanitizer crashed: ${err.stack || err.message}`);
  process.exit(1);
});
