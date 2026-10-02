// Plan 077 phase 1 — live-browser probe of the Links & QR widget in BUILT-IN mode.
// Standalone render (no shell, no login) against an in-memory fake of the built-in
// backend served through page.route. The API base is the unresolvable host
// http://harness.invalid, and every request that is neither the local Vite page nor
// that host is aborted, so this can never reach a real backend or write real data.
//
// One-time setup (the symlink is NOT committed):
//   ln -s "<main checkout>/qualia-shell/node_modules" plans/077-assets/node_modules
// Run:  node plans/077-assets/probe.cjs
//   → PASS/FAIL per check, results.json + PNGs beside this file. Vite runs in-process
//     on a free port with its dep cache in the OS temp dir (never the repo's node_modules/.vite).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');

const BASE = 'http://harness.invalid';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass: !!pass, detail: String(detail) }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

(async () => {
    // In-memory stand-in for linkRoutes.ts built-in mode (same shapes, same status codes).
    const rows = [
        { slug: 'woodland-parc-maint', url: 'https://example.com/maintenance', clicks: 12, archived: 0 },
        { slug: 'front-door', url: 'https://example.com/welcome?from=door', clicks: 0, archived: 0 },
    ];
    const row = r => ({ id: r.slug, shortLink: `https://dwellium.example/l/${r.slug}`, url: r.url, key: r.slug, domain: 'dwellium', clicks: r.clicks, qrCode: '', archived: !!r.archived, expiresAt: null, tags: [], comments: null });
    const calls = [];
    let failNextList = 0;
    const aborted = [];

    const port = await new Promise(res => { const srv = net.createServer(); srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => res(p)); }); });
    const { createServer } = await import('vite');
    const vite = await createServer({
        configFile: false, root: __dirname, logLevel: 'error', appType: 'mpa',
        cacheDir: path.join(os.tmpdir(), 'dwellium-077-probe-vite'),
        esbuild: { jsx: 'automatic' },
        define: { 'import.meta.env.VITE_API_URL': JSON.stringify(BASE) },
        server: { port, strictPort: true, host: '127.0.0.1', fs: { strict: false } },
    });
    await vite.listen();
    const PAGE = `http://127.0.0.1:${port}`;

    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    const consoleErrors = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));

    await page.route('**/*', async route => {
        const req = route.request();
        const url = req.url();
        if (url.startsWith(PAGE)) return route.continue();
        if (!url.startsWith(BASE)) { aborted.push(url); return route.abort(); } // nothing real is ever contacted
        const method = req.method();
        if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
        const u = new URL(url);
        const body = req.postData() ? JSON.parse(req.postData()) : undefined;
        calls.push({ method, path: u.pathname + u.search, body });
        const json = (status, b) => route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(b) });
        if (u.pathname === '/api/links' && method === 'GET') {
            if (failNextList > 0) { failNextList--; return route.fulfill({ status: 503, headers: CORS, body: 'Service Unavailable' }); }
            const all = u.searchParams.get('showArchived') === 'true';
            return json(200, { success: true, mode: 'builtin', data: rows.filter(r => all || !r.archived).map(row) });
        }
        if (u.pathname === '/api/links' && method === 'POST') {
            const slug = body.key || 'rnd' + (rows.length + 1);
            if (rows.some(r => r.slug === slug)) return json(409, { success: false, error: `key "${slug}" is taken` });
            rows.unshift({ slug, url: body.url, clicks: 0, archived: 0 });
            return json(200, { success: true, mode: 'builtin', data: row(rows[0]) });
        }
        if (u.pathname === '/api/links/bulk') return json(501, { success: false, mode: 'builtin', error: 'Bulk create needs Dub' });
        const m = u.pathname.match(/^\/api\/links\/([^/]+)$/);
        if (m && method === 'PATCH') {
            const r = rows.find(x => x.slug === decodeURIComponent(m[1]));
            if (!r) return json(404, { success: false, error: 'link not found' });
            if (typeof body.url === 'string') r.url = body.url;
            if (typeof body.archived === 'boolean') r.archived = body.archived ? 1 : 0;
            return json(200, { success: true, mode: 'builtin', data: row(r) });
        }
        return json(404, { success: false, error: 'not in fake' });
    });

    await page.goto(PAGE + '/' + (process.env.SHOT_ONLY ? process.env.SHOT_ONLY.split(':')[0] : 'index.html'));
    await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
    const shot = name => page.screenshot({ path: path.join(__dirname, name), clip: { x: 0, y: 0, width: 520, height: 560 } });
    const has = async sel => (await page.locator(sel).count()) > 0;
    /** Right edge of the first match, in page px (the window is 520 wide with 16 px padding → content ends at 504). */
    const right = async sel => page.locator(sel).first().evaluate(e => Math.round(e.getBoundingClientRect().right));
    const width = async sel => page.locator(sel).first().evaluate(e => Math.round(e.getBoundingClientRect().width));

    await page.getByText('https://dwellium.example/l/front-door').waitFor({ timeout: 8000 });
    // SHOT_ONLY=before.html:before-520.png → screenshot that page (edit form open on row 2) and stop.
    if (process.env.SHOT_ONLY) {
        await page.click('[aria-label="Edit https://dwellium.example/l/front-door"]');
        await page.mouse.move(2, 600);
        await shot(process.env.SHOT_ONLY.split(':')[1]);
        await browser.close(); await vite.close(); process.exit(0);
    }
    // 1. Loads in built-in mode with the Dub-only controls absent.
    check('list renders both links', await has('text=https://dwellium.example/l/woodland-parc-maint'));
    for (const [label, sel] of [
        ['Domain select', '[aria-label="Domain"]'], ['Expires at', '[aria-label="Expires at"]'],
        ['Filter by tag', '[aria-label="Filter by tag"]'], ['New tag name', '[aria-label="New tag name"]'],
        ['Open in Dub', '[aria-label="Open in Dub"]'], ['Tags column', 'th:text-is("Tags")'],
    ]) check(`built-in hides: ${label}`, !(await has(sel)));
    check('UTM builder still offered', await has('summary:text-is("UTM builder")'));
    await page.waitForTimeout(400);
    const stray = calls.filter(c => /\/api\/links\/(tags|domains|analytics)/.test(c.path));
    check('no tags/domains/analytics requests', stray.length === 0, stray.map(c => c.path).join(', '));
    const lists0 = calls.filter(c => c.method === 'GET' && c.path === '/api/links').length;
    check('StrictMode double mount settles on a rendered list', lists0 >= 1 && await has('.short-links__table'), `list GETs: ${lists0}`);
    // Layout at the registry's 520 px minimum width.
    const shortW = await width('td.short-links__short');
    check('layout: short-link column keeps a readable width (>= 140 px)', shortW >= 140, `${shortW}px`);
    const archR = await right('[aria-label="Archive https://dwellium.example/l/front-door"]');
    check('layout: all row action buttons sit inside the window', archR <= 504, `Archive button right edge ${archR}px of 504`);
    await page.mouse.move(2, 600);
    await shot('builtin-520.png');

    // 2. Create with UTM: folded into the URL, nothing the backend would drop is sent, composer clears.
    await page.fill('[aria-label="Destination URL"]', 'https://example.com/pay');
    await page.fill('[aria-label="Custom key"]', 'pay-rent');
    await page.click('summary:text-is("UTM builder")');
    await page.fill('[aria-label="utm_source"]', 'door');
    await page.click('button:text-is("Create link")');
    await page.getByText('https://dwellium.example/l/pay-rent').first().waitFor();
    const post = calls.filter(c => c.method === 'POST').pop();
    check('create body is exactly {url with utm, key}', JSON.stringify(Object.keys(post.body).sort()) === '["key","url"]' && post.body.url === 'https://example.com/pay?utm_source=door', JSON.stringify(post.body));
    check('composer cleared after a successful create', (await page.inputValue('[aria-label="Destination URL"]')) === '');

    // 3. A preset click keeps typed composer text AND an open edit with its typed value.
    await page.fill('[aria-label="Destination URL"]', 'https://example.com/half-typed');
    await page.click('[aria-label="Edit https://dwellium.example/l/front-door"]');
    await page.fill('[aria-label="Edit destination URL"]', 'https://example.com/welcome-v2');
    check('built-in edit form offers the URL only', !(await has('[aria-label="Edit key"]')) && !(await has('[aria-label="Edit expiry"]')));
    const saveR = await right('.short-links__edit button:text-is("Save")');
    check('layout: the edit form and its Save button sit inside the window', saveR <= 504, `Save right edge ${saveR}px of 504`);
    const editW = await width('.short-links__edit');
    check('layout: the edit form uses the full row width (>= 400 px)', editW >= 400, `${editW}px`);
    await page.mouse.move(2, 600);
    await page.locator('.short-links__edit').scrollIntoViewIfNeeded();
    await shot('builtin-520-edit.png');
    await page.click('button:text-is("+ Rent payment")');
    await page.getByText('https://dwellium.example/l/woodland-parc-rent').first().waitFor();
    check('preset click keeps the composer draft', (await page.inputValue('[aria-label="Destination URL"]')) === 'https://example.com/half-typed');
    check('preset click keeps the open edit and its typed value', (await has('[aria-label="Edit destination URL"]')) && (await page.inputValue('[aria-label="Edit destination URL"]')) === 'https://example.com/welcome-v2');
    const presetPost = calls.filter(c => c.method === 'POST').pop();
    check('preset sends no tagNames in built-in mode', !('tagNames' in presetPost.body), JSON.stringify(presetPost.body));

    // 4. Save the edit: PATCH carries only {url}; editor closes; row shows the new destination.
    await page.click('.short-links__edit button:text-is("Save")');
    await page.locator('[aria-label="Edit destination URL"]').waitFor({ state: 'detached' });
    const patch = calls.filter(c => c.method === 'PATCH').pop();
    check('edit PATCH body is exactly {url}', JSON.stringify(patch.body) === '{"url":"https://example.com/welcome-v2"}', JSON.stringify(patch.body));
    await page.getByText('https://example.com/welcome-v2').first().waitFor();
    check('row shows the new destination', true);

    // 5. QR renders client-side and is a decodable image.
    await page.click('[aria-label="Show QR for https://dwellium.example/l/front-door"]');
    const qr = page.locator('img[alt="QR code for https://dwellium.example/l/front-door"]');
    await qr.waitFor();
    const qrInfo = await qr.evaluate(async img => { await img.decode().catch(() => {}); return { data: img.src.startsWith('data:image/svg+xml'), w: img.naturalWidth }; });
    check('row QR is a client-side image that loads', qrInfo.data && qrInfo.w > 0, JSON.stringify(qrInfo));
    const qrR = await right('img[alt="QR code for https://dwellium.example/l/front-door"]');
    check('layout: the QR image sits inside the window', qrR <= 504, `QR right edge ${qrR}px of 504`);
    await qr.scrollIntoViewIfNeeded();
    await page.mouse.move(2, 600);
    await shot('builtin-520-qr.png');

    // 6. Archive is confirm-gated and sends PATCH archived:true (never DELETE).
    await page.click('[aria-label="Archive https://dwellium.example/l/pay-rent"]');
    const confR = await right('button:text-is("Confirm archive")');
    const cancelR = await right('[aria-label="Cancel archive"]');
    check('layout: the archive confirmation sits inside the window', Math.max(confR, cancelR) <= 504, `right edges ${confR}/${cancelR}px of 504`);
    await page.mouse.move(2, 600);
    await shot('builtin-520-confirm.png');
    await page.click('button:text-is("Confirm archive")');
    await page.locator('td.short-links__short', { hasText: '/l/pay-rent' }).waitFor({ state: 'detached' }); // the row, not the 'Archived …' notice
    const arch = calls.filter(c => c.method === 'PATCH').pop();
    check('archive is PATCH {archived:true}', JSON.stringify(arch.body) === '{"archived":true}', JSON.stringify(arch.body));
    check('no DELETE request was ever sent', !calls.some(c => c.method === 'DELETE'));

    // 7. A bare 503 on refresh is the retryable error card, not the setup card; Retry recovers.
    failNextList = 1;
    await page.click('[aria-label="Refresh short links"]');
    await page.locator('[data-state="error"]').waitFor();
    check('bare 503 → "Backend unavailable" error card', (await has('[data-state="error"] h3:text-is("Backend unavailable")')) && !(await has('[data-state="needs-setup"]')));
    await page.click('button:text-is("Retry")');
    await page.locator('.short-links__table').waitFor();
    check('Retry recovers the list', await has('text=https://dwellium.example/l/front-door'));

    // 8. Door sheet: no Mint button in built-in mode.
    await page.click('[aria-label="QR door sheet"]');
    await page.locator('[aria-label="Destination pattern"]').waitFor();
    check('door sheet offers no "Mint short links" in built-in mode', !(await has('button:has-text("Mint short links")')));
    await page.mouse.move(2, 600);
    await shot('builtin-520-doorsheet.png');

    // 9. Measurements (reported, not judged here): horizontal overflow at the 520 px minimum width.
    await page.click('button:has-text("Back")').catch(() => {});
    await page.locator('.short-links__table').waitFor().catch(() => {});
    const overflow = await page.evaluate(() => { const w = document.getElementById('win'); return { scrollWidth: w.scrollWidth, clientWidth: w.clientWidth }; });
    results.push({ name: 'measure: horizontal overflow at 520px', pass: null, detail: JSON.stringify(overflow) });
    console.log('INFO  horizontal overflow at 520px', overflow);

    // The one expected console error is the browser's own line for the deliberate 503 in step 7.
    const unexpected = consoleErrors.filter(e => !/Failed to load resource/.test(e));
    check('no unexpected console errors or page errors', unexpected.length === 0, unexpected.slice(0, 3).join(' | '));
    results.push({ name: 'info: outside requests aborted', pass: null, detail: [...new Set(aborted)].join(', ') || 'none' });
    fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2));
    const failed = results.filter(r => r.pass === false).length;
    console.log(`\n${results.filter(r => r.pass === true).length} passed, ${failed} failed`);
    await browser.close();
    await vite.close();
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error('PROBE CRASHED', e); process.exit(2); });
