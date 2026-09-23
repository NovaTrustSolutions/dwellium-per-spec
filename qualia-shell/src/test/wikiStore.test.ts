/**
 * Three-Tier Wiki store + parse helpers (spec §7.2).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    wikiStore, wikiUserIdHolder, getWikiPage, setWikiPage,
    parseWikiResponse, outlinePage,
    sanitizeWikiPage, sanitizeWikiMap, mergeWikiMaps, isWikiPageStale, attachWikiCrossTabSync,
} from '../components/Wiki/wikiStore';
import type { WikiPage } from '../components/Wiki/wikiStore';

const NODE = { path: 'Acme/Renovation/Permits', tier: 'thread', name: 'Permits' };
const NOW = new Date('2026-06-04T12:00:00.000Z');

beforeEach(() => {
    localStorage.clear();
    wikiStore.reset();
    wikiUserIdHolder.current = null;
});

describe('parseWikiResponse', () => {
    it('parses clean JSON', () => {
        const raw = JSON.stringify({ overview: 'Permit tracking thread.', concepts: ['COI', 'inspection'], openQuestions: ['When does the permit expire?'], sources: ['a.md'] });
        const p = parseWikiResponse(raw, NODE, ['a.md', 'b.md'], NOW)!;
        expect(p.overview).toBe('Permit tracking thread.');
        expect(p.concepts).toEqual(['COI', 'inspection']);
        expect(p.openQuestions.length).toBe(1);
        expect(p.compiledBy).toBe('llm');
        expect(p.tier).toBe('thread');
    });

    it('strips ```json fences', () => {
        const raw = '```json\n{"overview":"X","concepts":[],"openQuestions":[]}\n```';
        const p = parseWikiResponse(raw, NODE, [], NOW)!;
        expect(p.overview).toBe('X');
    });

    it('falls back to provided sources when LLM omits them', () => {
        const raw = JSON.stringify({ overview: 'X' });
        const p = parseWikiResponse(raw, NODE, ['s1.md'], NOW)!;
        expect(p.sources).toEqual(['s1.md']);
    });

    it('returns null on garbage or empty content', () => {
        expect(parseWikiResponse('not json', NODE, [], NOW)).toBeNull();
        expect(parseWikiResponse(JSON.stringify({ overview: '', concepts: [], openQuestions: [] }), NODE, [], NOW)).toBeNull();
    });

    it('never lets the LLM introduce a source path outside the real list', () => {
        const raw = JSON.stringify({ overview: 'X', sources: ['a.md', 'hallucinated.md', 'a.md'] });
        const p = parseWikiResponse(raw, NODE, ['a.md', 'b.md'], NOW)!;
        expect(p.sources).toEqual(['a.md']);
    });

    it('falls back to the deduped real source list when the LLM sources do not intersect', () => {
        const raw = JSON.stringify({ overview: 'X', sources: ['nope.md'] });
        const p = parseWikiResponse(raw, NODE, ['a.md', 'a.md', 'b.md'], NOW)!;
        expect(p.sources).toEqual(['a.md', 'b.md']);
    });
});

describe('sanitizeWikiPage', () => {
    it('accepts a well-formed page and defaults compiledBy', () => {
        const p = sanitizeWikiPage({ path: NODE.path, name: NODE.name, sources: ['a.md'] })!;
        expect(p.compiledBy).toBe('outline');
        expect(p.sources).toEqual(['a.md']);
    });

    it('coerces non-string array entries away', () => {
        const p = sanitizeWikiPage({ path: 'x', name: 'X', concepts: ['ok', 5, null] })!;
        expect(p.concepts).toEqual(['ok']);
    });

    it('rejects missing/invalid path or name', () => {
        expect(sanitizeWikiPage({ name: 'X' })).toBeNull();
        expect(sanitizeWikiPage({ path: 'x' })).toBeNull();
        expect(sanitizeWikiPage(null)).toBeNull();
        expect(sanitizeWikiPage('nope')).toBeNull();
        expect(sanitizeWikiPage({ path: '', name: 'X' })).toBeNull();
    });
});

describe('sanitizeWikiMap', () => {
    it('keys valid pages by their own path and drops invalid entries', () => {
        const raw = {
            junkKey: { path: 'real/path', name: 'Real' },
            other: { name: 'no path' },
            garbage: 'nope',
        };
        const map = sanitizeWikiMap(raw);
        expect(Object.keys(map)).toEqual(['real/path']);
        expect(map['real/path'].name).toBe('Real');
    });

    it('returns {} for non-objects', () => {
        expect(sanitizeWikiMap(null)).toEqual({});
        expect(sanitizeWikiMap([1, 2])).toEqual({});
        expect(sanitizeWikiMap('nope')).toEqual({});
    });
});

describe('mergeWikiMaps', () => {
    const older: WikiPage = { ...outlinePage(NODE, ['a.md'], new Date('2026-01-01T00:00:00.000Z')) };
    const newer: WikiPage = { ...outlinePage(NODE, ['a.md', 'b.md'], new Date('2026-02-01T00:00:00.000Z')) };

    it('unions distinct paths', () => {
        const merged = mergeWikiMaps({ [older.path]: older }, { other: { ...older, path: 'other' } });
        expect(Object.keys(merged).sort()).toEqual(['other', older.path].sort());
    });

    it('newer compiledAt wins regardless of side', () => {
        expect(mergeWikiMaps({ [older.path]: older }, { [older.path]: newer })[older.path]).toBe(newer);
        expect(mergeWikiMaps({ [older.path]: newer }, { [older.path]: older })[older.path]).toBe(newer);
    });

    it('an exact compiledAt tie favors b', () => {
        const b = { ...older };
        expect(mergeWikiMaps({ [older.path]: older }, { [older.path]: b })[older.path]).toBe(b);
    });
});

describe('isWikiPageStale', () => {
    const compiled = outlinePage(NODE, ['a.md', 'b.md'], new Date('2026-02-01T00:00:00.000Z'));

    it('is not stale when source set matches and nothing changed since', () => {
        expect(isWikiPageStale(compiled, [
            { path: 'a.md', modified: '2026-01-01T00:00:00.000Z' },
            { path: 'b.md', modified: '2026-01-15T00:00:00.000Z' },
        ])).toBe(false);
    });

    it('is stale when the current source set differs', () => {
        expect(isWikiPageStale(compiled, [{ path: 'a.md' }])).toBe(true);
        expect(isWikiPageStale(compiled, [{ path: 'a.md' }, { path: 'b.md' }, { path: 'c.md' }])).toBe(true);
    });

    it('is stale when a current source was modified after compiledAt', () => {
        expect(isWikiPageStale(compiled, [
            { path: 'a.md', modified: '2026-03-01T00:00:00.000Z' },
            { path: 'b.md' },
        ])).toBe(true);
    });

    it('ignores missing or unparsable modified values', () => {
        expect(isWikiPageStale(compiled, [
            { path: 'a.md', modified: 'not-a-date' },
            { path: 'b.md' },
        ])).toBe(false);
    });
});

describe('isWikiPageStale with inputs (LLM cited a subset)', () => {
    it('is fresh when the LLM cited 1 of 2 inputs and nothing changed', () => {
        const page = parseWikiResponse(
            JSON.stringify({ overview: 'x', sources: ['a.md'] }),
            { path: '/n', tier: 'thread', name: 'n' }, ['a.md', 'b.md'], new Date('2026-01-02T00:00:00Z'),
        )!;
        expect(page.sources).toEqual(['a.md']);
        expect(page.inputs).toEqual(['a.md', 'b.md']);
        expect(isWikiPageStale(page, [{ path: 'a.md', modified: '2026-01-01T00:00:00Z' }, { path: 'b.md' }])).toBe(false);
        expect(isWikiPageStale(page, [{ path: 'a.md' }, { path: 'b.md' }, { path: 'c.md' }])).toBe(true);
    });
    it('sanitize keeps inputs', () => {
        expect(sanitizeWikiPage({ path: '/p', name: 'p', inputs: ['a', 1] })?.inputs).toEqual(['a']);
    });
});

describe('outlinePage', () => {
    it('builds a structure-only page from sources', () => {
        const p = outlinePage(NODE, ['a.md', 'b.md'], NOW);
        expect(p.compiledBy).toBe('outline');
        expect(p.overview).toBe('');
        expect(p.sources).toEqual(['a.md', 'b.md']);
    });
});

describe('wikiStore persistence', () => {
    it('stores + reads a page per-user and survives reset', () => {
        wikiUserIdHolder.current = 'andy';
        setWikiPage(outlinePage(NODE, ['a.md'], NOW));
        expect(localStorage.getItem('dwellium:wiki:andy')).toBeTruthy();
        wikiStore.reset();
        expect(getWikiPage(wikiStore.getSnapshot(), NODE.path)?.name).toBe('Permits');
    });

    it('isolates pages per user', () => {
        wikiUserIdHolder.current = 'andy';
        setWikiPage(outlinePage(NODE, [], NOW));
        wikiUserIdHolder.current = 'lisa';
        wikiStore.reset();
        expect(getWikiPage(wikiStore.getSnapshot(), NODE.path)).toBeNull();
    });

    it('does not drop a page another tab wrote to localStorage since our last snapshot', () => {
        wikiUserIdHolder.current = 'andy';
        const otherNode = { path: 'Acme/Renovation/Budget', tier: 'thread', name: 'Budget' };
        setWikiPage(outlinePage(NODE, ['a.md'], NOW));
        // Simulate another tab persisting a second page directly to localStorage
        // without going through this tab's in-memory wikiStore snapshot.
        const raw = JSON.parse(localStorage.getItem('dwellium:wiki:andy')!);
        raw[otherNode.path] = outlinePage(otherNode, ['budget.md'], NOW);
        localStorage.setItem('dwellium:wiki:andy', JSON.stringify(raw));

        setWikiPage(outlinePage(NODE, ['a.md', 'a2.md'], new Date('2026-06-04T13:00:00.000Z')));

        const stored = JSON.parse(localStorage.getItem('dwellium:wiki:andy')!);
        expect(stored[otherNode.path]?.name).toBe('Budget');
        expect(stored[NODE.path]?.sources).toEqual(['a.md', 'a2.md']);
    });
});

describe('attachWikiCrossTabSync', () => {
    it('merges an incoming storage event into the store without dropping the local page', () => {
        wikiUserIdHolder.current = 'andy';
        setWikiPage(outlinePage(NODE, ['a.md'], NOW));

        const unsubscribe = attachWikiCrossTabSync();
        try {
            const otherNode = { path: 'Acme/Renovation/Budget', tier: 'thread', name: 'Budget' };
            const incomingMap = { [otherNode.path]: outlinePage(otherNode, ['budget.md'], NOW) };
            localStorage.setItem('dwellium:wiki:andy', JSON.stringify(incomingMap));
            window.dispatchEvent(new StorageEvent('storage', {
                key: 'dwellium:wiki:andy',
                newValue: JSON.stringify(incomingMap),
            }));

            const snap = wikiStore.getSnapshot();
            expect(getWikiPage(snap, NODE.path)?.name).toBe('Permits');
            expect(getWikiPage(snap, otherNode.path)?.name).toBe('Budget');
        } finally {
            unsubscribe();
        }
    });

    it('ignores storage events for a different key', () => {
        wikiUserIdHolder.current = 'andy';
        setWikiPage(outlinePage(NODE, ['a.md'], NOW));
        const before = wikiStore.getSnapshot();

        const unsubscribe = attachWikiCrossTabSync();
        try {
            window.dispatchEvent(new StorageEvent('storage', {
                key: 'some-other-key',
                newValue: JSON.stringify({ ignored: outlinePage(NODE, [], NOW) }),
            }));
            expect(wikiStore.getSnapshot()).toBe(before);
        } finally {
            unsubscribe();
        }
    });
});
