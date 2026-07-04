#!/usr/bin/env node
/**
 * Scripts/verify_deploy_env.mjs
 *
 * Plan 031 — read-only deploy-env drift verifier.
 *
 * Probes the live production surfaces (Netlify static site + Cloud Run
 * backend) for the specific configuration-drift failure class that has
 * broken Google sign-in twice: a deploy surface silently losing required
 * env vars. See Docs/ops/DEPLOY_ENV_BASELINE.md for the full inventory and
 * recovery runbook this script cross-checks against.
 *
 * STRICTLY READ-ONLY. This script only ever performs GET/POST requests that
 * read state (including a POST to /api/auth/google with a deliberately
 * invalid credential, which the backend rejects without any side effect).
 * It never writes to Netlify, Cloud Run, or Google Cloud.
 *
 * Checks:
 *   1. GET  https://argyleholocron.netlify.app/health          -> expect 200
 *   2. POST https://argyleholocron.netlify.app/api/auth/google -> expect 401
 *      (503 means Cloud Run GOOGLE_CLIENT_ID is missing)
 *   3. Netlify bundle contains the OAuth client-ID prefix "200583798886-"
 *      (absence means VITE_GOOGLE_CLIENT_ID is missing or site not rebuilt)
 *   4. OPTIONAL — only if NETLIFY_AUTH_TOKEN is set in the environment:
 *      confirm the 5 required Netlify env var KEYS exist (names only, never
 *      values). SKIPPED (not FAILED) when the token is absent.
 *
 * Exit codes:
 *   0 — all checks PASS (or SKIPPED). No FAIL.
 *   1 — at least one check FAILed.
 *
 * Intentionally zero runtime deps. Node >=18 (global fetch, pure ESM).
 */

const SITE_ORIGIN = 'https://argyleholocron.netlify.app';
const SITE_ID = 'ee11c6c2-ac8d-494c-b390-e1d2162d7480';
const OAUTH_CLIENT_ID_PREFIX = '200583798886-';
const REQUIRED_NETLIFY_KEYS = [
  'NODE_VERSION',
  'VITE_APPFOLIO_SEEDS',
  'VITE_ONE_SAVE',
  'NETLIFY_API_PROXY_TARGET',
  'VITE_GOOGLE_CLIENT_ID',
];

const results = []; // { label, status: 'PASS'|'FAIL'|'SKIPPED', detail }

function record(label, status, detail) {
  results.push({ label, status, detail });
  const icon = status === 'PASS' ? 'PASS' : status === 'SKIPPED' ? 'SKIPPED' : 'FAIL';
  console.log(`[${icon}] ${label}${detail ? ' — ' + detail : ''}`);
}

async function checkHealth() {
  const label = 'check1-netlify-health';
  try {
    const res = await fetch(`${SITE_ORIGIN}/health`, { method: 'GET' });
    if (res.status === 200) {
      record(label, 'PASS', `GET /health -> 200`);
    } else {
      record(label, 'FAIL', `GET /health -> ${res.status} (expected 200)`);
    }
  } catch (err) {
    record(label, 'FAIL', `request error: ${err.message}`);
  }
}

async function checkAuthProbe(path = '/api/auth/google') {
  const label = 'check2-backend-google-auth-configured';
  try {
    const res = await fetch(`${SITE_ORIGIN}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: 'drift-probe' }),
    });
    if (res.status === 401) {
      record(label, 'PASS', `POST ${path} -> 401 (backend attempted verification, as expected)`);
    } else if (res.status === 503) {
      record(
        label,
        'FAIL',
        `POST ${path} -> 503 — Cloud Run GOOGLE_CLIENT_ID is missing — see Docs/ops/DEPLOY_ENV_BASELINE.md §2`
      );
    } else if (res.status === 404) {
      record(
        label,
        'FAIL',
        `POST ${path} -> 404 — route not found; neither the healthy (401) nor documented-failure (503) signature. Do not adapt silently — report actual response.`
      );
    } else {
      record(label, 'FAIL', `POST ${path} -> ${res.status} (expected 401; 503 = known drift signature)`);
    }
  } catch (err) {
    record(label, 'FAIL', `request error: ${err.message}`);
  }
}

async function checkOAuthClientIdInBundle() {
  const label = 'check3-netlify-oauth-client-id-baked-in';
  try {
    const indexRes = await fetch(`${SITE_ORIGIN}/`, { method: 'GET' });
    if (!indexRes.ok) {
      record(label, 'FAIL', `GET / -> ${indexRes.status}, cannot locate bundle`);
      return;
    }
    const html = await indexRes.text();

    // Collect every JS asset referenced from index.html. React Router v7
    // framework-mode SSR-shell output ships entries as
    // <link rel="modulepreload" href="...js"> rather than <script src="...">
    // (empirically confirmed 2026-07 against the live bundle), so scan both
    // patterns and de-duplicate.
    const scriptSrcs = [...html.matchAll(/<script[^>]+src=["']([^"']+\.js[^"']*)["']/gi)].map((m) => m[1]);
    const modulePreloads = [...html.matchAll(/<link[^>]+rel=["']modulepreload["'][^>]+href=["']([^"']+\.js[^"']*)["']/gi)].map(
      (m) => m[1]
    );
    const assetSet = new Set([...scriptSrcs, ...modulePreloads]);
    if (assetSet.size === 0) {
      record(label, 'FAIL', 'no <script src> or <link rel=modulepreload> JS assets found in index.html — cannot locate bundle');
      return;
    }

    // The OAuth client ID is only referenced from the auth/login route chunk,
    // which is reached via a dynamic import() the RR7 router resolves lazily
    // — it is NOT among the assets index.html eagerly modulepreloads.
    // React Router v7's client manifest (window.__reactRouterManifest, shipped
    // as /assets/manifest-*.js) enumerates every route's module + its static
    // imports, so walk that graph too and union it with the index.html set
    // (empirically required 2026-07 — the client ID lives in a chunk only
    // reachable via the manifest's routes/security "imports" list).
    const manifestUrl = [...assetSet].find((s) => /\/assets\/manifest-[^/]+\.js$/.test(s));
    if (manifestUrl) {
      try {
        const manifestAbsUrl = manifestUrl.startsWith('http') ? manifestUrl : new URL(manifestUrl, SITE_ORIGIN).toString();
        const manifestRes = await fetch(manifestAbsUrl, { method: 'GET' });
        if (manifestRes.ok) {
          const manifestBody = await manifestRes.text();
          for (const m of manifestBody.matchAll(/"(\/assets\/[^"]+\.js)"/g)) {
            assetSet.add(m[1]);
          }
        }
      } catch {
        // manifest fetch/parse failure — fall back to the index.html-derived set only
      }
    }

    const jsAssets = [...assetSet];
    let found = false;
    let scanned = 0;
    for (const src of jsAssets) {
      const url = src.startsWith('http') ? src : new URL(src, SITE_ORIGIN).toString();
      try {
        const jsRes = await fetch(url, { method: 'GET' });
        if (!jsRes.ok) continue;
        const body = await jsRes.text();
        scanned += 1;
        if (body.includes(OAUTH_CLIENT_ID_PREFIX)) {
          found = true;
          break;
        }
      } catch {
        // ignore individual asset fetch failures, keep scanning others
      }
    }

    if (found) {
      record(label, 'PASS', `client-ID prefix "${OAUTH_CLIENT_ID_PREFIX}" found in bundle (${scanned} asset(s) scanned, ${jsAssets.length} discovered via index.html + manifest)`);
    } else {
      record(
        label,
        'FAIL',
        `Netlify VITE_GOOGLE_CLIENT_ID missing or site not rebuilt — §1 (${scanned} asset(s) scanned, prefix not found)`
      );
    }
  } catch (err) {
    record(label, 'FAIL', `request error: ${err.message}`);
  }
}

async function checkNetlifyEnvKeysOptional() {
  const label = 'check4-netlify-env-keys-optional';
  const token = process.env.NETLIFY_AUTH_TOKEN;
  if (!token) {
    record(label, 'SKIPPED', 'NETLIFY_AUTH_TOKEN not set — skipping authenticated env-key check');
    return;
  }
  try {
    // Resolve the account slug for this token, then list env var keys.
    const accountsRes = await fetch('https://api.netlify.com/api/v1/accounts', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!accountsRes.ok) {
      record(label, 'FAIL', `GET /api/v1/accounts -> ${accountsRes.status}`);
      return;
    }
    const accounts = await accountsRes.json();
    const slug = Array.isArray(accounts) && accounts[0] && accounts[0].slug;
    if (!slug) {
      record(label, 'FAIL', 'no account slug returned — cannot query site env');
      return;
    }

    const envRes = await fetch(
      `https://api.netlify.com/api/v1/accounts/${slug}/env?site_id=${SITE_ID}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!envRes.ok) {
      record(label, 'FAIL', `GET env -> ${envRes.status}`);
      return;
    }
    const envVars = await envRes.json();
    const presentKeys = new Set((Array.isArray(envVars) ? envVars : []).map((v) => v.key));
    const missing = REQUIRED_NETLIFY_KEYS.filter((k) => !presentKeys.has(k));

    if (missing.length === 0) {
      record(label, 'PASS', `all ${REQUIRED_NETLIFY_KEYS.length} required keys present (names only checked, no values read)`);
    } else {
      record(label, 'FAIL', `missing keys: ${missing.join(', ')}`);
    }
  } catch (err) {
    record(label, 'FAIL', `request error: ${err.message}`);
  }
}

async function main() {
  console.log('verify_deploy_env.mjs — read-only deploy-env drift check');
  console.log(`Target: ${SITE_ORIGIN}\n`);

  await checkHealth();
  await checkAuthProbe();
  await checkOAuthClientIdInBundle();
  await checkNetlifyEnvKeysOptional();

  const fails = results.filter((r) => r.status === 'FAIL');
  console.log('');
  if (fails.length === 0) {
    console.log(`All checks PASS or SKIPPED (${results.length} total, 0 FAIL).`);
    process.exit(0);
  } else {
    console.log(`${fails.length} check(s) FAILED:`);
    for (const f of fails) console.log(`  - ${f.label}: ${f.detail}`);
    process.exit(1);
  }
}

main();
