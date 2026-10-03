// Shared harness for the plan 077 probes: an in-process Vite serving this folder's pages, a
// Chromium page, and an in-memory stand-in for linkRoutes.ts BUILT-IN mode behind page.route on
// http://harness.invalid. Every request that is neither the Vite page nor that host is aborted,
// so a probe can never reach a real backend or write real data.
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const net = require('net');

const BASE = 'http://harness.invalid';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };

/** @param {{ rows?: Array<{slug:string,url:string,clicks:number,archived:number,title?:string}>, viewport?: {width:number,height:number} }} opts */
async function start(opts = {}) {
    const rows = opts.rows ?? [];
    const row = r => ({ id: r.slug, shortLink: `https://dwellium.example/l/${r.slug}`, url: r.url, key: r.slug, domain: 'dwellium', clicks: r.clicks, qrCode: '', archived: !!r.archived, expiresAt: r.expiresAt ?? null, tags: (r.tags ?? []).map(n => ({ id: n, name: n, color: '' })), comments: r.title ?? null });
    const FEATURES = opts.features ?? ['expiry', 'tags', 'timeseries']; // Phase 3 built-in capabilities ([] = an older backend)
    const clean = v => Array.isArray(v) ? [...new Set(v.map(String).map(t => t.trim()).filter(Boolean))] : undefined;
    const calls = [];
    const aborted = [];
    const state = { failNextList: 0, failBulk: false };

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
    const page = await browser.newPage({ viewport: opts.viewport ?? { width: 900, height: 700 } });
    // Every frame (incl. the print iframe) gets a print() stub; the top frame counts frames that printed.
    await page.addInitScript(() => {
        window.print = () => { try { (window.top.__printedFrames = window.top.__printedFrames || []).push(location.href); } catch { /* cross-origin */ } };
    });
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
            if (state.failNextList > 0) { state.failNextList--; return route.fulfill({ status: 503, headers: CORS, body: 'Service Unavailable' }); }
            const all = u.searchParams.get('showArchived') === 'true';
            return json(200, { success: true, mode: 'builtin', features: FEATURES, data: rows.filter(r => all || !r.archived).map(row) });
        }
        if (u.pathname === '/api/links' && method === 'POST') {
            const slug = body.key || 'rnd' + (rows.length + 1);
            if (rows.some(r => r.slug === slug)) return json(409, { success: false, error: `key "${slug}" is taken` });
            rows.unshift({ slug, url: body.url, clicks: 0, archived: 0, title: typeof body.title === 'string' ? body.title : undefined, expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : null, tags: clean(body.tagNames) ?? [] });
            return json(200, { success: true, mode: 'builtin', data: row(rows[0]) });
        }
        if (u.pathname === '/api/links/bulk' && method === 'POST') {
            // Phase 2 built-in bulk: upsert by key, re-aims + un-archives, input order.
            if (state.failBulk) return json(500, { success: false, mode: 'builtin', error: 'Link store error' });
            const links = Array.isArray(body?.links) ? body.links : [];
            if (links.length === 0 || links.length > 100) return json(400, { success: false, error: 'links must be a non-empty array of at most 100 entries' });
            const out = links.map((l, i) => {
                const slug = l.key || `rnd${rows.length + i + 1}`;
                let r = rows.find(x => x.slug === slug);
                if (r) { r.url = l.url; r.archived = 0; if (typeof l.title === 'string') r.title = l.title; }
                else { r = { slug, url: l.url, clicks: 0, archived: 0, title: l.title }; rows.push(r); }
                return row(r);
            });
            return json(200, { success: true, mode: 'builtin', data: out });
        }
        if (u.pathname === '/api/links/tags' && method === 'GET') return json(200, { success: true, mode: 'builtin', data: [...new Set(rows.flatMap(r => r.tags ?? []))].sort().map(n => ({ id: n, name: n, color: '' })) });
        if (u.pathname === '/api/links/tags' && method === 'POST') return json(200, { success: true, mode: 'builtin', data: { id: String(body.name), name: String(body.name), color: '' } });
        if (u.pathname === '/api/links/analytics') {
            const slug = u.searchParams.get('linkId');
            const r = rows.find(x => x.slug === slug);
            const today = new Date(); today.setUTCHours(0, 0, 0, 0);
            const pts = Array.from({ length: 30 }, (_, i) => ({ start: new Date(today.getTime() - (29 - i) * 86400000).toISOString(), clicks: i === 29 ? (r?.clicks ?? 0) : (i % 7 === 0 ? 2 : 0) }));
            return json(200, { success: true, mode: 'builtin', data: u.searchParams.get('groupBy') === 'count' ? { clicks: r?.clicks ?? 0 } : pts });
        }
        const m = u.pathname.match(/^\/api\/links\/([^/]+)$/);
        if (m && method === 'PATCH') {
            const r = rows.find(x => x.slug === decodeURIComponent(m[1]));
            if (!r) return json(404, { success: false, error: 'link not found' });
            if (typeof body.url === 'string') r.url = body.url;
            if (typeof body.archived === 'boolean') r.archived = body.archived ? 1 : 0;
            if ('expiresAt' in body) r.expiresAt = typeof body.expiresAt === 'string' ? body.expiresAt : null;
            if (Array.isArray(body.tagNames)) r.tags = clean(body.tagNames);
            return json(200, { success: true, mode: 'builtin', data: row(r) });
        }
        return json(404, { success: false, error: 'not in fake' });
    });

    const close = async () => { await browser.close(); await vite.close(); };
    return { page, browser, vite, PAGE, rows, calls, aborted, consoleErrors, state, close };
}

module.exports = { start, BASE };
