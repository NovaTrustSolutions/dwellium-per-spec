/**
 * Three-Tier Wiki store + parse helpers (spec §7.2).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    wikiStore, wikiUserIdHolder, getWikiPage, setWikiPage,
    parseWikiResponse, outlinePage,
} from '../components/Wiki/wikiStore';

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
});
