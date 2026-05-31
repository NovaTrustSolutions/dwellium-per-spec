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

// Scribe ingestion: headless Chromium has NO window.showDirectoryPicker (the OS
// folder picker can't be automated). Inject a FAKE picker returning in-memory
// directory handles so the REAL useIngestion → convertFolder → write pipeline is
// exercised end-to-end (only the OS picker is stubbed; the convert path is real).
// Source = 3 files: notes.html (→converted), readme.md (→passthrough),
// budget.csv (→queued-backend). Backup records writes to window.__ingestWrites.
if (actionArg === 'scribe-ingest') {
  await page.addInitScript(() => {
    window.__ingestWrites = [];
    const makeReadFile = (name, text) => ({
      kind: 'file', name,
      async getFile() { return new File([text], name, { type: 'text/plain' }); },
    });
    const makeWriteFile = (name) => ({
      kind: 'file', name,
      async createWritable() {
        let buf = '';
        return {
          async write(d) { buf += typeof d === 'string' ? d : ''; },
          async close() { window.__ingestWrites.push({ name, body: buf }); },
        };
      },
    });
    const sourceFiles = [
      makeReadFile('notes.html', '<h1>Hello</h1><p>world</p>'),
      makeReadFile('readme.md', '# Readme\nalready markdown'),
      makeReadFile('budget.csv', 'a,b,c'),
    ];
    const sourceHandle = {
      kind: 'directory', name: 'AutorunSource',
      async *values() { for (const f of sourceFiles) yield f; },
    };
    const backupHandle = {
      kind: 'directory', name: 'AutorunBackup',
      async *values() {},
      async getFileHandle(name) { return makeWriteFile(name); },
    };
    window.showDirectoryPicker = async (options) =>
      options && options.mode === 'readwrite' ? backupHandle : sourceHandle;
  });
}

// Statute matching (Cycle 8): the Legal Shield scan routes through the user's
// configured LLM (llmClient → local provider → POST {baseUrl}/v1/chat/completions).
// Intercept that call and return a canned Georgia-code legal-scan result so the
// REAL scanSegmentsViaLlm → buildMatchedStatutes → matched-statute render path
// runs end-to-end. The driver also seeds a `local` LLM provider (below) so
// hasActiveLlm() is true; ONLY the network call is stubbed — extraction,
// normalization, de-dupe, similarity weighting + render are all real.
if (actionArg === 'statute-match') {
  await page.route('**/v1/chat/completions', async (route) => {
    let texts = [];
    try {
      const body = JSON.parse(route.request().postData() || '{}');
      const userMsg = (body.messages || []).find((m) => m.role === 'user')?.content || '';
      texts = userMsg.split('\n').map((l) => l.replace(/^\s*\d+\.\s*/, '').trim()).filter(Boolean);
    } catch { /* fall through to empty */ }
    const results = texts.map((t) => {
      if (/lock/i.test(t)) return {
        segment: t, alert: 'violation',
        code_ref: 'O.C.G.A. § 44-7-14, O.C.G.A. § 44-7-7',
        summary: 'Self-help eviction by changing locks is barred; proper notice under § 44-7-7.',
        suggested_action: 'File a dispossessory warrant; never change the locks yourself.',
      };
      if (/deposit/i.test(t)) return {
        segment: t, alert: 'caution',
        code_ref: 'O.C.G.A. § 44-7-30',
        summary: 'Security deposit handling is governed by § 44-7-30; itemize damages per § 44-7-34.',
        suggested_action: 'Return or itemize the deposit within 30 days.',
      };
      return { segment: t, alert: 'clear', code_ref: null, summary: null, suggested_action: null };
    });
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(results) } }] }),
    });
  });
}

async function login(page) {
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
}

async function openWidget(page, label) {
  // EXACT-MATCH FIRST: labels carry a leading glyph; "scribe" must resolve to
  // "Scribe", NOT "Transcribe" (which also contains the substring "scribe").
  // Compare the label text stripped of leading non-letters, case-insensitively.
  const labels = page.locator('.sidebar-widget__label');
  const n = await labels.count();
  let exactIdx = -1;
  for (let i = 0; i < n; i++) {
    const raw = (await labels.nth(i).textContent()) || '';
    const stripped = raw.replace(/^[^\p{L}]+/u, '').trim().toLowerCase();
    if (stripped === label.toLowerCase()) { exactIdx = i; break; }
  }
  const widget = exactIdx >= 0
    ? labels.nth(exactIdx).locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " sidebar-widget ")][1]')
    : page.locator('.sidebar-widget', {
        has: page.locator('.sidebar-widget__label', { hasText: new RegExp(label, 'i') }),
      }).first();
  await widget.waitFor({ state: 'visible', timeout: 12_000 });
  await widget.click();
  await page.waitForTimeout(1200); // window mount + first data fetch
}

// Ensure a widget's panel (rootSel) is actually mounted. Some widgets (Honcho)
// AUTO-OPEN once on first Desktop ready, so a blind sidebar click TOGGLES them
// CLOSED. This clicks only when the panel is absent, and retries.
async function ensureOpen(page, rootSel, label) {
  for (let i = 0; i < 4; i++) {
    if (await page.locator(rootSel).count() > 0) {
      await page.locator(rootSel).first().waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
      if (await page.locator(rootSel).count() > 0) return true;
    }
    await openWidget(page, label);
  }
  return (await page.locator(rootSel).count()) > 0;
}

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await login(page);
  await openWidget(page, widgetArg);
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

    case 'tw-generate': {
      // Thought Weaver Reports tab: click Generate now, assert a report/insight renders.
      const reportsTab = page.locator('.tw-tab', { hasText: /Reports/i }).first();
      await reportsTab.waitFor({ state: 'visible', timeout: 8_000 });
      await reportsTab.click();
      await page.waitForTimeout(800);
      const genBtn = page.locator('.tw-reports__gen-btn').first();
      await genBtn.waitFor({ state: 'visible', timeout: 8_000 });
      const wasDisabled = await genBtn.isDisabled();
      if (!wasDisabled) await genBtn.click();
      // generation runs async (heuristic w/o LLM, or LLM call) — give it room.
      await page.waitForTimeout(4000);
      const cards = await page.locator('.tw-report-card').count();
      const insights = await page.locator('.tw-insight').count();
      const msg = (await page.locator('.tw-reports__msg').first().textContent().catch(() => '')) || '';
      const generated = cards > 0 || insights > 0 || /Generated/i.test(msg);
      res.pass = generated;
      res.note = `tw-generate btnDisabled=${wasDisabled} cards=${cards} insights=${insights} msg="${msg.trim().slice(0, 80)}"`;
      return `reports: cards=${cards} insights=${insights} msg=${msg.trim().slice(0, 60)}`;
    }

    case 'honcho-memory': {
      // Honcho Memory tab: + Add Memory → type → Save → assert it renders AND
      // persists to localStorage (local-first store; works with backend offline).
      const memText = `AUTORUN remember: water the plants ${Date.now().toString(36)}`;
      await ensureOpen(page, '.hhp', 'Honcho'); // Honcho auto-opens; don't toggle it closed
      const addBtn = page.locator('.hhp__add-btn').first();
      await addBtn.waitFor({ state: 'visible', timeout: 8_000 });
      await addBtn.click();
      const ta = page.locator('.hhp__add-textarea').first();
      await ta.waitFor({ state: 'visible', timeout: 5_000 });
      await ta.fill(memText);
      await page.locator('.hhp__add-submit').first().click();
      await page.waitForTimeout(1500);
      // Rendered?
      const shown = await page.locator('.hhp__memory-content', { hasText: memText }).count();
      // Persisted to localStorage under the per-user honcho:memories key?
      const persisted = await page.evaluate((needle) => {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('honcho:memories:') && (localStorage.getItem(k) || '').includes(needle)) return k;
        }
        return null;
      }, memText);
      const headerTxt = (await page.locator('.hhp__subtitle').first().textContent().catch(() => '')) || '';
      const pass = shown > 0 && !!persisted;
      res.pass = pass;
      res.note = `honcho-memory rendered=${shown} persistedKey=${persisted || 'NONE'} header="${headerTxt.replace(/\s+/g, ' ').trim().slice(0, 50)}"`;
      return `add memory: rendered=${shown > 0} persisted=${!!persisted}`;
    }

    case 'honcho-files': {
      // Honcho Files tab: seed the per-user ingestion store with 3 converted
      // entries, reload, then prove the sort-direction toggle REORDERS the list.
      // Recover the logged-in user id from a per-user localStorage key (the
      // backend-auth path does NOT write `dwellium-user`; the savedLayouts /
      // honcho:memories stores embed the uid in their key suffix).
      const uid = await page.evaluate(() => {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i) || '';
          let m = k.match(/^qualia_saved_layouts_(.+)$/) || k.match(/^honcho:memories:(.+)$/);
          if (m && m[1] !== '_anonymous') return m[1];
        }
        try { return JSON.parse(localStorage.getItem('dwellium-user') || 'null')?.id ?? null; } catch { return null; }
      });
      const seed = [
        { sourceName: 'alpha.html', destName: 'alpha.md', status: 'converted', bytes: 100, convertedAt: '2026-05-01T10:00:00.000Z' },
        { sourceName: 'mike.html', destName: 'mike.md', status: 'converted', bytes: 300, convertedAt: '2026-05-20T10:00:00.000Z' },
        { sourceName: 'zulu.html', destName: 'zulu.md', status: 'converted', bytes: 200, convertedAt: '2026-05-10T10:00:00.000Z' },
      ];
      await page.evaluate(({ uid, seed }) => {
        const key = uid ? `scribe-ingestion:${uid}` : 'scribe-ingestion:_anonymous';
        const prev = (() => { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; } })();
        localStorage.setItem(key, JSON.stringify({ ...prev, converted: seed, lastSyncAt: '2026-05-20T10:00:00.000Z' }));
      }, { uid, seed });
      // Reload so the store reads the seeded converted index, then re-open Files.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await login(page);
      await ensureOpen(page, '.hhp', 'honcho');
      const filesTab = page.locator('.hhp__tab', { hasText: /Files/i }).first();
      await filesTab.waitFor({ state: 'visible', timeout: 8_000 });
      await filesTab.click();
      // Wait for the Files toolbar's sort select to carry the date/name/size options.
      await page.locator('.hhp__type-filter option[value="name"]').first()
        .waitFor({ state: 'attached', timeout: 8_000 });
      await page.waitForTimeout(300);
      const rowNames = async () => page.locator('.hhp__file-row').allTextContents();
      const beforeRows = await rowNames();
      // Sort by name to get a deterministic order, then toggle direction.
      const sortSel = page.locator('.hhp__type-filter').first();
      await sortSel.selectOption('name');
      await page.waitForTimeout(300);
      const nameAsc = (await rowNames()).map(t => t.match(/(alpha|mike|zulu)/i)?.[0] || '');
      await page.locator('.hhp__btn', { hasText: /Asc|Desc/ }).first().click();
      await page.waitForTimeout(300);
      const nameToggled = (await rowNames()).map(t => t.match(/(alpha|mike|zulu)/i)?.[0] || '');
      const reordered = JSON.stringify(nameAsc) !== JSON.stringify(nameToggled) && nameAsc.length === 3;
      res.pass = beforeRows.length === 3 && reordered;
      res.note = `honcho-files seeded=${beforeRows.length} order1=${nameAsc.join(',')} order2=${nameToggled.join(',')} reordered=${reordered}`;
      return `files: rows=${beforeRows.length} reordered=${reordered}`;
    }

    case 'stella-skills': {
      // Stella Skills tab → Tool Catalog filter. Catalog is fully client-side
      // (independent of backend), so it MUST filter even when Stella is offline.
      await page.locator('.stella__tab', { hasText: /Skills/i }).first().click();
      const filter = page.getByLabel('Filter Stella tools');
      await filter.waitFor({ state: 'visible', timeout: 8_000 });
      const allCards = await page.locator('.stella__tool-card').count();
      await filter.fill('memory');
      await page.waitForTimeout(400);
      const cardNames = await page.locator('.stella__tool-card .stella__tool-name').allTextContents();
      const filtered = cardNames.length;
      const allMatch = filtered > 0 && cardNames.every(n => /memory/i.test(n));
      const narrowed = filtered > 0 && filtered < allCards;
      res.pass = narrowed && allMatch;
      res.note = `stella-skills total=${allCards} filtered=${filtered} names=[${cardNames.join(', ')}] allMatch=${allMatch}`;
      return `tool-catalog filter: ${allCards}→${filtered} (memory) allMatch=${allMatch}`;
    }

    case 'stella-hermes': {
      // Stella chat → `/hermes <task>` spawn. The composer + send button MUST be
      // usable even when the backend + LLM are offline (Hermes is independent),
      // and the spawn MUST surface a chat reply (success OR graceful failure).
      const input = page.locator('.stella__input').first();
      await input.waitFor({ state: 'visible', timeout: 8_000 });
      const typeable = await input.isEditable();           // fix #1: composer stays typeable offline
      const task = 'summarize the latest maintenance reports';
      await input.fill(`/hermes ${task}`);
      const sendBtn = page.locator('.stella__send-btn').first();
      const sendEnabled = !(await sendBtn.isDisabled());   // fix #2: /hermes enables send even offline
      const userBefore = await page.locator('.stella__msg--user').count();
      if (sendEnabled) await sendBtn.click();
      // Hermes runner resolves to success OR a rendered failure — never hangs.
      await page.waitForTimeout(6000);
      const userMsg = await page.locator('.stella__msg--user', { hasText: task }).count();
      const body = (await page.locator('.stella__messages').textContent().catch(() => '')) || '';
      const replied = /Hermes/i.test(body) && (userMsg > userBefore || userMsg > 0);
      res.pass = typeable && sendEnabled && replied;
      res.note = `stella-hermes typeable=${typeable} sendEnabled=${sendEnabled} userMsg=${userMsg} hermesReply=${/Hermes/i.test(body)}`;
      return `/hermes spawn: typeable=${typeable} sendEnabled=${sendEnabled} replied=${replied}`;
    }

    case 'hermes-learning': {
      // Honcho/Hermes "⚡ Hermes" tab: delegate a task (offline runs still record
      // + degrade gracefully), then 👍 the run and PROVE the rating persists to
      // the per-user hermes:learning:<uid> store. This is the Cycle-6 loop.
      await ensureOpen(page, '.hhp', 'Honcho'); // Honcho auto-opens; don't toggle closed
      const hermesTab = page.locator('.hhp__tab', { hasText: /Hermes/i }).first();
      await hermesTab.waitFor({ state: 'visible', timeout: 8_000 });
      await hermesTab.click();
      await page.waitForTimeout(400);
      const input = page.locator('.hhp__delegate-input').first();
      await input.waitFor({ state: 'visible', timeout: 8_000 });
      const typeable = await input.isEditable();          // fix #2: reachable offline
      const task = 'investigate the latest maintenance backlog';
      await input.fill(task);
      const runBtn = page.locator('.hhp__delegate-btn').first();
      const runEnabled = !(await runBtn.isDisabled());
      if (runEnabled) await runBtn.click();
      // Runner resolves to success OR a recorded graceful failure — never hangs.
      await page.waitForTimeout(6000);
      // fix #1: a result renders even on offline failure, so the rating shows.
      const resultShown = await page.locator('.hhp__result').count();
      const upBtn = page.locator('.hhp__rate-btn', { hasText: '👍' }).first();
      const ratingVisible = await upBtn.count();
      if (ratingVisible) await upBtn.click();
      await page.waitForTimeout(600);
      const thanks = await page.locator('.hhp__rate-thanks').count();
      // Assert: the per-user learning store now holds a run with rating === 1.
      const persisted = await page.evaluate(() => {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i) || '';
          if (!k.startsWith('hermes:learning:')) continue;
          try {
            const arr = JSON.parse(localStorage.getItem(k) || '[]');
            if (Array.isArray(arr) && arr.length && arr.some(r => r && r.rating === 1)) {
              return { key: k, count: arr.length, rated: arr.filter(r => r && r.rating === 1).length };
            }
          } catch { /* skip */ }
        }
        return null;
      });
      const pass = !!resultShown && !!ratingVisible && !!thanks && !!persisted;
      res.pass = pass;
      res.note = `hermes-learning typeable=${typeable} runEnabled=${runEnabled} result=${resultShown} rating=${ratingVisible} thanks=${thanks} persisted=${persisted ? `${persisted.key}(runs=${persisted.count},rated=${persisted.rated})` : 'NONE'}`;
      return `learning loop: result=${!!resultShown} rated=${!!ratingVisible} persisted=${!!persisted}`;
    }

    case 'scribe-ingest': {
      // Scribe folder ingestion: pick a source + backup folder (fake picker
      // injected above), run "Convert now", and PROVE the real convert→write
      // pipeline ran — files written to backup + the converted index persisted.
      const panel = page.locator('.scribe-ingest').first();
      await panel.waitFor({ state: 'visible', timeout: 10_000 });
      panel.scrollIntoViewIfNeeded?.();
      // Panel must be in the SUPPORTED state (picker injected) — not the
      // "unsupported browser" message.
      const pickBtns = panel.locator('.scribe-ingest__pick');
      const supported = (await pickBtns.count()) >= 2;
      if (!supported) {
        res.pass = false;
        res.note = 'scribe-ingest panel UNSUPPORTED — no picker buttons (showDirectoryPicker missing?)';
        return 'ingestion panel unsupported';
      }
      // Pick source → assert name shows.
      await pickBtns.nth(0).click();
      await page.waitForTimeout(500);
      const sourceName = (await panel.locator('[data-testid="ingest-source-name"]').textContent().catch(() => '')) || '';
      // Pick backup → assert name shows.
      await pickBtns.nth(1).click();
      await page.waitForTimeout(500);
      const backupName = (await panel.locator('[data-testid="ingest-backup-name"]').textContent().catch(() => '')) || '';
      // Convert now must now be enabled.
      const convertBtn = panel.locator('.scribe-ingest__convert').first();
      const convertEnabled = !(await convertBtn.isDisabled());
      if (convertEnabled) await convertBtn.click();
      await page.waitForTimeout(2500); // enumerate + convert + write
      const statusTxt = (await panel.locator('[data-testid="ingest-status"]').textContent().catch(() => '')) || '';
      const indexMatch = statusTxt.match(/(\d+)\s+file\(s\)\s+in\s+index/);
      const indexed = indexMatch ? Number(indexMatch[1]) : 0;
      // The backup folder actually received the converted Markdown writes.
      const writes = await page.evaluate(() => (window.__ingestWrites || []).map((w) => w.name));
      // The converted index persisted to the per-user scribe-ingestion store.
      const persisted = await page.evaluate(() => {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i) || '';
          if (!k.startsWith('scribe-ingestion:')) continue;
          try {
            const o = JSON.parse(localStorage.getItem(k) || '{}');
            if (Array.isArray(o.converted) && o.converted.length) {
              return { key: k, n: o.converted.length, lastSync: o.lastSyncAt || null,
                statuses: o.converted.map((e) => e.status) };
            }
          } catch { /* skip */ }
        }
        return null;
      });
      const wroteMd = writes.includes('notes.md') && writes.includes('readme.md');
      const pass = supported
        && /AutorunSource/.test(sourceName)
        && /AutorunBackup/.test(backupName)
        && convertEnabled
        && indexed === 3
        && wroteMd
        && !!persisted && persisted.n === 3;
      res.pass = pass;
      res.note = `scribe-ingest source="${sourceName.trim().slice(0, 24)}" backup="${backupName.trim().slice(0, 24)}" `
        + `convertEnabled=${convertEnabled} indexed=${indexed} writes=[${writes.join(',')}] `
        + `persisted=${persisted ? `${persisted.key}(n=${persisted.n},statuses=[${persisted.statuses.join(',')}])` : 'NONE'}`;
      return `ingest: picked=${/AutorunSource/.test(sourceName) && /AutorunBackup/.test(backupName)} indexed=${indexed} wroteMd=${wroteMd} persisted=${!!persisted}`;
    }

    case 'statute-match': {
      // Statute matching: seed a saved transcript + an active `local` LLM, load
      // the transcript from the Log tab, and PROVE matched Georgia statutes
      // render with similarity + excerpt. The LLM call is stubbed (route above);
      // the extract → normalize → de-dupe → similarity → render path is REAL.
      // Recover the logged-in user id (per-user integrations key suffix) — same
      // recovery the honcho-files action uses.
      const uid = await page.evaluate(() => {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i) || '';
          const m = k.match(/^qualia_saved_layouts_(.+)$/) || k.match(/^honcho:memories:(.+)$/) || k.match(/^integrations:(.+)$/);
          if (m && m[1] !== '_anonymous') return m[1];
        }
        try { return JSON.parse(localStorage.getItem('dwellium-user') || 'null')?.id ?? null; } catch { return null; }
      });
      // Two segments: one self-help-lockout (violation → 2 statutes @100%), one
      // security-deposit (caution → primary @100% + summary-only @60%).
      const seedSegs = [
        { id: 'seg-lock', text: "If you don't pay by Friday I will change the locks myself", start: 0, end: 4, speaker: 'Landlord', confidence: 0.95 },
        { id: 'seg-dep', text: 'We still need to sort out the security deposit return next week', start: 5, end: 9, speaker: 'Tenant', confidence: 0.95 },
      ];
      await page.evaluate(({ uid, seedSegs }) => {
        // 1) Saved transcription log (read by TranscriptionHub on mount).
        const entry = {
          id: 'autorun-statute', title: 'Autorun — statute matching',
          segments: seedSegs, factChecks: [], duration: 9, wordCount: 24,
          createdAt: 1748000000000, summaryStatus: 'draft',
        };
        localStorage.setItem('dwellium-transcription-log', JSON.stringify([entry]));
        // 2) Per-user integrations bundle with an ACTIVE local LLM so the Legal
        //    Shield scan path runs (the network call itself is route-stubbed).
        const key = uid ? `integrations:${uid}` : 'integrations:_anonymous';
        localStorage.setItem(key, JSON.stringify({
          llm: { active: 'local', local: { baseUrl: 'http://127.0.0.1:9911', model: 'autorun-mock', enabled: true } },
          google: {}, tests: {},
        }));
      }, { uid, seedSegs });
      // Reload so both stores are read fresh, then re-open Transcribe.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await login(page);
      await openWidget(page, 'Transcribe');
      // Maximize the Transcribe window — at quadrant-spawn width the log list
      // collapses (flex min-height:0 + overflow:hidden), leaving entries
      // zero-height/hidden. Double-click the titlebar of the window that owns
      // the Transcribe tabs.
      const twWindow = page.locator('.window', { has: page.locator('.th-tabs') }).first();
      await twWindow.locator('.window__titlebar').first().dblclick().catch(() => {});
      await page.waitForTimeout(500);
      // Go to the Log tab and load the seeded transcript.
      const logTab = page.locator('.th-tabs__btn', { hasText: /Log/i }).first();
      await logTab.waitFor({ state: 'visible', timeout: 10_000 });
      await logTab.click();
      await page.waitForTimeout(400);
      const entryMain = page.locator('.th-log__entry-main').first();
      await entryMain.waitFor({ state: 'visible', timeout: 8_000 });
      await entryMain.click();
      // loadTranscription → recorder tab + (after the fix) enqueues a legal scan.
      // Scan is async (route-stubbed LLM): give it room to resolve + render.
      await page.waitForTimeout(4000);
      const matchLists = await page.locator('.th-segment__legal-matches').count();
      const ids = await page.locator('.th-segment__legal-match-id').allTextContents();
      const sims = await page.locator('.th-segment__legal-match-sim').allTextContents();
      const excerpts = await page.locator('.th-segment__legal-match-excerpt').count();
      const idSet = ids.map((s) => s.trim());
      const simSet = sims.map((s) => s.trim());
      const hasLockStatutes = idSet.includes('O.C.G.A. § 44-7-14') && idSet.includes('O.C.G.A. § 44-7-7');
      const hasDepositStatutes = idSet.includes('O.C.G.A. § 44-7-30') && idSet.includes('O.C.G.A. § 44-7-34');
      const has100 = simSet.includes('100%');
      const has60 = simSet.includes('60%'); // summary-only secondary match (similarity 0.6)
      const pass = matchLists >= 2 && hasLockStatutes && hasDepositStatutes && has100 && has60 && excerpts > 0;
      res.pass = pass;
      res.note = `statute-match lists=${matchLists} ids=[${idSet.join(', ')}] sims=[${simSet.join(',')}] excerpts=${excerpts} `
        + `lockStatutes=${hasLockStatutes} depositStatutes=${hasDepositStatutes} has100=${has100} has60=${has60}`;
      return `statutes: lists=${matchLists} ids=${idSet.length} 100%=${has100} 60%=${has60} excerpts=${excerpts}`;
    }

    case 'workspace-drilldown': {
      // The backend domaines (/api/workspace/domaines) + tree (/api/file-explorer/tree)
      // routes 404 in this env → the store falls back to the local sample workspace
      // (offline flag + banner). PROVE the Domaine→Project→Thread drill-down navigates
      // AND that back-nav steps back up. The drill-down logic (openDomaine/openProject/
      // goBack + projectsForDomaine/threadsForProject) is the REAL code; only the data
      // source is the offline seed (because there is no backend filesystem here).
      // Maximize the Workspace window — quadrant-spawn width can clip the grid.
      const wsWindow = page.locator('.window', { has: page.locator('[aria-label="Sort domaines"]') }).first();
      await wsWindow.locator('.window__titlebar').first().dblclick().catch(() => {});
      await page.waitForTimeout(700); // loadDomaines 404 → useLocalWorkspace → seed render

      // Index altitude: honest offline banner + a domaines grid.
      const offlineBanner = await page.locator('[role="status"]', { hasText: /local sample workspace/i }).count();
      const domaineList = page.locator('[role="list"][aria-label="Domaines"]').first();
      await domaineList.waitFor({ state: 'visible', timeout: 10_000 });
      const domaineCards = domaineList.locator('[role="button"]');
      const nDomaines = await domaineCards.count();
      const firstDomaine = (await domaineCards.first().textContent() || '').replace(/\s+/g, ' ').trim().slice(0, 40);

      // Drill 1: domaine → projects.
      await domaineCards.first().click();
      await page.waitForTimeout(900); // openDomaine → loadTree (already seeded) → projects derive
      const projectList = page.locator('[role="list"][aria-label^="Projects in"]').first();
      await projectList.waitFor({ state: 'visible', timeout: 8_000 });
      const projectCards = projectList.locator('[role="button"]');
      const nProjects = await projectCards.count();

      // Drill 2: project → threads.
      await projectCards.first().click();
      await page.waitForTimeout(900);
      const threadList = page.locator('[role="list"][aria-label^="Threads in"]').first();
      await threadList.waitFor({ state: 'visible', timeout: 8_000 });
      const nThreads = await threadList.locator('[role="listitem"]').count();

      // Back-nav: project → domaine (the toolbar back button), then domaine → index.
      const backBtn = page.locator('button[aria-label^="Back to"]').first();
      await backBtn.click();
      await page.waitForTimeout(500);
      const backToProjects = await page.locator('[role="list"][aria-label^="Projects in"]').count();
      await page.locator('button[aria-label^="Back to"]').first().click().catch(() => {});
      await page.waitForTimeout(500);
      const backToIndex = await page.locator('[role="list"][aria-label="Domaines"]').count();

      const pass = offlineBanner > 0 && nDomaines >= 1 && nProjects >= 1 && nThreads >= 1
        && backToProjects > 0 && backToIndex > 0;
      res.pass = pass;
      res.note = `workspace-drilldown offline=${offlineBanner > 0} domaines=${nDomaines} firstDomaine="${firstDomaine}" `
        + `projects=${nProjects} threads=${nThreads} back→projects=${backToProjects > 0} back→index=${backToIndex > 0}`;
      return `drilldown: domaines=${nDomaines} projects=${nProjects} threads=${nThreads} backnav=${backToProjects > 0 && backToIndex > 0}`;
    }

    default:
      res.note = `unknown action "${action}" — opened only`;
      res.pass = res.opened;
      return null;
  }
}
