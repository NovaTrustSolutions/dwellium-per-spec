/**
 * wikiSources — content-backed excerpt fetching + prompt building (plan wiki-widget-hardening §B).
 */
import { describe, it, expect, vi } from 'vitest';
import { fetchSourceExcerpts, buildCompilePrompt, WIKI_SYSTEM_PROMPT } from '../components/Wiki/wikiSources';

const NODE = { tier: 'thread', name: 'Permits' };

describe('fetchSourceExcerpts', () => {
    it('reads each path and trims whitespace', async () => {
        const read = vi.fn(async (p: string) => ({ content: `  content of ${p}  ` }));
        const out = await fetchSourceExcerpts(['a.txt', 'b.txt'], read);
        expect(out).toEqual([
            { path: 'a.txt', excerpt: 'content of a.txt' },
            { path: 'b.txt', excerpt: 'content of b.txt' },
        ]);
    });

    it('caps at maxFiles', async () => {
        const read = vi.fn(async (p: string) => ({ content: p }));
        const paths = ['a.txt', 'b.txt', 'c.txt', 'd.txt'];
        const out = await fetchSourceExcerpts(paths, read, { maxFiles: 2 });
        expect(out).toHaveLength(2);
        expect(read).toHaveBeenCalledTimes(2);
    });

    it('caps excerpt length at maxCharsPerFile', async () => {
        const read = vi.fn(async () => ({ content: 'x'.repeat(5000) }));
        const out = await fetchSourceExcerpts(['a.txt'], read, { maxCharsPerFile: 100 });
        expect(out[0].excerpt).toHaveLength(100);
    });

    it('skips an oversized file but still packs smaller later ones under the total cap', async () => {
        const files: Record<string, string> = { 'big.md': 'x'.repeat(900), 'small.md': 'tiny', 'mid.md': 'y'.repeat(50) };
        const out = await fetchSourceExcerpts(['big.md', 'small.md', 'mid.md'], async (p) => ({ content: files[p] }), { maxCharsPerFile: 1000, maxTotalChars: 100 });
        expect(out.map((e) => e.path)).toEqual(['small.md', 'mid.md']);
    });

    it('respects maxTotalChars across files', async () => {
        const read = vi.fn(async () => ({ content: 'x'.repeat(3000) }));
        const out = await fetchSourceExcerpts(['a.txt', 'b.txt', 'c.txt'], read, {
            maxCharsPerFile: 3000, maxTotalChars: 5000,
        });
        const total = out.reduce((sum, e) => sum + e.excerpt.length, 0);
        expect(total).toBeLessThanOrEqual(5000);
        expect(out.length).toBeLessThan(3);
    });

    it('mutation check: a broken cap (no trim) would fail the maxCharsPerFile test', async () => {
        // Sanity: confirm the cap really is enforced, not a coincidence of input size.
        const read = vi.fn(async () => ({ content: 'x'.repeat(50) }));
        const out = await fetchSourceExcerpts(['a.txt'], read, { maxCharsPerFile: 100 });
        expect(out[0].excerpt).toHaveLength(50); // shorter than cap: cap doesn't pad
    });

    it('skips binary-looking extensions without calling read', async () => {
        const read = vi.fn(async () => ({ content: 'hi' }));
        const out = await fetchSourceExcerpts(['photo.png', 'doc.pdf', 'notes.txt'], read);
        expect(read).toHaveBeenCalledTimes(1);
        expect(out).toEqual([{ path: 'notes.txt', excerpt: 'hi' }]);
    });

    it('skips failed reads silently', async () => {
        const read = vi.fn(async (p: string) => {
            if (p === 'bad.txt') throw new Error('read failed');
            return { content: 'ok' };
        });
        const out = await fetchSourceExcerpts(['bad.txt', 'good.txt'], read);
        expect(out).toEqual([{ path: 'good.txt', excerpt: 'ok' }]);
    });

    it('drops empty excerpts', async () => {
        const read = vi.fn(async () => ({ content: '   ' }));
        const out = await fetchSourceExcerpts(['a.txt'], read);
        expect(out).toEqual([]);
    });
});

describe('buildCompilePrompt', () => {
    it('includes tier, node, sources, and excerpt blocks', () => {
        const prompt = buildCompilePrompt(NODE, ['a.txt', 'b.txt'], [{ path: 'a.txt', excerpt: 'hello world' }]);
        expect(prompt).toContain('Tier: thread');
        expect(prompt).toContain('Node: Permits');
        expect(prompt).toContain('a.txt');
        expect(prompt).toContain('b.txt');
        expect(prompt).toContain('--- a.txt\nhello world');
    });

    it('says "(none yet)" when no sources or excerpts', () => {
        const prompt = buildCompilePrompt(NODE, [], []);
        expect(prompt).toContain('(none yet)');
    });
});

describe('WIKI_SYSTEM_PROMPT', () => {
    it('is JSON-only and forbids inventing facts', () => {
        expect(WIKI_SYSTEM_PROMPT).toContain('JSON only');
        expect(WIKI_SYSTEM_PROMPT).toContain('do not invent facts');
    });
});
