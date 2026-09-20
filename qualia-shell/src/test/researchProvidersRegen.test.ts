/**
 * regen-research-providers.mjs — report-only catalog-drift generator
 * (plan 062 phase 6). No network calls here: parser tests run against a
 * committed fixture README; diff tests run against small inline catalogs.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain .mjs, no type declarations
import { diffProviders, loadCatalogEntries, parseReadme } from '../../scripts/regen-research-providers.mjs';

const FIXTURE_PATH = resolve(__dirname, 'fixtures/awesome-freellm-readme.sample.md');
const fixtureReadme = readFileSync(FIXTURE_PATH, 'utf8');

describe('parseReadme', () => {
    it('parses the PERMANENT_FREE + RENEWABLE tables joined with Quick Reference', () => {
        const providers = parseReadme(fixtureReadme);
        expect(providers.map(p => p.name)).toEqual(['Groq', 'Mistral AI', 'Fixture New Provider', 'OpenRouter']);

        const groq = providers.find(p => p.name === 'Groq')!;
        expect(groq).toMatchObject({
            baseUrl: 'https://api.groq.com/openai/v1',
            getKeyUrl: 'https://console.groq.com/keys',
            creditCard: 'No',
            freeModels: 12,
            maxContext: '262K',
            tier: 'permanent',
        });
        expect(groq.modalities).toEqual(['image', 'reasoning', 'text']);

        const openrouter = providers.find(p => p.name === 'OpenRouter')!;
        expect(openrouter.tier).toBe('renewable');
        expect(openrouter.baseUrl).toBe('https://openrouter.ai/api/v1');
        expect(openrouter.creditCard).toBe('Registration');
    });

    it('is tolerant of a reordered header row (matches by header cell name, not column position)', () => {
        const reordered = `
<!-- BEGIN_PERMANENT_FREE -->
| Provider | Free Models | Credit Card? | Max Context | Modalities | Get API Key |
|---|---|---|---|---|---|
| Groq | 12 | No | 262K | text | <a href="https://console.groq.com/keys">→</a> |
<!-- END_PERMANENT_FREE -->

<!-- BEGIN_RENEWABLE -->
| Provider | Free Models | Credit Model | Max Context | Modalities | Get API Key |
|---|---|---|---|---|---|
<!-- END_RENEWABLE -->

<!-- BEGIN_QUICK_REF -->
| Credit Card? | Provider | Base URL | Get API Key |
|---|---|---|---|
| No | Groq | \`https://api.groq.com/openai/v1\` | <a href="https://console.groq.com/keys">Get Key →</a> |
<!-- END_QUICK_REF -->
`;
        const groq = parseReadme(reordered).find(p => p.name === 'Groq')!;
        expect(groq.baseUrl).toBe('https://api.groq.com/openai/v1');
        expect(groq.creditCard).toBe('No');
    });
});

describe('loadCatalogEntries', () => {
    it('extracts id/name/baseUrl from researchProviders.ts-shaped source, single-line and multi-line entries alike', () => {
        const source = `
export const RESEARCH_PROVIDERS = [
    {
        id: 'pollinations', name: 'Pollinations (free · no key)',
        baseUrl: 'https://text.pollinations.ai/openai',
        models: [ { id: 'openai', label: 'GPT-class' } ],
    },
    { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', tier: 'permanent' },
] as const;
`;
        const entries = loadCatalogEntries(source);
        expect(entries).toEqual([
            { id: 'pollinations', name: 'Pollinations (free · no key)', baseUrl: 'https://text.pollinations.ai/openai' },
            { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1' },
        ]);
    });
});

describe('diffProviders', () => {
    const catalog = [
        { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1' },
        { id: 'mistral', name: 'Mistral AI', baseUrl: 'https://api.mistral.ai/v1' },
        { id: 'legacy-provider', name: 'Legacy Provider', baseUrl: 'https://legacy.example.com/v1' },
    ];

    it('flags an added, a removed, and a changed provider correctly', () => {
        const upstream = parseReadme(fixtureReadme);
        const { added, removed, changed } = diffProviders(catalog, upstream);

        expect(added.map(p => p.name)).toEqual(['Fixture New Provider', 'OpenRouter']);
        expect(removed.map(p => p.id)).toEqual(['legacy-provider']);
        expect(changed).toHaveLength(1);
        expect(changed[0].catalog.id).toBe('mistral');
        expect(changed[0].upstream.baseUrl).toBe('https://api.mistral.ai/v2');
    });

    it('treats a trailing-slash-only baseUrl difference as unchanged', () => {
        const { changed } = diffProviders(
            [{ id: 'x', name: 'X', baseUrl: 'https://x.example.com/v1/' }],
            [{ name: 'X', baseUrl: 'https://x.example.com/v1' }],
        );
        expect(changed).toHaveLength(0);
    });
});

describe('wiring', () => {
    it('the generator script exists', () => {
        expect(existsSync(resolve(__dirname, '../../scripts/regen-research-providers.mjs'))).toBe(true);
    });

    it('package.json wires research:providers:check to the script', () => {
        const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8'));
        expect(pkg.scripts['research:providers:check']).toBe('node scripts/regen-research-providers.mjs');
    });
});
