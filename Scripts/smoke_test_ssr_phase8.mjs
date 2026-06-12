#!/usr/bin/env node
/**
 * Phase-8+ Task 8.11 — SSR smoke-test bundle
 *
 * Verifies the Phase-8+ provider-remediation arc (Tasks 8.9 + 8.10; 14
 * cumulative `createLocalStorageStore`-factory-produced stores) under
 * true SSR runtime (`ssr: true` at `qualia-shell/react-router.config.ts`
 * post-Task-8.11 flip). HARD-blocking assertions per Cowork Q4 LOCK:
 *
 *   - Zero `ReferenceError` in server-render output (matches the
 *     useSyncExternalStore + getServerSnapshot SSR-safety contract
 *     established at Tasks 8.9 + 8.10).
 *   - Zero React hydration mismatch warnings (matches Finding EE
 *     Q2 LOCK Option α empirical-confirmation that AuthGate flash IS
 *     NOT a ssr:true regression — server-rendered spinner === client-
 *     hydrated spinner at initial paint).
 *   - Pre-hydration HTML contains expected FOUC IIFE className OR
 *     LoginScreen content (sanity check on canonical render path).
 *
 * 5-phase design per Cowork Q4 LOCK:
 *   Phase A — Bootstrap: react-router build (idempotent; matches CI)
 *   Phase B — Server start: react-router-serve build/server/index.js
 *   Phase C — Probe: playwright-chromium headless navigation
 *   Phase D — Assertions: HARD-blocking; non-zero exit on failure
 *   Phase E — Cleanup: kill server PID + close browser (always runs)
 *
 * Sister-shape to:
 *   - Scripts/run_lighthouse_phase7.mjs (Phase-7 7.11 measurement-only
 *     script precedent; root-level Scripts/ + .mjs convention)
 *   - Scripts/run_axe_phase6.mjs (Phase-6 6.7 axe-baseline measurement)
 *
 * Strict-gate local integration (per CLAUDE.md "Useful commands"):
 *   cd qualia-shell && npx tsc -b && npx vitest run && npx react-router build \
 *     && VITE_APPFOLIO_SEEDS=false npx react-router build && cd .. \
 *     && node Scripts/verify_no_pii_leak.mjs \
 *     && node Scripts/smoke_test_ssr_phase8.mjs
 *
 * CI integration: .github/workflows/appfolio-parity-gate.yml NEW step
 * AFTER react-router build (SEEDS=true) + BEFORE Playwright baseline
 * E2E; BLOCKING (continue-on-error: false).
 *
 * Environment variables:
 *   SMOKE_TEST_PORT     — server port (default 3000; deferred-item #7
 *                         Phase-7 7.11 env-overridable precedent)
 *   SMOKE_TEST_SKIP_BUILD — set to 'true' to skip Phase A (use existing
 *                           build/server/ artifacts; for local dev iter)
 *   SMOKE_TEST_TIMEOUT_MS — probe timeout (default 30000)
 */

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { existsSync } from 'node:fs';
import { resolve as pathResolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const QUALIA_SHELL_DIR = pathResolve(__dirname, '..', 'qualia-shell');

// Phase-8+ Task 8.11 — load playwright from qualia-shell/node_modules
// (NOT from repo-root cwd) per Phase-7 Scripts/run_lighthouse_phase7.mjs
// createRequire precedent. Linux CI fails with ERR_MODULE_NOT_FOUND
// without this — there is no root-level package.json, so Node ESM
// resolution walking up from /Scripts/ never reaches a node_modules/
// containing playwright. Resolving from qualia-shell/package.json
// anchors the lookup at qualia-shell/node_modules/.
const qualiaShellRequire = createRequire(join(QUALIA_SHELL_DIR, 'package.json'));
const { chromium } = qualiaShellRequire('playwright');
// P11-1 (2026-06-12): default 3000 → 3210 — the live Dwellium backend holds
// :3000 in local dev, so the old default false-FAILed (probe hit the backend,
// 404/139 B; Phase-10 closure finding #1). CI has nothing on :3210 either.
const PORT = parseInt(process.env.SMOKE_TEST_PORT ?? '3210', 10);
const TIMEOUT_MS = parseInt(process.env.SMOKE_TEST_TIMEOUT_MS ?? '30000', 10);
const SKIP_BUILD = process.env.SMOKE_TEST_SKIP_BUILD === 'true';
const SERVER_URL = `http://localhost:${PORT}/`;

const HYDRATION_MISMATCH_PATTERNS = [
    /Warning: Text content did not match/i,
    /Warning: Hydration failed/i,
    /Warning: Did not expect server HTML to contain/i,
    /Hydration mismatch/i,
    /A tree hydrated but some attributes/i,
];

const REFERENCE_ERROR_PATTERNS = [
    /ReferenceError/i,
    /localStorage is not defined/i,
    /window is not defined/i,
    /document is not defined/i,
    /navigator is not defined/i,
];

let serverProc = null;
let browser = null;

function log(label, ...args) {
    console.log(`[smoke-test:${label}]`, ...args);
}

function fail(reason, details) {
    console.error(`\n[smoke-test:FAIL] ${reason}`);
    if (details) console.error(details);
    process.exitCode = 1;
}

async function cleanup() {
    if (browser) {
        try { await browser.close(); } catch { /* swallow */ }
        browser = null;
    }
    if (serverProc && serverProc.pid && !serverProc.killed) {
        try {
            // Destroy stdio pipes BEFORE killing the process — otherwise
            // Node.js keeps the parent alive due to open pipe handles to
            // the child's stdout/stderr (empirically observed at Linux CI
            // Parity Gate run 26094673300 — script reached `✓ PASS` at
            // 11:40:33 but step did not terminate until 30-min workflow
            // timeout at 12:08:09; LOCAL macOS exits promptly due to OS-
            // level pipe cleanup divergence).
            try { serverProc.stdout?.destroy(); } catch { /* swallow */ }
            try { serverProc.stderr?.destroy(); } catch { /* swallow */ }
            process.kill(serverProc.pid, 'SIGTERM');
            // Allow graceful shutdown; force kill after 2s
            await sleep(2000);
            if (!serverProc.killed) {
                try { process.kill(serverProc.pid, 'SIGKILL'); } catch { /* swallow */ }
            }
        } catch { /* swallow */ }
        serverProc = null;
    }
}

process.on('exit', () => {
    if (serverProc && serverProc.pid && !serverProc.killed) {
        try { process.kill(serverProc.pid, 'SIGKILL'); } catch { /* swallow */ }
    }
});
process.on('SIGINT', async () => { await cleanup(); process.exit(130); });
process.on('SIGTERM', async () => { await cleanup(); process.exit(143); });

// ─── Phase A — Bootstrap: react-router build ──────────────────────────
async function phaseABootstrap() {
    log('A', 'Bootstrap — react-router build (ssr:true)');
    if (SKIP_BUILD) {
        log('A', 'SMOKE_TEST_SKIP_BUILD=true; skipping build (assuming build/server/ exists)');
        if (!existsSync(pathResolve(QUALIA_SHELL_DIR, 'build', 'server', 'index.js'))) {
            throw new Error('SMOKE_TEST_SKIP_BUILD=true but build/server/index.js absent — run `npx react-router build` first');
        }
        return;
    }
    await new Promise((resolve, reject) => {
        const build = spawn('npx', ['react-router', 'build'], {
            cwd: QUALIA_SHELL_DIR,
            stdio: 'inherit',
            env: process.env,
        });
        build.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`react-router build exit ${code}`)));
        build.on('error', reject);
    });
    if (!existsSync(pathResolve(QUALIA_SHELL_DIR, 'build', 'server', 'index.js'))) {
        throw new Error('build/server/index.js absent after build — ssr:true config not in effect?');
    }
    log('A', 'Bootstrap PASS — build/server/index.js exists');
}

// ─── Phase B — Server start: react-router-serve ───────────────────────
async function phaseBServerStart() {
    log('B', `Server start — react-router-serve build/server/index.js on port ${PORT}`);
    serverProc = spawn(
        'npx',
        ['react-router-serve', 'build/server/index.js'],
        {
            cwd: QUALIA_SHELL_DIR,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, PORT: String(PORT) },
        },
    );

    const serverLogs = [];
    serverProc.stdout.on('data', (chunk) => serverLogs.push(`[stdout] ${chunk.toString()}`));
    serverProc.stderr.on('data', (chunk) => serverLogs.push(`[stderr] ${chunk.toString()}`));
    serverProc.on('exit', (code) => {
        if (code !== null && code !== 0 && process.exitCode !== 1) {
            console.error('[smoke-test:server] Server exited unexpectedly with code', code);
            console.error(serverLogs.join(''));
        }
    });

    // Poll for server readiness
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(SERVER_URL, { method: 'HEAD' });
            if (res.status < 500) {
                log('B', `Server ready (HTTP ${res.status} on HEAD ${SERVER_URL})`);
                return;
            }
        } catch { /* not yet listening */ }
        await sleep(250);
    }
    console.error(serverLogs.join(''));
    throw new Error(`Server did not become ready on ${SERVER_URL} within 15s`);
}

// ─── Phase C — Probe: playwright-chromium ─────────────────────────────
async function phaseCProbe() {
    log('C', 'Probe — playwright-chromium headless navigation');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const consoleMessages = [];
    const pageErrors = [];

    page.on('console', (msg) => {
        consoleMessages.push({ type: msg.type(), text: msg.text() });
    });
    page.on('pageerror', (err) => {
        pageErrors.push(err);
    });

    // Capture pre-hydration HTML via raw fetch (no JS execution)
    const rawRes = await fetch(SERVER_URL);
    const preHydrationHtml = await rawRes.text();
    const preHydrationStatus = rawRes.status;

    log('C', `Raw fetch status: ${preHydrationStatus} (${preHydrationHtml.length} bytes)`);

    // Navigate via playwright (executes JS + hydrates). Use 'domcontentloaded'
    // (not 'networkidle') because production app has async data fetches
    // (LoginScreen autofill, weather API, etc.) that may never settle to
    // 500ms-idle within the test budget — smoke-test only needs to verify
    // hydration completes without ReferenceError / hydration mismatch,
    // NOT wait for all post-hydration network activity to drain.
    await page.goto(SERVER_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });

    // Allow React 19 hydration to settle (concurrent renderer typically
    // commits within a few hundred ms post-DOMContentLoaded).
    await sleep(1500);

    const postHydrationHtml = await page.content();

    await context.close();
    return {
        preHydrationStatus,
        preHydrationHtml,
        postHydrationHtml,
        consoleMessages,
        pageErrors,
    };
}

// ─── Phase D — Assertions (HARD-blocking) ─────────────────────────────
function phaseDAssertions(probe) {
    log('D', 'Assertions (HARD-blocking)');
    const failures = [];

    // 1. Server returned non-5xx
    if (probe.preHydrationStatus >= 500) {
        failures.push(`Server returned ${probe.preHydrationStatus} (expected <500)`);
    }

    // 2. Zero ReferenceError in console messages or page errors
    const refErrConsole = probe.consoleMessages.filter((m) =>
        m.type === 'error' && REFERENCE_ERROR_PATTERNS.some((re) => re.test(m.text)),
    );
    if (refErrConsole.length > 0) {
        failures.push(`ReferenceError in console: ${refErrConsole.map((m) => m.text).join(' | ')}`);
    }
    const refErrPageErrs = probe.pageErrors.filter((err) =>
        REFERENCE_ERROR_PATTERNS.some((re) => re.test(err.message) || re.test(err.stack ?? '')),
    );
    if (refErrPageErrs.length > 0) {
        failures.push(`ReferenceError in pageerror: ${refErrPageErrs.map((e) => e.message).join(' | ')}`);
    }

    // 3. Zero hydration mismatch warnings in console
    const hydrationMismatch = probe.consoleMessages.filter((m) =>
        HYDRATION_MISMATCH_PATTERNS.some((re) => re.test(m.text)),
    );
    if (hydrationMismatch.length > 0) {
        failures.push(`React hydration mismatch warnings: ${hydrationMismatch.map((m) => m.text).join(' | ')}`);
    }

    // 4. Pre-hydration HTML sanity: must contain either FOUC IIFE className
    //    pattern OR a recognizable AuthGate Branch render (spinner /
    //    LoginScreen). Sister-shape to Task 8.7 Finding V FOUC IIFE
    //    empirical signature check (`grep -c "dwellium-theme"
    //    build/client/index.html` = 1).
    const hasFoucIife = probe.preHydrationHtml.includes('dwellium-theme') ||
        probe.preHydrationHtml.includes('theme-dark') ||
        probe.preHydrationHtml.includes('theme-light');
    const hasAuthGateRender = /Validating session|Welcome|Sign in|Tenant/i.test(probe.preHydrationHtml);
    if (!hasFoucIife && !hasAuthGateRender) {
        failures.push('Pre-hydration HTML missing both FOUC IIFE className AND AuthGate render content (sanity check)');
    }

    if (failures.length === 0) {
        log('D', 'Assertions PASS');
        return true;
    }
    fail(`${failures.length} assertion(s) failed`, failures.map((f) => `  - ${f}`).join('\n'));
    return false;
}

// ─── Phase E — Cleanup + summary ──────────────────────────────────────
async function phaseECleanup(probe, passed) {
    log('E', `Cleanup + summary (${passed ? 'PASS' : 'FAIL'})`);
    const errorCount = probe?.consoleMessages.filter((m) => m.type === 'error').length ?? 0;
    const warnCount = probe?.consoleMessages.filter((m) => m.type === 'warning').length ?? 0;
    console.log('\n─── Smoke-test summary ───');
    console.log(`Server URL          : ${SERVER_URL}`);
    console.log(`Pre-hydration status: ${probe?.preHydrationStatus ?? 'N/A'}`);
    console.log(`Pre-hydration bytes : ${probe?.preHydrationHtml.length ?? 'N/A'}`);
    console.log(`Console errors      : ${errorCount}`);
    console.log(`Console warnings    : ${warnCount}`);
    console.log(`Page errors         : ${probe?.pageErrors.length ?? 'N/A'}`);
    console.log(`Result              : ${passed ? '✓ PASS' : '✗ FAIL'}`);
    await cleanup();
}

// ─── Main ─────────────────────────────────────────────────────────────
async function main() {
    let probe = null;
    let passed = false;
    try {
        await phaseABootstrap();
        await phaseBServerStart();
        probe = await phaseCProbe();
        passed = phaseDAssertions(probe);
    } catch (err) {
        fail(err.message, err.stack);
    } finally {
        await phaseECleanup(probe, passed);
    }
    // Force exit — Node.js event loop may keep parent alive due to lingering
    // handles from spawned react-router-serve child even after cleanup (Linux
    // CI empirical signature at run 26094673300; 30-min step timeout).
    process.exit(passed && !process.exitCode ? 0 : (process.exitCode || 1));
}

main().catch((err) => {
    fail(err.message, err.stack);
    cleanup().then(() => process.exit(1));
});
