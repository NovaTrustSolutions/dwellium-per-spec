/**
 * System-wide content search engine (spec §2.5).
 */
import { describe, it, expect } from 'vitest';
import { searchCorpus, highlightParts, type SearchDoc } from '../components/ContentSearch/searchEngine';

const docs: SearchDoc[] = [
    { id: '1', type: 'wiki', title: 'Vendor Compliance', body: 'tracking certificates of insurance', widget: 'wiki' },
    { id: '2', type: 'dump', title: 'Random note', body: 'the vendor vendor vendor appears three times', widget: 'scribe' },
    { id: '3', type: 'file', title: 'lease.md', body: 'Acme/Legal/lease.md', widget: 'file-explorer' },
];

describe('searchCorpus', () => {
    it('returns no hits for an empty query', () => {
        expect(searchCorpus('', docs)).toEqual({ hits: [], total: 0 });
        expect(searchCorpus('   ', docs)).toEqual({ hits: [], total: 0 });
    });

    it('ranks a title match above body-only matches', () => {
        const { hits } = searchCorpus('vendor', docs);
        // doc1 title "Vendor Compliance" (+5) beats doc2 body x3 (score 3)
        expect(hits[0].id).toBe('1');
        expect(hits.map((h) => h.id)).toContain('2');
    });

    it('counts body occurrences toward score', () => {
        const { hits } = searchCorpus('vendor', docs);
        const d2 = hits.find((h) => h.id === '2')!;
        expect(d2.score).toBe(3); // three "vendor" occurrences, not in title
    });

    it('builds a snippet around the match', () => {
        const { hits } = searchCorpus('insurance', docs);
        expect(hits[0].snippet.toLowerCase()).toContain('insurance');
    });

    it('matches file names', () => {
        const { hits } = searchCorpus('lease', docs);
        expect(hits.some((h) => h.type === 'file')).toBe(true);
    });

    it('matches multi-word reordered queries (A1)', () => {
        const reordered: SearchDoc[] = [
            { id: 'r1', type: 'dump', title: 'Lease terms', body: 'The deposit and the security check', widget: 'scribe' },
        ];
        const { hits } = searchCorpus('security deposit', reordered);
        expect(hits.map((h) => h.id)).toContain('r1');
    });

    it('does not match when one token is missing', () => {
        const partial: SearchDoc[] = [
            { id: 'p1', type: 'dump', title: 'Lease terms', body: 'The deposit only, no other word', widget: 'scribe' },
        ];
        const { hits } = searchCorpus('security deposit', partial);
        expect(hits).toEqual([]);
    });

    it('produces a non-empty snippet containing the match after a long İ-prefix (A2)', () => {
        const prefixed: SearchDoc[] = [
            { id: 'i1', type: 'dump', title: 'Note', body: 'İ'.repeat(100) + ' the target word appears here', widget: 'scribe' },
        ];
        const { hits } = searchCorpus('target', prefixed);
        expect(hits).toHaveLength(1);
        expect(hits[0].snippet.toLowerCase()).toContain('target');
    });

    it('caps per-token occurrence score so 50x body repetition does not outrank a title match (A3)', () => {
        const capped: SearchDoc[] = [
            { id: 'title-doc', type: 'dump', title: 'apple', body: 'unrelated text', widget: 'scribe' },
            { id: 'body-doc', type: 'dump', title: 'other', body: Array(50).fill('apple').join(' '), widget: 'scribe' },
        ];
        const { hits } = searchCorpus('apple', capped);
        expect(hits[0].id).toBe('title-doc');
    });

    it('reports total matches beyond the limit (A4)', () => {
        const many: SearchDoc[] = Array.from({ length: 200 }, (_, i) => ({
            id: `m${i}`,
            type: 'dump' as const,
            title: `Doc ${i}`,
            body: 'shared keyword here',
            widget: 'scribe',
        }));
        const { hits, total } = searchCorpus('keyword', many, 50);
        expect(hits).toHaveLength(50);
        expect(total).toBe(200);
    });
});

describe('highlightParts', () => {
    it('splits text into matched/unmatched parts', () => {
        const parts = highlightParts('the vendor list', 'vendor');
        expect(parts).toEqual([
            { text: 'the ', match: false },
            { text: 'vendor', match: true },
            { text: ' list', match: false },
        ]);
    });

    it('matches case-insensitively', () => {
        const parts = highlightParts('The VENDOR list', 'vendor');
        expect(parts.some((p) => p.match && p.text === 'VENDOR')).toBe(true);
    });

    it('keeps separate non-overlapping token matches distinct', () => {
        const parts = highlightParts('security deposit check', 'security deposit');
        const matched = parts.filter((p) => p.match).map((p) => p.text);
        expect(matched).toEqual(['security', 'deposit']);
    });

    it('merges genuinely overlapping token matches into one part', () => {
        const overlap = highlightParts('abcdef', 'abcd bcde');
        expect(overlap.filter((p) => p.match)).toEqual([{ text: 'abcde', match: true }]);
    });
});
