// Plan 077 phase 2 — door-sheet print + scan check (step 2.7), against the shared fake backend.
// 1. Enter a maintenance destination for the property, open the door sheet, paste a 30-unit
//    roster, Generate (mints 30 short links through the fake bulk upsert).
// 2. Render the page as PRINT media: a Letter PDF (pdfjs-dist reads it back: page count, every
//    unit's label and its short URL on the same page) and a full-page PNG.
// 3. Decode every QR code in that PNG with Apple's CIDetector (qr-decode/decode-all.swift) and
//    require the decoded set == the 30 short links. A code that prints too small or gets split
//    across a page would fail here, not in a unit test.
// Run from this folder:  node print-check.cjs   (needs the node_modules symlink, see probe.cjs)
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { start } = require('./harness.cjs');

const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass: !!pass, detail: String(detail) }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const UNITS = Array.from({ length: 30 }, (_, i) => `${String.fromCharCode(65 + Math.floor(i / 10))}${String(i % 10 + 1).padStart(2, '0')}`); // A01…C10

(async () => {
    const h = await start({ viewport: { width: 900, height: 900 } });
    const { page, PAGE, calls } = h;
    await page.goto(PAGE + '/index.html');
    await page.locator('[aria-label="Link presets"]').waitFor({ timeout: 10000 });

    // Destination for the first property (Woodland Parc is selected by default).
    await page.click('summary:has-text("Destinations")');
    await page.fill('[aria-label="Maintenance request destination"]', 'https://maintenance.example.com/request?unit={unit}');
    const maintBtn = page.locator('button:text-is("+ Maintenance request")');
    check('a per-unit ({unit}) destination keeps the preset disabled with the door-sheet hint', (await maintBtn.isDisabled()) && /per unit/.test(await maintBtn.getAttribute('title') ?? ''));

    // Door sheet: pattern prefilled from that destination; 30-unit roster; Generate mints.
    await page.click('[aria-label="QR door sheet"]');
    const pattern = await page.inputValue('[aria-label="Destination pattern"]');
    check('door-sheet pattern prefilled from the maintenance destination', pattern === 'https://maintenance.example.com/request?unit={unit}', pattern);
    await page.fill('[aria-label="Units"]', UNITS.join('\n'));
    await page.click('button:has-text("Generate sheet")');
    await page.locator('[data-testid="qr-door-sheet-cell"]').nth(29).waitFor({ timeout: 15000 });
    const bulk = calls.filter(c => c.path === '/api/links/bulk');
    check('Generate minted through ONE bulk call of 30 entries', bulk.length === 1 && bulk[0].body.links.length === 30, `${bulk.length} call(s)`);
    check('bulk entries carry url, key and title and no tagNames (built-in)', bulk.length === 1 && bulk[0].body.links.every(l => l.url && l.key && l.title && !('tagNames' in l)));
    const shorts = await page.locator('.qr-door-sheet__short').allTextContents();
    const expected = UNITS.map(u => `https://dwellium.example/l/woodland-parc-unit-${u.toLowerCase()}`);
    check('every cell shows its own short URL (what the code encodes)', JSON.stringify(shorts) === JSON.stringify(expected), shorts.slice(0, 2).join(', '));
    check('no fallback notice (short links were minted)', (await page.locator('.qr-door-sheet__fallback').count()) === 0);

    // Print: the widget prints a standalone document from a hidden iframe (window.print there is
    // stubbed by the harness init script). Take that document and render it as Letter PDF + PNG.
    await page.click('[aria-label="Print sheet"]');
    await page.waitForFunction(() => window.__printedFrames && window.__printedFrames.length === 1, null, { timeout: 10000 });
    const frame = page.frames().find(f => f !== page.mainFrame() && f.url().startsWith('about:srcdoc')) ?? page.frames()[1];
    const html = await frame.content();
    check('Print opens the standalone sheet document and calls print() on it once', html.includes('unit QR codes') && html.includes('<svg'));
    const doc = await h.browser.newPage({ viewport: { width: 816, height: 1056 } });
    await doc.setContent(html);
    await doc.emulateMedia({ media: 'print' });
    const pdfPath = path.join(__dirname, 'door-sheet-30.pdf');
    await doc.pdf({ path: pdfPath, format: 'Letter', printBackground: true });
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const pdfDoc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(pdfPath)), useSystemFonts: true }).promise;
    const pages = [];
    for (let i = 1; i <= pdfDoc.numPages; i++) {
        const tc = await (await pdfDoc.getPage(i)).getTextContent();
        pages.push(tc.items.map(it => it.str).join(' '));
    }
    const all = pages.join('\n');
    check('PDF has a sane page count for 30 cells', pdfDoc.numPages >= 2 && pdfDoc.numPages <= 6, `${pdfDoc.numPages} pages`);
    // pdf.js hands back glyph runs ('U|n|i|t| |A|01'), so compare with whitespace removed.
    const perPage = UNITS.every(u => pages.some(t => { const c = t.replace(/\s+/g, ''); return c.includes(`Unit${u}`) && c.includes(`/l/woodland-parc-unit-${u.toLowerCase()}`); }));
    check('each unit label and its short URL land on the SAME page (no cell split across pages)', perPage);
    check('nothing but the sheet prints (no composer / Back button text in the PDF)', !/Create link|Back|Destination pattern/.test(all));

    const pngPath = path.join(__dirname, 'door-sheet-30-print.png');
    await doc.screenshot({ path: pngPath, fullPage: true });

    // Decode every code the way a phone would see it: one cell at a time, from the print render.
    const dec = path.join(__dirname, 'qr-decode');
    try { execFileSync('swiftc', ['-O', 'decode-all.swift', '-o', 'decode-all'], { cwd: dec, stdio: 'pipe' }); } catch (e) { check('swift decoder builds', false, String(e.stderr || e)); }
    const cellDir = path.join(os.tmpdir(), 'dwellium-077-cells'); fs.mkdirSync(cellDir, { recursive: true });
    const decoded = [];
    const cellCount = await doc.locator('.cell').count();
    for (let i = 0; i < cellCount; i++) {
        const png = path.join(cellDir, `cell-${i}.png`);
        await doc.locator('.cell').nth(i).screenshot({ path: png });
        try {
            const lines = execFileSync(path.join(dec, 'decode-all'), [png], { encoding: 'utf8' }).trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
            decoded.push(lines.length === 1 ? lines[0] : { message: `(${lines.length} codes)`, w: 0 });
        } catch (e) { decoded.push({ message: 'decode error', w: 0 }); }
    }
    const got = decoded.map(d => d.message).sort();
    check('CIDetector reads exactly one code from each of the 30 printed cells', cellCount === 30 && decoded.every(d => d.w > 0), `${decoded.filter(d => d.w > 0).length}/${cellCount}`);
    check('decoded set == the 30 short links', JSON.stringify(got) === JSON.stringify([...expected].sort()), got.slice(0, 2).join(', '));
    const minW = Math.min(...decoded.map(d => d.w).filter(Boolean), Infinity);
    results.push({ name: 'measure: smallest decoded code width in the print render (px @96dpi)', pass: null, detail: String(minW) });
    console.log('INFO  smallest code', minW, 'px ≈', (minW / 96 * 25.4).toFixed(0), 'mm');
    await doc.close();

    const unexpected = h.consoleErrors.filter(e => !/Failed to load resource/.test(e));
    check('no unexpected console errors', unexpected.length === 0, unexpected.slice(0, 2).join(' | '));
    fs.writeFileSync(path.join(__dirname, 'results-print.json'), JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2));
    const failed = results.filter(r => r.pass === false).length;
    console.log(`\n${results.filter(r => r.pass === true).length} passed, ${failed} failed`);
    await h.close();
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error('PRINT CHECK CRASHED', e); process.exit(2); });
