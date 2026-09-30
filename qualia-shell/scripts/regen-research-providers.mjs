#!/usr/bin/env node
/**
 * regen-research-providers — the generator src/data/researchProviders.ts's
 * header promises and never had (plan 062 phase 6).
 *
 * REPORT-ONLY. Fetches the upstream README (or reads a local copy via
 * `--file <path>`), parses the PERMANENT_FREE + RENEWABLE provider tables
 * and the "Quick Reference — Base URLs & API Keys" table, diffs the result
 * against the committed catalog, and prints ADDED / REMOVED / CHANGED to
 * stdout. It never writes src/data/researchProviders.ts — the committed set
 * is the CORS-verified subset, and every addition needs a live preflight
 * (OPTIONS <baseUrl>/chat/completions, Origin https://argyleholocron.netlify.app)
 * before it can ship.
 *
 * Usage:
 *   node scripts/regen-research-providers.mjs                 # live upstream
 *   node scripts/regen-research-providers.mjs --file <path>   # local README
 *
 * npm script: `npm run research:providers:check`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const UPSTREAM_README_URL =
    'https://raw.githubusercontent.com/NovaTrustSolutions/awesome-freellm-apis/main/README.md';

/** Providers deliberately excluded from the catalog — see researchProviders.ts header. */
const STANDING_EXCLUSIONS = [
    'nvidia-nim', 'sambanova', 'kilo-code', 'ollama-cloud', 'opencode-zen',
    'github-models', 'glhf-chat', 'cloudflare-workers-ai', 'cline', 'grok-xai',
];

/** Catalog rows that diverge from upstream on purpose — not drift. */
const KNOWN_DEVIATIONS = [
    "google-gemini — catalog uses Google's OpenAI-compat endpoint, not the README's native v1beta base",
    'pollinations — manual keyless addition (2026-08-31), not sourced from the upstream tables',
];

// ---------------------------------------------------------------------------
// Markdown table parsing — tolerant: matched by header cell name, not column
// position, so a reordered upstream column doesn't silently misparse.
// ---------------------------------------------------------------------------

function splitRow(line) {
    return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
}

/** A markdown table's data rows as objects keyed by header cell text. */
function parseMarkdownTable(block) {
    const lines = block.split('\n').map(l => l.trim()).filter(l => l.startsWith('|'));
    if (lines.length < 2) return [];
    const header = splitRow(lines[0]);
    const dataLines = lines.slice(1).filter(l => !/^\|[\s:|-]+\|$/.test(l));
    return dataLines.map(line => {
        const cells = splitRow(line);
        const row = {};
        header.forEach((h, i) => { row[h] = cells[i] ?? ''; });
        return row;
    });
}

function extractSection(md, beginMarker, endMarker) {
    const start = md.indexOf(beginMarker);
    const end = md.indexOf(endMarker);
    if (start === -1 || end === -1 || end <= start) return null;
    return md.slice(start + beginMarker.length, end);
}

/** Fallback when the HTML-comment markers are gone: find any table whose
 * header row carries every required cell name. */
function findTableByHeader(md, requiredHeaders) {
    const blocks = md.match(/(?:^\|.*\|[ \t]*$\n?)+/gm) ?? [];
    for (const block of blocks) {
        const rows = parseMarkdownTable(block);
        if (rows.length && requiredHeaders.every(h => h in rows[0])) return rows;
    }
    return [];
}

function tableRows(md, beginMarker, endMarker, requiredHeaders) {
    const section = extractSection(md, beginMarker, endMarker);
    return section ? parseMarkdownTable(section) : findTableByHeader(md, requiredHeaders);
}

const hrefOf = cell => cell?.match(/href="([^"]*)"/)?.[1] ?? '';
const backtickOf = cell => cell?.match(/`([^`]*)`/)?.[1] ?? (cell ?? '').trim();

/**
 * Parse an awesome-freellm-apis README into merged provider entries:
 * {name, baseUrl, getKeyUrl, creditCard, freeModels, maxContext, modalities, tier}.
 * baseUrl/getKeyUrl/creditCard come from the Quick Reference table (present
 * for every provider); freeModels/maxContext/modalities/tier come from the
 * PERMANENT_FREE and RENEWABLE directory tables, joined by provider name.
 */
export function parseReadme(md) {
    const directoryRow = tier => row => ({
        name: (row['Provider'] ?? '').trim(),
        freeModels: parseInt(row['Free Models'], 10) || 0,
        maxContext: (row['Max Context'] ?? '').trim(),
        modalities: (row['Modalities'] ?? '').split(',').map(m => m.trim()).filter(Boolean),
        tier,
    });

    const permanent = tableRows(md, '<!-- BEGIN_PERMANENT_FREE -->', '<!-- END_PERMANENT_FREE -->',
        ['Provider', 'Free Models', 'Credit Card?']).map(directoryRow('permanent'));
    const renewable = tableRows(md, '<!-- BEGIN_RENEWABLE -->', '<!-- END_RENEWABLE -->',
        ['Provider', 'Free Models', 'Credit Model']).map(directoryRow('renewable'));
    const quickRef = tableRows(md, '<!-- BEGIN_QUICK_REF -->', '<!-- END_QUICK_REF -->',
        ['Provider', 'Base URL']);

    const quickRefByName = new Map(quickRef
        .filter(row => (row['Provider'] ?? '').trim())
        .map(row => [row['Provider'].trim().toLowerCase(), {
            baseUrl: backtickOf(row['Base URL']),
            getKeyUrl: hrefOf(row['Get API Key']),
            creditCard: (row['Credit Card?'] ?? '').trim(),
        }]));

    return [...permanent, ...renewable]
        .filter(p => p.name)
        .map(p => ({ ...p, ...(quickRefByName.get(p.name.toLowerCase()) ?? { baseUrl: '', getKeyUrl: '', creditCard: '' }) }));
}

// ---------------------------------------------------------------------------
// Committed catalog — read as text, extracted by regex (never imported: the
// TS module has app-only build config, and this script must run standalone).
// ---------------------------------------------------------------------------

/** Extract {id, name, baseUrl} per entry from researchProviders.ts source. */
export function loadCatalogEntries(tsSource) {
    const idNameRe = /id:\s*'([^']+)'\s*,\s*name:\s*'([^']+)'/g;
    const matches = [...tsSource.matchAll(idNameRe)];
    return matches.map((m, i) => {
        const windowEnd = matches[i + 1]?.index ?? tsSource.length;
        const window = tsSource.slice(m.index + m[0].length, windowEnd);
        return { id: m[1], name: m[2], baseUrl: window.match(/baseUrl:\s*'([^']*)'/)?.[1] ?? '' };
    });
}

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

const normalizeUrl = u => (u ?? '').trim().replace(/\/$/, '');

/** Diff the committed catalog against parsed upstream entries, by name. */
export function diffProviders(catalogEntries, upstreamEntries) {
    const catalogByName = new Map(catalogEntries.map(c => [c.name.toLowerCase(), c]));
    const upstreamByName = new Map(upstreamEntries.map(u => [u.name.toLowerCase(), u]));

    const added = upstreamEntries.filter(u => !catalogByName.has(u.name.toLowerCase()));
    const removed = catalogEntries.filter(c => !upstreamByName.has(c.name.toLowerCase()));
    const changed = catalogEntries
        .filter(c => upstreamByName.has(c.name.toLowerCase()))
        .map(c => ({ catalog: c, upstream: upstreamByName.get(c.name.toLowerCase()) }))
        .filter(({ catalog, upstream }) => normalizeUrl(catalog.baseUrl) !== normalizeUrl(upstream.baseUrl));

    return { added, removed, changed };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export function formatReport({ added, removed, changed }, { catalogCount, upstreamCount }) {
    const lines = [
        'Research provider catalog drift report (report-only — never writes the catalog)',
        `Source: ${UPSTREAM_README_URL}`,
        `Upstream providers parsed: ${upstreamCount}. Catalog providers: ${catalogCount}.`,
        '',
        'Every ADDED provider below needs a live CORS preflight before it can ship:',
        '  OPTIONS <baseUrl>/chat/completions   Origin: https://argyleholocron.netlify.app',
        '',
        'Standing exclusions (kept out of the catalog on purpose):',
        `  ${STANDING_EXCLUSIONS.join(', ')}`,
        '',
        'Known deviations (not drift):',
        ...KNOWN_DEVIATIONS.map(d => `  ${d}`),
        '',
        `ADDED — upstream, not in catalog (${added.length}):`,
        ...(added.length ? added.map(p => `  + ${p.name}  (${p.baseUrl || 'no base URL'})`) : ['  (none)']),
        '',
        `REMOVED — in catalog, gone upstream (${removed.length}):`,
        ...(removed.length ? removed.map(p => `  - ${p.name} [${p.id}]`) : ['  (none)']),
        '',
        `CHANGED — baseUrl differs (${changed.length}):`,
        ...(changed.length
            ? changed.map(({ catalog, upstream }) => `  ~ ${catalog.name} [${catalog.id}]: ${catalog.baseUrl}  ->  ${upstream.baseUrl}`)
            : ['  (none)']),
    ];
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
    const fileArgIdx = process.argv.indexOf('--file');
    const readmeText = fileArgIdx !== -1
        ? readFileSync(process.argv[fileArgIdx + 1], 'utf8')
        : await fetch(UPSTREAM_README_URL).then(r => {
            if (!r.ok) throw new Error(`fetch ${UPSTREAM_README_URL} failed: ${r.status}`);
            return r.text();
        });

    const catalogPath = fileURLToPath(new URL('../src/data/researchProviders.ts', import.meta.url));
    const catalogSource = readFileSync(catalogPath, 'utf8');
    const upstream = parseReadme(readmeText);
    const catalog = loadCatalogEntries(catalogSource);
    const diff = diffProviders(catalog, upstream);

    console.log(formatReport(diff, { catalogCount: catalog.length, upstreamCount: upstream.length }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(err => {
        console.error(err);
        process.exitCode = 1;
    });
}
