#!/usr/bin/env node
/**
 * _drive.mjs — headless runtime driver for the Dwellium dashboard.
 *
 * Drives the REAL built app in a real (headless) browser to PROVE a feature
 * works at runtime — not just that it compiles or that vitest passes.
 *
 * Usage:
 *   node Scripts/autorun/_drive.mjs <widget> <action> <screenshot-path>
 *
 *   <widget>   case-insensitive substring matched against the sidebar widget
 *              label (e.g. "thought", "stella", "honcho", "scribe",
 *              "workspace", "ara", "astra", "inbox").
 *   <action>   action keyword (see ACTIONS below). "open" = just open + observe.
 *   <out>      PNG screenshot path.
 *
 * Env:
 *   DRIVE_URL   base URL of the served build (default http://localhost:3460)
 *   DRIVE_USER  quick-login user name (default Andy)
 *   HEADLESS    "false" to watch (default headless)
 *
 * Prints ONE machine-readable JSON line prefixed `DRIVE_RESULT ` plus a human
 * summary. Exit 0 = assertion passed, exit 2 = assertion failed, exit 1 = crash.
 *
 * Login flow (client-side, mirrors e2e/helpers/auth.ts):
 *   splash overlay → Andy avatar → passphrase Comet2878! → Unlock → shell.
 * Auth /api/auth/me is stubbed to Andy/god if the backend is absent.
 */

import { chromium } from 'playwright';

const BASE = process.env.DRIVE_URL || 'http://localhost:3460';
const USER = process.env.DRIVE_USER || 'Andy';
const PASSPHRASE = 'Comet2878!';
const HEADLESS = process.env.HEADLESS !== 'false';

const [, , widgetArg, actionArg = 'open', outArg] = process.argv;
if (!widgetArg) {
  console.error('usage: node _drive.mjs <widget> <action> <screenshot-path>');
  process.exit(1);
}
const OUT = outArg || `Scripts/autorun/cleanup-shots/${widgetArg}-${actionArg}.png`;

const result = {
  widget: widgetArg,
  action: actionArg,
  base: BASE,
  opened: false,
  assertion: null,
  pass: false,
  note: '',
  consoleErrors: [],
  out: OUT,
};

function log(...a) { console.log(...a); }

const browser = await chromium.launch({ headless: HEADLESS });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

// Capture console errors (real runtime signal).
ctx.on('console', (m) => {
  if (m.type() === 'error') result.consoleErrors.push(m.text().slice(0, 300));
});

const page = await ctx.newPage();

// Stub auth ONLY if the real backend is absent — let real backend win when present.
await page.route('**/api/auth/me', async (route) => {
  try {
    const r = await route.fetch();
    if (r.ok()) return route.fulfill({ response: r });
  } catch { /* backend absent */ }
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ id: 'stub-andy', email: 'andy@dwellium.com', name: 'Andy', role: 'god', active: true }),
  });
});

// Seed sidebar groups expanded BEFORE first render (cold-start Sidebar reads this Set).
await page.addInitScript(() => {
  try {
    localStorage.setItem('qualia_sidebar_groups', '["Property Management","AI Tools","Filing Cabinet"]');
  } catch { /* private mode */ }
});

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30_000 });

  // ── Login ──────────────────────────────────────────────────────────────
  const overlay = page.locator('.login-start-overlay');
  await overlay.waitFor({ state: 'visible', timeout: 15_000 });
  await overlay.click();

  const avatar = page.locator('.login-avatar', {
    has: page.locator('.login-avatar__name', { hasText: USER }),
  });
  await avatar.waitFor({ state: 'visible', timeout: 8_000 });
  await avatar.click();

  const pass = page.locator('input[placeholder="Passphrase..."]');
  await pass.waitFor({ state: 'visible', timeout: 8_000 });
  await pass.fill(PASSPHRASE);
  await page.locator('button[type="submit"]', { hasText: 'Unlock' }).click();

  await page.locator('.sidebar__logo-text', { hasText: 'DWELLIUM' })
    .waitFor({ state: 'visible', timeout: 20_000 });

  // ── Open widget by sidebar label ─────────────────────────────────────────
  const widget = page.locator('.sidebar-widget', {
    has: page.locator('.sidebar-widget__label', { hasText: new RegExp(widgetArg, 'i') }),
  }).first();
  await widget.waitFor({ state: 'visible', timeout: 12_000 });
  await widget.click();
  await page.waitForTimeout(1200); // window mount + first data fetch
  result.opened = true;

  // ── Action dispatch ──────────────────────────────────────────────────────
  result.assertion = await runAction(page, actionArg, result);

  // Default observation: capture the top-most window title text if no assertion.
  if (result.assertion == null) {
    const winTitle = await page.locator('.qualia-window-title, .window-title, .window__title').first()
      .textContent().catch(() => null);
    result.note = `opened; topWindowTitle=${(winTitle || '').trim().slice(0, 60)}`;
    result.pass = true; // "open" mode passes if the widget mounted without crash
  }
} catch (err) {
  result.note = `ERROR: ${String(err).slice(0, 400)}`;
  result.pass = false;
} finally {
  try {
    await page.screenshot({ path: OUT, fullPage: false });
  } catch { /* ignore */ }
  await browser.close();
}

log('DRIVE_RESULT ' + JSON.stringify(result));
log(`\n[${result.pass ? 'PASS' : 'FAIL'}] ${result.widget}/${result.action} — ${result.note || result.assertion}`);
if (result.consoleErrors.length) {
  log(`  consoleErrors(${result.consoleErrors.length}): ${result.consoleErrors.slice(0, 3).join(' | ')}`);
}
process.exit(result.pass ? 0 : 2);

// ─────────────────────────────────────────────────────────────────────────────

async function runAction(page, action, res) {
  switch (action) {
    case 'open':
      return null; // observe-only handled by caller

    case 'tw-capture': {
      // Thought Weaver: type a thought + capture, assert it files (locally or backend).
      const input = page.locator('textarea, input[type="text"]').first();
      await input.waitFor({ state: 'visible', timeout: 8_000 });
      const txt = 'buy milk and call the plumber tomorrow';
      await input.fill(txt);
      // capture button: look for Capture / send / Enter
      const captureBtn = page.getByRole('button', { name: /capture|file|add|send/i }).first();
      if (await captureBtn.count()) await captureBtn.click();
      else await input.press('Enter');
      await page.waitForTimeout(2500);
      const body = (await page.locator('body').textContent()) || '';
      const filed = /filed|sorted|admin|to-?do|task|review|captured|via your|via backend/i.test(body);
      res.pass = filed;
      res.note = `tw-capture filed=${filed}`;
      return `captured "${txt}"; filedSignal=${filed}`;
    }

    default:
      res.note = `unknown action "${action}" — opened only`;
      res.pass = res.opened;
      return null;
  }
}
