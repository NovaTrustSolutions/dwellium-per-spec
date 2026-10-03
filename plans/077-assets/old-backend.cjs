// Plan 077 phase 3 — an OLDER built-in backend (no `features`) must hide expiry, tags and the sparkline.
const { start } = require('./harness.cjs');
(async () => {
    const h = await start({ features: [], rows: [{ slug: 'old-one', url: 'https://example.com/x', clicks: 3, archived: 0 }] });
    const { page, PAGE, calls } = h;
    await page.goto(PAGE + '/index.html');
    await page.getByText('https://dwellium.example/l/old-one').waitFor({ timeout: 10000 });
    await page.waitForTimeout(300);
    const has = async sel => (await page.locator(sel).count()) > 0;
    const checks = {
        'no expiry input': !(await has('[aria-label="Expires at"]')),
        'no tag filter': !(await has('[aria-label="Filter by tag"]')),
        'no Tags column': !(await has('th:text-is("Tags")')),
        'no /tags or /analytics request': !calls.some(c => /\/api\/links\/(tags|analytics)/.test(c.path)),
        'search still offered': await has('[aria-label="Search links"]'),
    };
    let failed = 0;
    for (const [k, v] of Object.entries(checks)) { console.log(`${v ? 'PASS' : 'FAIL'}  old backend: ${k}`); if (!v) failed++; }
    await h.close();
    console.log(`\n${Object.keys(checks).length - failed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASHED', e); process.exit(2); });
